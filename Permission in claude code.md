## 尝试理解的问题

如题，claude code 中的权限管理。lcc（learn-claude-code）中的源码部分对这里进行了简化，将 tool_call 的权限策略简化为三层：ask、allow、deny，三层闸门依次为 `check_deny_list`、`check_rules` 和 `ask_user`，其中 deny 规则由单个 `DENY_LIST` 管理。

实际上 claude code 源码中的策略要复杂得多，以下基于 CC 源码 `types/permissions.ts`、`utils/permissions/permissions.ts`、`toolExecution.ts`、`utils/permissions/yoloClassifier.ts`、`tools/AgentTool/forkSubagent.ts` 的核查，结合两篇深度分析文章整理。

---

## 总览：7 阶段调度管线

当用户输入 prompt 后，模型返回的 `tool_use` block 会经过一个 **7 阶段调度管线**（来自 `toolExecution.ts`），权限检验只是其中的 Phase 2-4。完整流程是：

模型输出 → [1.提取] → [2.输入校验] → [3.Pre-Tool Hooks] → [4.权限检查] → [5.执行] → [6.Post-Tool Hooks] → [7.结果映射] → 回传模型

下面逐一拆解真实 CC 的做法。

---

### Phase 1: 提取（Extraction）

最简单的阶段。`query.ts` 主循环从 assistant message 中过滤出 `type === 'tool_use'` 的 block：

```js
const msgToolUseBlocks = message.message.content.filter(
  content => content.type === 'tool_use'
)
```

每个 block 有 `name`、`input`、唯一 `id`。`id` 至关重要——工具结果必须引用相同的 id 回传 API。

---

### Phase 2: 输入校验（两层）

#### 2a. Zod Schema 验证（`toolExecution.ts:614-680`）

工具注册时声明了 Zod schema。先用 **`safeParse()`**（不抛异常的版本）验证输入：

```js
const parsedInput = tool.inputSchema.safeParse(input)
if (!parsedInput.success) {
  // 返回格式化错误给模型，不执行任何代码
  return formatZodValidationError(tool.name, parsedInput.error)
}
```

模型可能幻觉工具名或乱填参数，Zod 是第一道防线。不合法输入直接拒绝，不执行代码。

#### 2b. `validateInput()`（`toolExecution.ts:682-733`）

Zod 通过后，部分工具还有**语义级二次校验**——那些无法用 schema 表达的逻辑。例如：

- 验证文件路径必须是绝对路径而非相对路径
- 验证路径存在性
- Bash 命令的语法检查

这是工具级别的自定义校验，每个工具可以覆写 `validateInput()` 方法。

---

### Phase 3: Pre-Tool Hooks（`toolExecution.ts:800-862`）

在权限检查**之前**，用户配置的 hooks 先执行。Hook 是外部 shell 命令或脚本，绑定到特定工具（如 `Edit|Write`）。Pre-tool hook 可以返回 4 种决策：

| Hook 返回值 | 效果 |
|------------|------|
| `allow` | 跳过后续交互式权限弹窗（**但不能绕过 deny 规则**） |
| `deny` | 直接拒绝执行 |
| `modify input` | 修改工具输入后再继续管线 |
| `block` | 返回错误信息阻止执行 |

**关键不变式**：源码有显式注释 —— *"Hook 'allow' does NOT bypass settings.json deny/ask rules."* Hook 只能**收紧**限制，不能**放松**限制。它可以 deny settings 允许的操作，但不能 allow settings 禁止的操作。

---

### Phase 4: 权限检查 — 核心多层决策

这是整个管线最复杂的部分。入口函数是 `checkPermissionsAndCallTool()`（`toolExecution.ts:599-1745`），但实际的权限决策逻辑拆成了两个函数：

- **`hasPermissionsToUseToolInner()`** — 问"规则怎么说？"，返回 `allow` / `deny` / `ask`
- **`hasPermissionsToUseTool()`** — 拿到 inner 的判决后，根据当前运行模式（interactive？auto？headless？）决定"那怎么办？"

在展开这两个函数之前，先理解权限管线唯一的"货币"——`PermissionResult`。

#### 前置：PermissionResult — 4 种 behavior（`types/permissions.ts:241-266`）

整个权限系统只产出四种结果。教学版只有前三种，缺了第四种：

| behavior | 含义 | 谁可以返回 |
|----------|------|-----------|
| `deny` | 直接拒绝，不可绕过 | deny 规则、安全检查、工具自身 |
| `ask` | 暂停，等用户或分类器决定 | ask 规则、工具自身、passthrough 兜底 |
| `allow` | 直接放行 | bypass 模式、allow 规则、默认兜底 |
| `passthrough` | 工具不表态，交给管线继续判断 | 工具 `checkPermissions()` 返回值 |

`passthrough` 是教学版没有的概念。一个工具可以说"我判断不了，管线你自己看"。管线收到 `passthrough` 后，会继续往下走 deny/ask/allow 规则链，最终没人表态就转为 `ask` 弹框。

#### 4a. `backfillObservableInput()`（`toolExecution.ts:784`）

在权限检查前，先补全工具输入的遗留字段。例如，某些字段有默认值但模型没填，此时填充。这确保权限判断看到的是完整输入。

#### 4b. `resolveHookPermissionDecision()`（`toolExecution.ts:921-931`）

协调 hook 返回的决策和后续管线决策。如果 hook 返回了 `allow`/`deny`，这会影响是否需要继续走权限管线。

#### 4c. `hasPermissionsToUseToolInner()`（`permissions.ts:1158-1310`）

核心判定函数。设计上有几个关键点：

1. **return early，不是大 if-else**：命中即停，后面的检查不再执行
2. **deny 优先**：所有"阻止理由"（1a→1g）排在前面，遇到 deny 立刻返回；"放行理由"（2a→2b）排在后面，只有没被阻止的情况下才轮到
3. **ask 不一定立刻返回**：1b（工具级 ask）被命中后只是记录，不立即 return，因为后面的 1c 可能升级为 deny。但 1e/1f/1g 的 ask 立刻 return，bypass 也救不了
4. **passthrough 兜底**：什么都没命中 → 默认 `allow`。工具返回 `passthrough` 且没被任何规则处理 → 转为 `ask`

```ts
   async function hasPermissionsToUseToolInner(
     tool: Tool,
     input: { [key: string]: unknown },
     context: ToolUseContext,
   ): Promise<PermissionDecision> {

     // ========== 第一组：阻止/询问的理由（1a → 1g）==========

     // 1a. 整个工具被 deny rule 禁用
     const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
     if (denyRule) {
       return { behavior: 'deny', /* ... */ }
       // ⬆ 命中即停，不可绕过，even in bypassPermissions mode
     }

     // 1b. 整个工具被 ask rule 标记
     const askRule = getAskRuleForTool(appState.toolPermissionContext, tool)
     // → 记录为 ask，但不立即返回，继续往下走
     // （因为后面的检查可能产生更强的 deny）

     // 1c. 问工具自己的意见
     toolPermissionResult = await tool.checkPermissions(parsedInput, context)
     // 每个工具覆写这个方法，比如 Bash 在这里做 AST 解析

     // 1d. 工具自己说 deny
     if (toolPermissionResult?.behavior === 'deny') {
       return toolPermissionResult
     }

     // 1e. 工具需要用户交互（即使在 bypass 模式）
     if (tool.requiresUserInteraction?.()) {
       return { behavior: 'ask', /* 不可绕过 */ }
     }

     // 1f. 内容相关的 ask 规则（如 Bash(npm publish:*)）
     const contentAskRule = getContentAskRule(...)
     if (contentAskRule) {
       return { behavior: 'ask', /* 不可绕过 */ }
     }

     // 1g. 安全检查 — bypass 免疫
     // 敏感路径: .git/, .claude/, .bashrc 等
     if (
       toolPermissionResult?.behavior === 'ask' &&
       toolPermissionResult.decisionReason?.type === 'safetyCheck'
     ) {
       return toolPermissionResult
       // ⬆ 即使 --dangerously-skip-permissions 也得弹框
     }

     // ========== 第二组：放行的理由（2a → 2b）==========

     // 2a. bypassPermissions 模式
     if (shouldBypassPermissions) {
       return { behavior: 'allow', /* ... */ }
     }

     // 2b. 整个工具被 allow rule 放行
     const allowRule = getAllowRuleForTool(...)
     if (allowRule) {
       return { behavior: 'allow' }
     }

     // ========== 兜底 ==========

     // 3. passthrough → 转为 ask
     if (toolPermissionResult?.behavior === 'passthrough') {
       return { behavior: 'ask' }
     }

     // 如果 1b 命中了 ask rule，到这里返回 ask
     if (askRule) {
       return { behavior: 'ask' }
     }

     // 什么都没命中，默认放行
     return { behavior: 'allow' }
   }

```

其中 1a 和 1b 的 `getDenyRuleForTool()` / `getAskRuleForTool()` 去哪查规则？CC 没有单一列表，规则来自 **8 个来源**（`types/permissions.ts:54-62`），按优先级从低到高合并，高优先级覆盖低优先级：

| 优先级 | 来源 | 配置位置 |
|--------|------|---------|
| 低 | `userSettings` | `~/.claude/settings.json` |
| ↑ | `projectSettings` | `.claude/settings.json` |
| ↑ | `localSettings` | `settings.local.json` |
| ↑ | `flagSettings` | Feature flags |
| ↑ | `policySettings` | 企业管理策略 |
| ↑ | `cliArg` | `--allowedTools` / `--deniedTools` |
| ↑ | `command` | 内联命令 |
| 高 | `session` | 会话内临时授权 |

每条规则格式：`{ toolName: "Bash", ruleBehavior: "deny", ruleContent: "npm publish:*" }`。多个来源的同一工具合并时，高优先级来源覆盖低优先级。这就是为什么 `--allowedTools` 可以覆盖 settings.json 的 deny，而 session 内的临时授权又能覆盖 CLI 参数。

#### 4d. `hasPermissionsToUseTool()` — 外层包装：根据 mode 处理 ask（`permissions.ts:473-956`）

inner 返回 `allow` 或 `deny` 时，外层直接照办。但 inner 返回 `ask` 时，怎么处理取决于当前的 **PermissionMode**：

```ts
export const hasPermissionsToUseTool = async (
  tool, input, context, assistantMessage, toolUseID,
): Promise<PermissionDecision> => {
  const result = await hasPermissionsToUseToolInner(tool, input, context)

  if (result.behavior === 'allow') {
    // 重置连续拒绝计数器，直接返回
    recordSuccess(denialState)
    return result
  }

  if (result.behavior === 'ask') {
    // dontAsk 模式: 把 ask 转成 deny
    if (mode === 'dontAsk') {
      return { behavior: 'deny', /* ... */ }
    }

    // auto 模式: 尝试分类器而非弹框
    if (mode === 'auto') {
      // 1. 先试 acceptEdits 快速路径
      // 2. 再查安全工具白名单
      // 3. 最后调用 YoloClassifier（两阶段 LLM）
      const autoResult = await tryAutoMode(...)
      if (autoResult) return autoResult
    }

    // headless agent: 试 hooks，不行就静默 deny
    if (shouldAvoidPermissionPrompts) {
      const hookDecision = await runPermissionRequestHooksForHeadlessAgent(...)
      if (hookDecision) return hookDecision
      return { behavior: 'deny', /* ... */ }
    }
  }

  // 都没处理，透传给交互式 handler（弹对话框）
  return result
}
```

6 种 mode 的完整行为：

| mode | inner 返回 ask 时…… |
|------|---------------------|
| `default` | 弹对话框问用户 |
| `acceptEdits` | 安全的文件操作自动 allow，其余弹框 |
| `bypassPermissions` | 除了 deny 规则和 1g 安全检查外，全放行 |
| `plan` | 先审批计划，批准后在范围内自动执行 |
| `auto` | 走 YoloClassifier 分类器判断，不弹框 |
| `dontAsk` | 所有 ask 转 deny，永不弹框 |

可以看到，6 种 mode 的核心差异**只在"如何处理 ask"**。deny 和 allow 的处理是硬编码的——deny 永远 deny，allow 永远 allow——只有 ask 是弹性空间，mode 决定了它的最终命运。

---

### Phase 5: 执行（Execution）

权限通过后调用 `tool.call()`：

```js
const result = await tool.call(
  callInput,           // 校验过的输入
  toolUseContext,      // 工作目录、abort controller、app state
  canUseTool,          // 权限回调（工具内部可能需要再申请权限）
  assistantMessage,    // 父 assistant 消息
  onProgress           // 实时进度回调
)
```

**微妙细节**：传给 `call()` 的是模型的**原始输入**，不是 backfill 后的版本。这保持了对话记录的一致性。

---

### Phase 6: Post-Tool Hooks

执行后触发 post-tool hooks。可以：

- 修改 MCP 工具的输出
- 记录日志
- 阻止对话继续

还有独立的 **`PostToolUseFailure`** hook，仅在工具失败时触发——给外部系统记录失败或建议修复的机会。

---

### Phase 7: 结果映射

工具实现 `mapToolResultToToolResultBlockParam()` 把输出转成 API 格式：

```json
{ "type": "tool_result", "tool_use_id": "toolu_01XYZ", "content": "..." }
```

如果结果超过大小阈值，会**持久化到磁盘**（`sessionDir/tool-results/{toolUseId}.txt`），API 只收到一个文件引用。这防止大输出撑爆上下文窗口。

---

## 额外机制

### 并发调度器

当模型一次返回多个 `tool_use` block 时，调度器按 `isConcurrencySafe()` 分组：

- **安全组**：并发执行（上限 10 个，可通过 `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` 配置）
- **不安全组**：串行执行

`contextModifier` 只在 batch 之间生效（如 `EnterWorktree` 切换工作目录后，后续 batch 看到新目录）。

### 流式执行器

启用 streaming 时，工具在模型还在生成回复时就开始执行。特殊规则是**Bash 错误级联**——如果并行执行的 Bash 命令失败，其他兄弟工具全部中止。

### YoloClassifier（auto 模式自动审批）

CC 的 auto 模式下，不会每次都弹对话框。`classifyYoloAction`（`utils/permissions/yoloClassifier.ts:1012`）把工具调用 + 对话上下文发给一个分类器 LLM 判断是否安全：

1. 先尝试 acceptEdits 模式模拟（如果 acceptEdits 允许 → 直接批准）
2. 再查安全工具白名单
3. 最后才调分类器

分类器连续拒绝太多次 → 回退到人工审批。

### `isDestructive()` 纯 UI 展示用

在 `Tool.ts:405-406`，只用于工具列表里显示 `[destructive]` 标签，**不参与权限决策**。默认所有工具都返回 `false`。只有 ExitWorktree（remove 时）和 MCP 工具（依赖 `annotations.destructiveHint`）覆写了它。

### 权限冒泡

子 Agent（通过 AgentTool fork 出来的）的 `permissionMode` 设为 `'bubble'`（`forkSubagent.ts:50`）。意思是权限弹窗**冒泡到父 Agent 的终端**，而不是在子 Agent 里静默拒绝。Bash 分类器在这个过程中继续跑——给权限对话框显示的同时在后台判断是否可以自动批准。

### 工具接口：43+ 工具，1 个接口

bash 命令、web_fetch、子 agent 生成、cron job 创建、推送通知——所有这些都实现相同的 30 方法接口、经过相同的 7 阶段管线、服从相同的权限系统。调度器中没有特殊情况，复杂度分散在各个工具实现和权限规则中，而不是在路由逻辑里。

---

## 教学版简化总结

| CC 真实管线 | 教学版对应 |
|------------|-----------|
| 7 阶段调度管线 | 无（聚焦权限） |
| Zod + validateInput + backfill (3步) | 无（省略校验） |
| PreToolUse hooks + resolveHookDecision (2步) | 无（省略 hooks） |
| hasPermissionsToUseToolInner (9层) | 3 道闸门 |
| 4 种 PermissionResult behavior | 3 种（缺 passthrough） |
| 8 个规则来源 + 优先级合并 | 1 个 DENY_LIST + PERMISSION_RULES |
| 6 种 PermissionMode | 无 |
| YoloClassifier (auto 模式) | 无 |
| PostToolUse hooks + 结果映射 | 无 |
| 并发调度器 + 流式执行器 | 无 |
| 权限冒泡 (子 Agent) | 无 |

