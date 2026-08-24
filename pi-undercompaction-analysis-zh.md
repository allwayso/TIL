# 压缩不足(Under-Compaction)分析

> 来源:pi 仓库 git 历史 commit `10a1e1ef`(2025-12-06,"docs: add under-compaction analysis")
> 原始路径:`packages/coding-agent/docs/undercompaction.md`
> 关联 issue:#128
> 译者注:本文档分析了"自动压缩触发太晚导致上下文溢出"的问题,对比 OpenCode/Codex 的处理方式,并给出三阶段修复方案。当前实现中的 overflow 单次重试与 bash 大输出落盘即源于此。

## 问题陈述

自动压缩触发太晚,导致上下文窗口溢出,LLM 调用以 `stopReason == "length"` 失败。

## 架构概述

### 事件流

```
用户提示
    │
    ▼
agent.prompt()
    │
    ▼
agentLoop() in packages/ai/src/agent/agent-loop.ts
    │
    ├─► streamAssistantResponse()
    │       │
    │       ▼
    │   LLM provider (Anthropic, OpenAI, etc.)
    │       │
    │       ▼
    │   事件: message_start → message_update* → message_end
    │       │
    │       ▼
    │   AssistantMessage,带 usage 统计(input, output, cacheRead, cacheWrite)
    │
    ├─► 如果 assistant 有工具调用:
    │       │
    │       ▼
    │   executeToolCalls()
    │       │
    │       ├─► tool_execution_start (toolCallId, toolName, args)
    │       │
    │       ├─► tool.execute() 执行 (read, bash, write, edit, 等)
    │       │
    │       ├─► tool_execution_end (toolCallId, toolName, result, isError)
    │       │
    │       └─► message_start + message_end 生成 ToolResultMessage
    │
    └─► 循环直到没有更多工具调用
            │
            ▼
        agent_end
```

### Token 用量报告

Token 用量**只在 LLM 响应后**的 `AssistantMessage.usage` 中可用:

```typescript
// From packages/ai/src/types.ts
export interface Usage {
    input: number;      // 请求中的 token
    output: number;     // 生成的 token
    cacheRead: number;  // 读取的缓存 token
    cacheWrite: number; // 写入的缓存 token
    cost: Cost;
}
```

`input` 字段代表发送给 LLM 的总上下文大小,包括:

- 系统提示词
- 所有对话消息
- 之前所有调用的工具结果

### 当前的压缩检查

TUI(`tui-renderer.ts`)和 RPC(`main.ts`)两种模式以相同方式检查压缩:

```typescript
// In agent.subscribe() callback:
if (event.type === "message_end") {
    // ...
    if (event.message.role === "assistant") {
        await checkAutoCompaction();
    }
}

async function checkAutoCompaction() {
    // 取最后一条非中止的 assistant 消息
    const messages = agent.state.messages;
    let lastAssistant = findLastNonAbortedAssistant(messages);
    if (!lastAssistant) return;

    const contextTokens = calculateContextTokens(lastAssistant.usage);
    const contextWindow = agent.state.model.contextWindow;

    if (!shouldCompact(contextTokens, contextWindow, settings)) return;

    // 触发压缩...
}
```

**检查只在 assistant 消息的 `message_end` 时进行。**

## 压缩不足问题

### 失败场景

```
Context window: 200,000 tokens
Reserve tokens: 16,384 (默认)
Threshold: 200,000 - 16,384 = 183,616

第 N 轮:
  1. 收到 assistant 消息,usage 显示 180,000 tokens
  2. shouldCompact(180000, 200000, settings) → 180000 > 183616 → FALSE
  3. 工具执行: `cat large-file.txt` → 输出 100KB (~25,000 tokens)
  4. 上下文实际已达 205,000 tokens,但我们不知道
  5. 下一次 LLM 调用失败:超过 200,000 窗口
```

问题发生的原因:

1. 上下文低于阈值(所以压缩不触发)
2. 一个工具加入足够内容把它推过窗口上限
3. 我们只有在下次 LLM 调用失败时才发觉

### 根本原因

1. **Token 计数是回顾性的**:我们只在 LLM 处理之后才知道上下文大小
2. **工具结果是盲区**:工具执行并返回大结果时,在下一次 LLM 调用前我们不知道它增加了多少 token
3. **提交前没有估算**:我们直接提交上下文,祈祷它能装下

## 当前工具输出限制

| 工具    | 我们的限制            | 最坏情况              |
| ----- | ---------------- | ----------------- |
| bash  | 每流 10MB          | 20MB (~5M tokens) |
| read  | 2000 行 × 2000 字符 | 4MB (~1M tokens)  |
| write | 仅字节数             | 最小                |
| edit  | Diff 输出          | 可变                |

## 其他工具怎么处理

### SST/OpenCode

**工具输出限制(执行期间):**

| 工具       | 限制                 | 详情                                 |
| -------- | ------------------ | ---------------------------------- |
| bash     | 30KB 字符            | `MAX_OUTPUT_LENGTH = 30_000`,截断并提示 |
| read     | 2000 行 × 2000 字符/行 | 无总上限,理论上 4MB                       |
| grep     | 100 个匹配,2000 字符/行  | 截断并提示                              |
| ls       | 100 个文件            | 截断并提示                              |
| glob     | 100 个结果            | 截断并提示                              |
| webfetch | 5MB                | `MAX_RESPONSE_SIZE`                |

**溢出检测:**

- `isOverflow()` 在每轮**之前**运行(不是期间)
- 使用最后一次 LLM 报告的 token 数:`tokens.input + tokens.cache.read + tokens.output`
- 若 `count > context - maxOutput` 则触发
- **无法检测当前轮中工具结果造成的溢出**

**恢复 - 修剪(prune):**

- `prune()` 在每轮**完成之后**运行
- 向后遍历已完成的工具结果
- 保留最近 40k token 的工具输出(`PRUNE_PROTECT`)
- 移除更早工具输出的内容(标记 `time.compacted`)
- 只有节省 > 20k token 时才修剪(`PRUNE_MINIMUM`)
- Token 估算:`chars / 4`

**恢复 - 压缩:**

- 当 `isOverflow()` 在轮前返回 true 时触发
- LLM 生成对话摘要
- 用摘要替换旧消息

**缺口:** 没有轮中保护。单次 read 返回 4MB 就会溢出。30KB 的 bash 限制是他们的主要实际保护。

### OpenAI/Codex

**工具输出限制(执行期间):**

| 工具         | 限制                     | 详情                               |
| ---------- | ---------------------- | -------------------------------- |
| shell/exec | 10k tokens 或 10k bytes | 按模型的 `TruncationPolicy`,用户可配置    |
| read_file  | 2000 行,500 字符/行        | `MAX_LINE_LENGTH = 500`,约 1MB 上限 |
| grep_files | 100 个匹配                | 默认限制                             |
| list_dir   | 可配置                    | 带深度限制的 BFS                       |

**截断策略:**

- 按模型家族设置:`TruncationPolicy::Bytes(10_000)` 或 `TruncationPolicy::Tokens(10_000)`
- 用户可通过 `tool_output_token_limit` 配置覆盖
- 通过 `truncate_function_output_items_with_policy()` 统一应用于所有工具输出
- 保留开头和结尾,用 `"…N tokens truncated…"` 标记移除中间

**溢出检测:**

- 每轮成功之后:`if total_usage_tokens >= auto_compact_token_limit { compact() }`
- 按模型阈值(200k 上下文窗口对应如 180k)
- 捕获并处理 `ContextWindowExceeded` 错误

**恢复 - 压缩:**

- 轮后 token 超过阈值时,触发 `run_inline_auto_compact_task()`
- 压缩期间若遇到 `ContextWindowExceeded`:移除最老的历史项并重试
- 循环:`history.remove_first_item()` 直到能装下
- 通知用户:"已修剪 N 条较早的对话项"

**恢复 - 轮次错误:**

- 正常轮次遇到 `ContextWindowExceeded`:标记 token 已满,向用户返回错误
- **不**自动重试失败的轮次
- 用户必须手动继续

**缺口:** 仍然没有轮中保护,但对所有工具输出激进的 10k token 截断在实践中阻止了大多数问题。

### 对比

| 特性       | pi-coding-agent | OpenCode        | Codex              |
| -------- | --------------- | --------------- | ------------------ |
| Bash 限制  | 10MB            | 30KB            | ~40KB (10k tokens) |
| Read 限制  | 2000×2000 (4MB) | 2000×2000 (4MB) | 2000×500 (1MB)     |
| 截断策略     | 无               | 按工具             | 按模型,统一             |
| Token 估算 | 无               | chars/4         | chars/4            |
| 轮前检查     | 无               | 有(上次 tokens)    | 有(阈值)              |
| 轮中检查     | 无               | 无               | 无                  |
| 轮后修剪     | 无               | 有(移除旧工具输出)      | 无                  |
| 溢出恢复     | 无               | 压缩              | 修剪最老 + 压缩          |

**关键洞察:** 这些工具都没有防止轮中溢出。它们的实际保护是对工具输出(尤其是 bash)设置激进的静态限制。OpenCode 的 30KB bash 限制对比我们的 10MB 是关键差异。

## 推荐解决方案

### 阶段 1:静态限制(立即)

按行业实践给工具输出加硬限制:

```typescript
// packages/coding-agent/src/tools/limits.ts
export const MAX_TOOL_OUTPUT_CHARS = 30_000; // ~7.5k tokens,匹配 OpenCode bash
export const MAX_TOOL_OUTPUT_NOTICE = "\n\n...(truncated, output exceeded limit)...";
```

应用于所有工具:

- bash: 10MB → 30KB
- read: 增加 100KB 总输出上限
- edit: 限制 diff 输出

### 阶段 2:工具执行后估算

`tool_execution_end` 之后估算并标记:

```typescript
let needsCompactionAfterTurn = false;

agent.subscribe(async (event) => {
    if (event.type === "tool_execution_end") {
        const resultChars = extractTextLength(event.result);
        const estimatedTokens = Math.ceil(resultChars / 4);

        const lastUsage = getLastAssistantUsage(agent.state.messages);
        if (lastUsage) {
            const current = calculateContextTokens(lastUsage);
            const projected = current + estimatedTokens;
            const threshold = agent.state.model.contextWindow - settings.reserveTokens;
            if (projected > threshold) {
                needsCompactionAfterTurn = true;
            }
        }
    }

    if (event.type === "turn_end" && needsCompactionAfterTurn) {
        needsCompactionAfterTurn = false;
        await triggerCompaction();
    }
});
```

### 阶段 3:溢出恢复(类似 Codex)

优雅处理 `stopReason === "length"`:

```typescript
if (event.type === "message_end" && event.message.role === "assistant") {
    if (event.message.stopReason === "length") {
        // 发生上下文溢出
        await triggerCompaction();
        // 可选:重试该轮
    }
}
```

压缩期间如果也溢出,修剪最老消息:

```typescript
async function compactWithRetry() {
    while (true) {
        try {
            await compact();
            break;
        } catch (e) {
            if (isContextOverflow(e) && messages.length > 1) {
                messages.shift(); // 移除最老
                continue;
            }
            throw e;
        }
    }
}
```

## 总结

压缩不足问题的成因:

1. 我们只在 assistant 消息之后检查上下文大小
2. 工具结果可以加入任意量的内容
3. 我们只在下次 LLM 调用失败时才发现溢出

修复需要:

1. 对工具输出设置激进的静态限制(即时安全网)
2. 工具执行后做 token 估算(主动检测)
3. 优雅处理溢出错误(兜底恢复)
