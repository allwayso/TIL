## 尝试解决的问题

[[Context Compaction：multiple layers]] 中给出了 CC 和 Pi 的上下文压缩策略，本节展开 memory 系统。

## 正文

### lcc：extract and dream

依旧 lcc 起手。

这里的 memory 目的是从与用户的对话中提取出可能适用于整个会话、甚至适用于当前仓库的 preference。

自然 memory 也要通过某种方式存储，CC 采用的是 MEMORY.md 索引+.md 文件。这个思路其实和 tool list/skill list 是一个道理，塞给 system prompt 一张索引表，通过 side query 按需读取，避免不必要的上下文。记忆文件的格式和 skill.md 也有相近之处，通过固定字段的 YAML 头+正文构成，其中 YAML 包含 name，desc 和 type 字段。

所谓 type 指的是以下几种类型：
- user：用户画像
- feedback：行为约束
- project：项目动态
- reference：外部信息索引

那么 memory 的提取逻辑是什么呢？用户有的时候会说明”记住使用牛来模型“，有的时候没有那么明确，但是总的来说用户不希望看到自己的任何一条要求被忽视，所以自然的，CC 选择在每轮对话之后（~~即 stop_reason 不为 tool call 的时候~~ 实际为 stop hook lcc又瞎写）提取可能会用到的 memory。

提取多了也有一个问题，比如有些 feedback 之间存在冲突，或者比较接近，这时候在注入 prompt 的时候就容易产生混淆，而且 memory 本身数量过多也会造成额外的上下文开销，所以我们希望在一定时间间隔之后做一次整理，将冲突/重复项进行合并。当然这个整理的粒度不必像提取一样细，仅当 memory 内容较多的时候需要整理（CC 称之为 DREAM，豪完了）。

具体而言，仅当以下条件满足时才会触发 DREAM：
 1. 时间门控:距上次合并 ≥ 24 小时
 2. 扫描节流:避免频繁扫描文件系统
 3. 会话门控:自上次合并以来修改了 ≥ 5 个会话 transcript
 4. 锁门控:没有其他进程在合并(.consolidate-lock 文件,锁文件 mtime 即 lastConsolidatedAt,1 小时自动过期)


### claude code source code

lcc 对 CC 的记忆机制做了简要的介绍，但是其深入CC部分一如既往的不够清晰，接下来做一点展开。

依旧雷霆大mermaid图起手：

 ```mermaid
   flowchart TD
       subgraph LOAD["加载 · 读"]
           A[loadMemoryPrompt] --> B{KAIROS 启用?}
           B -->|是| B1[buildAssistantDailyLogPrompt]
           B -->|否| C{TEAMMEM 启用?}
           C -->|是| C1[buildCombinedMemoryPrompt<br/>auto + team]
           C -->|否| D[buildMemoryPrompt<br/>索引常驻 SYSTEM]
           E[startRelevantMemoryPrefetch<br/>每轮异步] --> F{自动记忆 + 单次调用?}
           F -->|是| G[findRelevantMemories]
           G --> H[scanMemoryFiles<br/>最多 200 个 · 按 mtime 降序]
           H --> I[Sonnet side-query<br/>选最多 5 条]
           I --> J[读取文件内容<br/>每文件 ≤200 行 / 4096B<br/>session 总预算 60KB]
           J --> K[注入当前 user turn]
       end

       subgraph WRITE["写入 · 提取"]
           L[stop hook 触发] --> M{EXTRACT_MEMORIES +<br/>主线程 + 提取模式?}
           M -->|否| X1([跳过])
           M -->|是| N{主 agent 已写<br/>memory 文件?}
           N -->|是| X2([跳过 · 重叠保护])
           N -->|否| O[executeExtractMemories<br/>forked agent]
           O --> P[skipTranscript + maxTurns 5]
           P --> Q[写 memory 文件<br/>+ 重建 MEMORY.md 索引]
       end

       subgraph DREAM["整理 · Dream"]
           R[stop hook 触发<br/>executeAutoDream] --> S{时间门控<br/>≥24 小时?}
           S -->|否| X3([跳过])
           S -->|是| T{会话门控<br/>≥5 个 transcript 变更?}
           T -->|否| X4([跳过])
           T -->|是| U{扫描节流<br/>10 分钟间隔?}
           U -->|否| X5([跳过])
           U -->|是| V{锁门控<br/>无其他进程?}
           V -->|否| X6([跳过])
           V -->|是| W[forked agent 合并<br/>去重 · 剪枝 · 重建索引]
       end

       subgraph SM["Session Memory"]
           SM1[shouldExtractMemory<br/>每轮检查] --> SM2[manuallyExtractSessionMemory<br/>写 session-memory 文件]
           SM3[sessionMemoryCompact<br/>minTokens 10K · minMsgs 5 · maxTokens 40K] --> SM4{内容足够?}
           SM4 -->|是| SM5[直接用 · 不调 LLM]
           SM4 -->|否| SM6[走 LLM 全量摘要]
       end

       Q --> A
       K --> A
       W --> A
 ```


对简略版 lcc 做以下补充：
1. 提取冗余：主 agent 有能力且被鼓励自行修改 memory，通过子 agent 做检查，补足主 agent 可能漏过的约束
2. 简略扫描：MEMORY.md 塞给主 agent（这样 cache 命中高......）；启动 side query 对所有memory做扫描（实际上只读YAML）并按最近修改时间倒序排列，找到若干条相干的传给主 agent
3. 异常处理：如果 side query 报错，先重试两次试试，不行就静默终止，由主 agent 依靠 MEMORY.md 做决定

> 感觉比较神秘的两点：1.如果我把容易被删改的内容都外包给forked agent，那缓存命中就自然高了，不过这似乎并不一定会使得真实成本更低，这里其实有一个 trade-off 2.不太重要的异常直接静默处理吗，感觉这个子agent像一条路边的也够......或许说明这个 scan 并不是必须的操作，真的要读主 agent 自己读得了 

### pi origin

哈哈没想到吧，pi 原生直接没有长程记忆机制，全靠 agents/claude.md 和 message tree 来维护。

不过这个确实挺有意思的，MEMORY.md能不能直接放进 AGENTS.md 中呢，这些用户画像/行为约束/进度更新是否应该与 AGENTS.md 隔离？感觉是不同的设计理念，或者说 pi 认为这不是核心功能，留下 hook 给后人做就行呢？

### pi memory

说实话 pi 原生的记忆机制在上下文长度不太长的情况下好像够用了，为了严谨起见，我跑了一下 pi 原生和 pi+pi memory 在memoryArena 上的表现（GLM 5.3 flash 且囊中羞涩只跑了5组），事实证明两者的表现是相近的。

> 这个实验做的太垃圾了。所谓 pi 原生居然是一个全量累计+阈值截断的模拟 memory 系统，pi-mem 的检索和存储倒是模拟了的 ，但是快照之类的机制一点都没有。最重要的是，由于没有压缩，在短上下文（实验只跑了5组）的情况下，全量保留上下文的记忆表现自然会更好。简单来说，我试图做一个实验对比 pi 的记忆系统和 pi-mem 的记忆系统的表现，但是忽略了压缩和记忆的紧密结合，导致实验结果可能不合预期。

## 总结

目前了解到的记忆机制主要分为三类：
1. 单纯依赖 messages 上下文：Pi，相信长上下文能够涵盖所有记忆需求，通过摘要维护过长上下文
2. 文档存储+LLM 检索：CC，通过 md 文档存储记忆，使用 LLM 做 side-query，与主循环并行检索
3. 文档存储+ BM25/向量检索混合策略：pi-mem，通过 md 文档存储记忆，使用文本匹配和向量检索混合策略

不过这里的分类主要是针对检索策略，实际上不同记忆系统的提取策略（指记忆文档写入）、文档组织形式和文档格式规定都不同。但是似乎使用 md 作为文档格式还是比较主流的，至于检索，我觉得 CC 的比较方便。

> 哦还有记忆的整理机制，当 memory 文档数量增加的时候，对其进行整理能够减少冲突，也可以减少上下文开销/检索时间开销。

以下是 agent 整理的记忆系统流派：
 ```mermaid
   graph TD
       M[Agent 记忆方案] --> G1[提取+向量检索]
       M --> G2[时序知识图谱]
       M --> G3[agent 自管理分层内存]
       M --> G4[文件系统]
       G1 --> Mem0[Mem0<br/>提取+ADD/UPDATE/DELETE/NOOP]
       G1 --> LangMem[LangMem<br/>LangGraph 原生]
       G2 --> Zep[Zep / Graphiti<br/>时序知识图谱]
       G2 --> Cognee[Cognee<br/>图+向量 poly-store]
       G3 --> Letta[Letta / MemGPT<br/>Core/Recall/Archival]
       G4 --> CC[CC .memory/<br/>side-query + 提取器]
       G4 --> Pi[pi-memory<br/>MEMORY.md + qmd]
 ```

不过比较有意思的一点是，对于同一个 benchmark，同一个架构 self-run 和第三方测试能差出一半（点名mem0）。而且大家似乎都认为，底层 agent 架构（包括上下文管理和调用工具的能力）对跑分结果的影响大于其中记忆系统的选型差异，这点在我粗糙的实验中也有一定体现。