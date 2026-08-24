# 上下文压缩(设计调研与实施方案)

> 来源:pi 仓库 git 历史 commit `5daef11b`(2025-12-02,"Add compaction research and implementation plan")
> 原始路径:`packages/coding-agent/docs/compaction.md`(该文件后来被精简为现在的 how-to 文档)
> 译者注:这是 pi 压缩功能的**原始设计文档**,包含竞品调研与设计决策理由,正式文档中已不保留。

关于其他编码助手如何实现上下文压缩以管理长对话的研究。

## 概述

上下文压缩(也叫 "handoff" 或 "summarization")是一种管理长编码会话上下文窗口的技术。当对话变得过长时,性能会下降、成本会增加。压缩把对话历史总结为浓缩形式,让工作可以在不触及上下文限制的情况下继续。

## Claude Code

**手动:** `/compact` 命令
**自动:** 在约 95% 上下文容量时触发([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))

### 工作原理

1. 取整个对话历史
2. 用 LLM 生成摘要
3. 以摘要作为初始上下文开启新会话
4. 用户可以用 `/compact` 提供自定义指令(如 "只总结 TODOs")([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))

### 提示词(社区提取)

来自 [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1jr52qj/here_is_claude_codes_compact_prompt/):

```
你的任务是详细总结到目前为止的对话,密切注意用户的明确请求和你之前的操作。
这份总结将作为继续对话时的上下文,因此请保留关键信息,包括:
- 已完成的工作
- 当前进行中的工作
- 涉及的文件
- 下一步
- 关键的用户请求或约束
```

### 关键观察

- 自动压缩在约 95% 容量时触发,但用户常常建议更早手动压缩([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))
- 多次压缩后质量会下降(累积信息丢失)([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))
- 与完全清空历史的 `/clear` 不同([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))
- 用户报告:如果自动压缩发生在任务中途,模型可能"跑偏"([来源](https://stevekinney.com/courses/ai-development/claude-code-compaction))

## OpenAI Codex CLI

来源:[github.com/openai/codex](https://github.com/openai/codex)(codex-rs/core/src/compact.rs,codex-rs/core/templates/compact/)

**手动:** `/compact` 斜杠命令
**自动:** 当 token 用量超过 `model_auto_compact_token_limit` 时触发

### 工作原理

1. 使用专门的摘要提示词
2. 将整个历史与提示词一起发送
3. 从模型响应中收集摘要
4. 构建新历史:初始上下文 + 最近的用户消息(最多 20k token)+ 摘要
5. 用压缩后的版本替换会话历史

### 提示词

来自 [codex-rs/core/templates/compact/prompt.md](https://github.com/openai/codex/blob/main/codex-rs/core/templates/compact/prompt.md):

```markdown
You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.
```

### 摘要前缀(在新上下文中置于摘要之前)

来自 [codex-rs/core/templates/compact/summary_prefix.md](https://github.com/openai/codex/blob/main/codex-rs/core/templates/compact/summary_prefix.md):

```markdown
Another language model started to solve this problem and produced a summary of its thinking process.
You also have access to the state of the tools that were used by that language model.
Use this to build on the work that has already been done and avoid duplicating work.
Here is the summary produced by the other language model, use the information in this summary to assist with your own analysis:
```

### 关键观察

- 使用基于 token 的阈值(`model_auto_compact_token_limit`)而不是百分比([config/mod.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs))
- 默认阈值因模型而异(有些模型 180k,有些 244k)([config/mod.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/config/mod.rs))
- 保留最近的用户消息(最近约 20k token)与摘要一起([compact.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs))
- 警告用户:"长对话和多次压缩可能导致模型精度下降"([compact.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs))
- 压缩失败时有指数退避的重试逻辑([compact.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs))
- 使用 95% 的 "effective_context_window_percent" 作为安全余量([model_family.rs](https://github.com/openai/codex/blob/main/codex-rs/core/src/model_family.rs))

## OpenCode (sst/opencode)

来源:[github.com/sst/opencode](https://github.com/sst/opencode)(packages/opencode/src/session/compaction.ts)

**手动:** `/compact` 命令
**自动:** 当 `isOverflow()` 返回 true 时触发(基于 token 用量与模型限制)

### 工作原理

1. 检查 token 是否超过(context_limit - output_limit)([compaction.ts](https://github.com/sst/opencode/blob/main/packages/opencode/src/session/compaction.ts))
2. 创建一条标记为 "summary" 的新 assistant 消息
3. 使用压缩系统提示词
4. 流式生成摘要
5. 如果是自动压缩,添加 "如果你有下一步请继续" 消息

### 提示词

来自 [packages/opencode/src/session/prompt/compaction.txt](https://github.com/sst/opencode/blob/main/packages/opencode/src/session/prompt/compaction.txt):

```
You are a helpful AI assistant tasked with summarizing conversations.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

Your summary should be comprehensive enough to provide context but concise enough to be quickly understood.
```

### 最终用户消息

来自 [compaction.ts](https://github.com/sst/opencode/blob/main/packages/opencode/src/session/compaction.ts):

```
Summarize our conversation above. This summary will be the only context available when the conversation continues,
so preserve critical information including: what was accomplished, current work in progress, files involved,
next steps, and any key user requests or constraints. Be concise but detailed enough that work can continue seamlessly.
```

### 关键观察

- 有一个独立于压缩的 "prune"(修剪)机制([compaction.ts](https://github.com/sst/opencode/blob/main/packages/opencode/src/session/compaction.ts)):
  - 向后扫描工具调用
  - 保护最近 40k token 的工具输出(`PRUNE_PROTECT` 常量)
  - 若可修剪量 > 20k token(`PRUNE_MINIMUM` 常量),则修剪超出阈值的更早工具输出
- 通过 `OPENCODE_DISABLE_AUTOCOMPACT` 环境变量禁用自动压缩([flag.ts](https://github.com/sst/opencode/blob/main/packages/opencode/src/flag/flag.ts))
- UI 展示摘要(最多 2 句)与压缩摘要(详细)分开生成([summary.ts](https://github.com/sst/opencode/blob/main/packages/opencode/src/session/summary.ts))

## Amp (Sourcegraph)

来源:[ampcode.com/guides/context-management](https://ampcode.com/guides/context-management)

**手动:** "Handoff" 功能
**自动:** 无(鼓励手动上下文管理)

### 工作原理

Amp 采用不同的方法,提供手动上下文管理工具而不是自动压缩:

1. **Handoff**:为下一个任务指定目标,Amp 分析当前线程,提取相关信息到新消息中,用于开启新线程
2. **Fork**:在特定点复制上下文窗口
3. **Edit/Restore**:编辑或恢复到之前的消息
4. **Thread References**:引用其他线程按需提取信息

### 关键观察

- 理念:"为了获得最佳效果,保持对话简短而专注"([来源](https://ampcode.com/guides/context-management))
- 强调上下文中的一切都影响输出质量:"上下文窗口中的一切都会影响输出"([来源](https://ampcode.com/guides/context-management))
- 使用辅助模型在 handoff 期间提取相关信息([来源](https://ampcode.com/guides/context-management))
- 线程引用允许选择性提取而无需包含完整上下文([来源](https://ampcode.com/guides/context-management))
- 没有自动压缩;依赖用户自律和工具

## 给 pi-coding-agent 的实现建议

### `/compact` 命令

```typescript
// 用户触发: /compact [可选自定义指令]
// 1. 用当前对话生成摘要
// 2. 以摘要作为初始上下文创建新会话
// 3. 可选:继续处理排队的用户消息
```

### 自动压缩

```typescript
// 基于阈值(如上下文限制的 85-90%)
// 每轮结束后检查:
if (tokenUsage / contextLimit > 0.85) {
  await compact({ auto: true });
}
```

### 压缩提示词

基于调研,一个好的压缩提示词应包含:

```markdown
Create a detailed summary for continuing this coding session. Include:

1. **Completed work**: What tasks were finished
2. **Current state**: Files modified, their current status
3. **In progress**: What is being worked on now
4. **Next steps**: Clear actions to take
5. **Constraints**: User preferences, project requirements, key decisions made
6. **Critical context**: Any information essential for continuing

Be concise but preserve enough detail that work can continue seamlessly.
```

### 关键设计决策

1. **阈值**:建议 85-90%(95% 往往太晚,据 Claude Code 用户反馈)
2. **修剪**:考虑在完整压缩之前先修剪旧工具输出(OpenCode 方案)
3. **警告**:通知用户压缩已发生且质量可能下降(Codex 方案)
4. **禁用选项**:允许用户通过标志/环境变量禁用自动压缩(OpenCode 方案)
5. **自定义指令**:支持 `/compact [instructions]` 做定向摘要(Claude Code 方案)
6. **会话连续性**:新会话应感觉无缝(摘要作为隐藏上下文)

### 现有基础设施

coding-agent 已有:

- 重置会话的 `/clear` 命令
- 带消息历史的会话管理
- 每轮 token 计数

压缩需要:

1. 添加 `/compact` 命令处理器(类似 `/clear`,但带摘要)
2. 在每次 assistant 轮次后添加 token 阈值检查
3. 创建摘要提示词
4. 接线:以摘要创建新会话

---

## 我们的实施计划

### 命令

- **`/compact [自定义指令]`** - 手动压缩触发。可选的自定义指令让用户引导摘要的焦点。
- **`/autocompact`** - 打开选择器 UI 切换自动压缩开关。同时显示当前高级设置(reserveTokens、keepRecentTokens)。

### 配置

设置存储在 `~/.pi/agent/settings.json`:

```typescript
interface Settings {
  // ... 现有字段
  compaction?: {
    enabled?: boolean           // 默认: true,通过 /autocompact 切换
    reserveTokens?: number      // 默认: 16384,高级设置
    keepRecentTokens?: number   // 默认: 20000,高级设置
  }
}
```

**为什么是这些默认值:**

- `reserveTokens: 16384` - 为摘要输出预留(~8k)加上安全余量(~8k)
- `keepRecentTokens: 20000` - 原样保留最近的上下文,摘要聚焦更早的内容

### Token 计算

根据 assistant 消息计算上下文 token:

```
contextTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite
```

连续两条(非中止、非错误)assistant 消息之间的差值就是该轮新增的 token。已对照实际会话文件验证。

### 触发条件

```typescript
if (contextTokens > model.contextWindow - settings.compaction.reserveTokens) {
  await compact({ auto: true });
}
```

### 轮次边界

消息遵循这样的模式:`user, assistant, toolResult, toolResult, user, assistant, ...`

**关键规则:绝不在轮次中间切割。** 一轮 = 一条 user 消息 + 其后的 assistant 响应与 toolResult,直到下一条 user 消息。总是在 user 消息之前切割,保持 assistant + toolResult 配对完整(如果 toolResult 与其带 toolCall 的 assistant 消息分离,提供方会报错)。

### 摘要注入

摘要以**用户消息**的形式注入,带一个前缀(类似 Codex 的做法)。这让用户可见,并清晰地框定给模型。

前缀:

```
Another language model worked on this task and produced a summary. Use this to continue the work without duplicating effort:
```

### 会话文件格式

压缩事件**追加**到会话文件(绝不插入文件中间):

```typescript
interface CompactionEvent {
  type: "compaction"
  timestamp: string
  summary: string           // 摘要文本
  keepLastMessages: number  // 该事件之前保留多少条消息
  tokensBefore: number      // 压缩前的上下文大小
}
```

压缩后的会话文件示例:

```
{"type": "message", "message": {"role": "user", ...}}
{"type": "message", "message": {"role": "assistant", ...}}
{"type": "message", "message": {"role": "toolResult", ...}}
... 更多消息 ...
{"type": "compaction", "summary": "...", "keepLastMessages": 4, ...}
{"type": "message", "message": {"role": "user", ...}}  <- 压缩后的新消息
```

**会话加载器行为:**

1. 找到最新的压缩事件
2. 取压缩事件**之前**的最后 `keepLastMessages` 条消息
3. 构建上下文:`[摘要_as_用户消息, ...保留消息, ...压缩后的消息]`

**多次压缩:** 进行第二次压缩时,不要越过第一次压缩的边界。新摘要会纳入之前的摘要(因为当前上下文已包含它)。

### 摘要生成

直接使用 **pi-ai**(而不是完整的 agent 循环)进行摘要:

- 不需要工具
- 设置 `maxTokens: 8192` 限制输出
- 传入中止信号以便取消
- 使用当前选中的模型

**提示词**(基于 Codex,已增强):

```markdown
You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- Absolute file paths of any relevant files that were read or modified
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.
```

### 错误处理

- 压缩失败:输出错误,让用户决定怎么办
- JSON/RPC 模式:发出 `{"type": "error", "error": "message"}`(现有模式)
- 压缩可通过与常规流式相同的中止信号取消

### 图片处理

两种情况:

1. **通过文件路径的图片** → 模型用工具读取 → 可被摘要捕获,如 "image at /path/to/file.png was analyzed"。提示词指示模型包含绝对文件路径。
2. **通过 @attachment 的图片** → 直接附加到用户消息 → 压缩时丢失(无法摘要图片)。已知限制。

### 模式

所有模式都支持:

- **TUI**:命令可用,UI 显示压缩进行中
- **Print/JSON**:压缩事件作为输出发出
- **RPC**:压缩事件发送给客户端

### 实施步骤

1. 在 `Settings` 接口和 `SettingsManager` 中添加 `compaction` 字段
2. 在会话管理器添加 `CompactionEvent` 类型
3. 更新会话加载器以处理压缩事件
4. 添加 `/compact` 命令处理器
5. 添加带选择器 UI 的 `/autocompact`
6. 在每次 assistant 轮次后添加压缩触发检查
7. 用 pi-ai 实现摘要函数
8. 在 RPC/JSON 输出类型中添加压缩事件
9. 自动压缩禁用时更新页脚显示
