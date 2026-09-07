## 尝试解决的问题

简要的看一眼 mem0 是怎么做的，既然曾经到达过 github trending rank1，自然有其可取之处。

## 正文

### benchmark

| Benchmark | Old | New  | Tokens  | Latency p50  |
| --- | --- | --- | --- | --- |
| **LoCoMo** | 71.4 | **92.5** | 7.0K  | 0.88s  |
| **LongMemEval** | 67.8 | **94.4** | 6.8K  | 1.09s  |
| **BEAM (1M)** | — | **64.1** | 6.7K  | 1.00s  |
| **BEAM (10M)** | — | **48.6** | 6.9K  | 1.05s  |

新版的 mem0 在 LoCoMo 等 benchmark 上取得了很好的成绩，仅使用单次检索（无 agentic loop）。不过项目声明该表现基于 Mem0 托管平台，而该平台包含一些开源 SDK 中未提供的专有优化。

### Architecture

框架部分以 pi-plugin 为例，适配不同 agent 的架构可能略有不同。

> 特别声明：mem0 的 pi-plugin 的原生逻辑是插件发出请求，client 将请求 POST 到平台，平台处理后返回信息，再通过客户端 SDK 通知插件。其中 pi-plugin 和 client (mem0-ts/src/client) 都是开源的，但是 mem0ai 平台闭源，不过 mem0 也可以通过修改开源 server (mem0-ts/server) 进行本地部署。由于平台行为不可见，所以以下内容中涉及数据库/服务器端的都是参考 TS SDK。

总体流程图如下：

 ```mermaid
   flowchart TB
       S[(Mem0存储<br/>向量库记忆+实体集合 · SQLite history+messages)]

       subgraph W[写入层 · 全自动 · ADD-only]
           CAP[agent_end 自动捕获] --> EX[平台提取管线<br/>一次LLM调用 只产ADD]
           TA[mem0_memory add] --> EX
           TR[mem0-remember 逐字直存] --> EX
       end

       subgraph C[修正层 · 显式 · 手动触发]
           TU[mem0_memory update/delete/delete_all]
           TF[mem0-forget]
           TP[mem0-pin]
       end

       subgraph M[维护层 · 门控 · 可删改]
           DR[dream 门控与协议注入]
       end

       subgraph DC[衰减层 · 平台内置 · 不可见]
           DEC[memory-decay 按元数据过期]
       end

       subgraph R[读取层 · 检索排序 · 软解决]
           REC[before_agent_start 检索注入] --> RS[混合排序<br/>语义+BM25+实体+时间]
           TS[mem0_memory search/get_all] --> RS
           TQ[mem0-search / mem0-tour / mem0-status] --> RS
       end

       EX --> S
       TU --> S
       TF --> S
       TP --> S
       DR -. dream复用同一组API .-> TA
       DR -.-> TU
       DEC --> S
       RS --> S
 ```
 
### Data Structure

数据格式分为四层，由于 mem0ai 平台闭源，数据库端的存储格式参考开源 TS SDK，四层分为插件发出的请求格式、平台返回格式、插件实际消费格式和数据库存储格式。

① 插件发出的线上请求(camelCase → camelToSnakeKeys 转 snake_case):

 ```jsonc
   // POST https://api.mem0.ai/v1/memories/  (add)
   {
     "messages": [ { "role": "user", "content": "今天对话的原文文本" }, ... ],
     "user_id": "camellia",
     "app_id": "mem0",           // git 仓库根目录名
     "run_id": "a3f8c2...",      // session 文件 sha256 前 12 位(仅 session scope)
     "infer": true,              // true=云端 LLM 提炼;false=逐字存
     "custom_categories": [ { "identity": "Personal details..." }, ... ]  // 10 个固定类别
   }
 ```

 ② 平台返回/存储的逻辑记录(Memory 接口,mem0.types.ts:102-126):

 ```ts
   {
     id: string,               // UUID,插件格式化成 [mem0:uuid] 供 update/delete 引用
     memory: string,           // 提炼后的原子事实文本(不是对话原文!)
     hash: string,             // 内容哈希(平台去重用)
     categories: string[],     // 命中的类别(可多个,插件只取第一个)
     userId / appId / runId,   // scope 过滤维度
     createdAt / updatedAt,
     memoryType, score,        // score 仅搜索时返回(相似度)
     metadata, expirationDate, // 平台支持过期
     event: "ADD"|"UPDATE"|"DELETE"|"NOOP"  // add 调用返回每条记忆的处理事件
   }
 ```

 ③ 插件实际消费的字段只有 4 个(formatting.ts 的 MemoryLike):id / memory / categories / createdAt,渲染为:

```log
1. [lessons]Dream 锁要用 wx flag 原子创建 (3d ago) [mem0:9f2a1b7c-...]
```

④ 数据库部分其实分为一个向量库和一个 SQLite，分别有两个集合和两个表。

| 逻辑存储       | 引擎     | 对应接口                                                  | 作用                                                                                                              |
| ---------- | ------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 记忆集合       | 向量库    | `collection_name`(如 `mem0`)                           | **主存储**。提炼后的事实 + 向量 + payload(hash/时间/attributed_to)。所有语义检索(search/get_all)和 hash 去重都对着它                        |
| 实体集合       | 向量库    | `_entity_collection_name()` → `{collection}_entities` | **二级索引**。存 `{data: 实体名, entity_type, linked_memory_ids}`,把"同一个实体"跨记忆聚合,供按实体查询                                   |
| history 表  | SQLite | `_create_history_table()`                             | **审计流水**。每次 ADD/UPDATE/DELETE 都记一行 `{memory_id, old_memory, new_memory, event, created_at}`——记忆的完整变更时间线,可追溯、可回放 |
| messages 表 | SQLite | `save_messages()`                                     | **对话原文暂存区**。按会话键存 raw 消息,给 Phase 0 的 `get_last_messages()` 提供"最近 10 条"做指代消解。                                    |

   > 实体（entity）指的是现实世界对象，比如人/软件/品牌等，实体集合类似倒排索引，把有关同一个实体的记忆聚合在一起。我写到这里的时候有些好奇为什么不做记忆图谱，只做实体-记忆的索引，后来发现 mem0 main分支曾经有四个记忆图后端（ Neo4j/Memgraph/Kuzu/AGE ），在2026.3后全部删除，变为平台的收费特性
 
### Extraction

注意：pi-plugin 将每轮对话结果处理后 POST 给 mem0ai 平台，实际上记忆提取过程在平台内部进行，其行为不可见，提取部分依旧参考 TS SDK 的实现。

流程概述：
1. 捕获：在 agent_end hook 触发本轮对话捕获
2. 上下文收集：将本轮对话和 SQLite 中当前会话中存过的若干条消息组装为会话上下文
3. 记忆检索：用本轮 user message 作为 query 检索向量库，得到若干条相关事实
4. 事实提取：将会话上下文、记忆上下文和日期信息传给 LLM，生成一条或多条事实
5. 批量向量化：将事实都 embedding 为向量
6. 去重：由于同一个事实可能多次被提到，且提取 prompt 鼓励宁多勿漏，所以通过 hash 进行字节级去重
7. 组装：组装为存入数据库的格式
8. 入库：分别写入向量库和 SQLite

> 事实（memory item）即记忆条目本身，有8条质量标准（提取自 ADDITIVE_EXTRACTION_PROMPT）：
> 1. Self-contained：代词替换为具体名称，不需要其他信息即可理解
> 2. Contexually Rich：带有语境，不要为了简洁而丢失必要的上下文
> 3. Clean Factual Statement:去掉填充词，但是保留主观描述
> 4. Consice but Complete：限制长度，但是要求宁可拆分为不同条目也不要丢失细节
> 5. Temporally Grounded：将相对描述尽可能变为绝对，而绝不将绝对的描述变得模糊
> 6. Numerically Precise：标准5在数字上的进一步强调
> 7. Preserve Specific Details：专有名词具有最高价值，限定词不要泛化
> 8. Meaning-Preserving：语义精确，不含歧义，与原表述语义一致
> 总的而言，一条 memory item 应该是语义清晰、表述完整、长度有限的陈述句。

> 提取 prompt ( 即 ADDITIVE_EXTRACTION_PROMPT ) 直接影响最终的记忆条目产出结果，是提取流程的关键一步，上文的质量标准只是其中的一部分，它还包括角色设定、内容选择、完整性规则、链接规则 ( 如前文所述，开源 SDK 中0引用，gate 到平台中实现记忆图)、输出格式、终检清单和示例。 总的而言，这份 prompt 要求 LLM 尽可能宽的提取事实，宁多勿漏。

平台提取部分完整流程：

 ```mermaid
   flowchart TD
       subgraph 入口
           add["add()<br/>归一化filters与参数后调度写入"]
           infer_check{"infer?"}
       end

       subgraph 直写路径
           embed_raw["embedding_model.embed()<br/>对原文直接算embedding不经过LLM"]
           create_raw["_create_memory()<br/>生成uuid单条插入并记历史"]
       end

       subgraph Phase0_上下文收集["Phase 0 上下文收集"]
           scope["_build_session_scope()<br/>从filters派生会话键"]
           last_k["db.get_last_messages()<br/>SQLite取本会话最近10条消息供消解指代"]
           parse["parse_messages()<br/>把多模态content块拍平成纯文本"]
       end

       subgraph Phase1_存量检索["Phase 1 存量记忆检索"]
           embed_q["embedding_model.embed()<br/>把整段新对话编码成查询向量"]
           vsearch["vector_store.search()<br/>按scope过滤取最相关10条已有记忆"]
           anti_h["uuid_mapping<br/>把UUID换成整数编号防LLM编造ID"]
       end

       subgraph Phase2_LLM抽取["Phase 2 LLM抽取(唯一一次调用)"]
           gen_p["generate_additive_extraction_prompt()<br/>拼装已有记忆/新消息/last k/观测日期等分区"]
           llm["llm.generate_response()<br/>ADD-only抽取输出text加attributed_to加linked_memory_ids"]
           parse_j["remove_code_blocks()加extract_json()<br/>剥代码栅栏容错解析JSON失败得空表"]
           save_msg["db.save_messages()<br/>即使空抽取也把原文落SQLite"]
       end

       subgraph Phase3_5_批处理去重["Phase 3-5 批处理与去重"]
           embed_b["embedding_model.embed_batch()<br/>批量向量化"]
           dedup["md5 hash去重"]
           lemm["lemmatize_for_bm25()<br/>词形还原生成关键词检索字段"]
           payload["构建payload<br/>data加hash加时间戳加attributed_to配uuid4"]
       end

       subgraph Phase6_持久化["Phase 6 批量持久化"]
           vs_ins["vector_store.insert()<br/>批量写向量"]
           hist["db.batch_add_history()<br/>SQLite记ADD事件审计流水"]
       end

       subgraph Phase7_实体链接["Phase 7 实体链接(独立entity集合)"]
           ner["extract_entities_batch()<br/>对每条记忆做实体识别"]
           norm["_normalize_entity_text()<br/>归一化实体名跨记忆合并"]
           ent_emb["embed_batch(entities)<br/>批量编码唯一实体文本"]
           ent_q["entity_store.search_batch()<br/>找精确或score大于0.95的语义匹配"]
           ent_upd["entity_store.update()<br/>命中则把新记忆ID追加进linked_memory_ids"]
           ent_ins["entity_store.insert()<br/>新实体批量插入带类型与链接"]
       end

       add --> infer_check
       infer_check -->|"false 逐字模式即mem0-remember"| embed_raw --> create_raw
       infer_check -->|"true"| scope --> last_k
       scope --> parse --> embed_q --> vsearch --> anti_h
       anti_h --> gen_p --> llm --> parse_j
       parse_j -->|"空"| save_msg
       parse_j -->|"有结果"| embed_b --> dedup --> lemm --> payload --> vs_ins --> hist
       hist --> ner --> norm --> ent_emb --> ent_q
       ent_q -->|"命中"| ent_upd
       ent_q -->|"未命中"| ent_ins
 ```

 有意思的是，曾经 mem0 在事实提取后面还有一次 LLM 调用，进行判重和整理，不过后面删掉了，官方给出的理由感觉挺合理的：
 1. 防止信息丢失：写入时合并事实可能导致不可逆的信息丢失
 2. 时间推理：有时旧事实虽然与新事实冲突，但是保留它能更好理解事情发展
 3. 时间成本：显然 LLM 调用越少开销越低
 4. 重新分配：UPDATE/DELETE 只是脱离高频次调用的提取截断，转由手动调用或者异步的 DREAM 整理

这个逻辑和提取流程的哲学感觉还是很一致的——写入的时候多多的写，在后续阶段 memory item 还会通过修正层、维护层、衰减层和读取层，不过写入阶段是 ADD-only 的。

### Retrieval

检索部分分为三个主流程，`before_agent_start` hook 触发 search，search 向平台 POST 请求，平台执行检索，结果返回插件端，格式处理后写入系统提示词。平台部分的实现依旧参考自托管 TS SDK。

其中平台的检索分为三条路径，分别为语义、BM25和实体，各自打分再融合计算，总的流程大致为：
1. 预处理：将用户 query 分别处理成适配三路的形状，语义不需要处理，BM25要做分词和清洗，实体要做实体识别 
2. Semantic：调 `vector_store.search()` 拿相似记忆集合，这个集合也是其他两路的候选集，所以这一步做了超量拉取
3. BM25：调 `vector_store.keyword_search()` 计算 BM25 得分，通过 logistic sigmoid 归一化到 \[0,1]
4. Entity boost：实体去重、embed、查实体库、命中实体后查找关联记忆，最后计算 boost 得分
5. 融合运算：`combined = min((semantic + bm25 + entity) / max_possible, 1.0)`

> Entity boost 的计算公式为 $boost  = similarity × 0.5 × weight$
> 其中 weight 是热度衰减权重：$weight = 1 / (1 + 0.001 × (num_linked - 1)²)$ 
> 一个实体关联的记忆越多，其权重越低，旨在避免类似 pi 这种大众实体对任意 query 的压倒性优势。

> raw BM25 存在两个问题：query 越长，对于同一个 memory 命中的概率就越高，总分自然更高；分数无界。
> 为了解决这两个问题，mem0 引入了推广版 sigmoid 函数：$σ(raw) = 1 / (1 + e^(-steepness × (raw - midpoint)))$
> 其中 raw 表示 raw bm25 得分，midpoint（μ） 标定了曲线值为 0.5 的位置，steepness（k） 标定了曲线在中点的斜率。对于较短的 query，raw 集中且偏低，采用较小的 μ 和较大的 k，使得靠谱命中能过线的同时提高区分度；对于长 query ，raw 稀疏且偏高，采用较大的 μ 和较小的 k，抵消“虚胖”的同时防止全员饱和。

> 总得分是三路加和，但是实际上并不是每个 memory item 在所有路径上都有得分，此时如果不做归一化，则得分会处在 \[0,2.5]区间，max_possible 变量的意义就是对其做归一化。语义的满分为1，BM25 满分为1，entity 满分为0.5，每当一个路径跑通，max_possible 就加上这个路径的最大分数，这样总得分总是被约束在 \[0,1] 区间内。

