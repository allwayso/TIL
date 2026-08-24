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

那么 memory 的提取逻辑是什么呢？用户有的时候会说明”记住使用牛来模型“，有的时候没有那么明确，但是总的来说用户不希望看到自己的任何一条要求被忽视，所以自然的，CC 选择在每轮对话之后（即 stop_reason 不为 tool call 的时候）提取可能会用到的 memory。

提取多了也有一个问题，比如有些 feedback 之间存在冲突，或者比较接近，这时候在注入 prompt 的时候就容易产生混淆，而且 memory 本身数量过多也会造成额外的上下文开销，所以我们希望在一定时间间隔之后做一次整理，将冲突/重复项进行合并。当然这个整理的粒度不必像提取一样细，仅当 memory 内容较多的时候需要整理（CC 称之为 DREAM，豪完了）。

具体而言，仅当以下条件满足时才会触发 DREAM：
 1. 时间门控:距上次合并 ≥ 24 小时
 2. 扫描节流:避免频繁扫描文件系统
 3. 会话门控:自上次合并以来修改了 ≥ 5 个会话 transcript
 4. 锁门控:没有其他进程在合并(.consolidate-lock 文件,锁文件 mtime 即 lastConsolidatedAt,1 小时自动过期)

### claude code source code

lcc 对 CC 的记忆机制做了简要的介绍，但是其深入CC部分一如既往的不够清晰，接下来做一点展开。

依旧雷霆大图起手



