## 尝试理解的问题

最初我的疑问是：对于 RAG 而言，我的检索内容和分块 chunk 的大小往往比较悬殊，使用同样的 embedding 模型得到的 token 长度差距会比较大，这会不会导致检索不精准。

但是在了解的过程中，我发现我对向量检索的基本原理都不了解，所以我觉得先了解一下 query 和 chunk 块的匹配机制是什么。于是我将基本问题展开为了一下的三个子问题：
1. 相似度算法是什么
2. ANN(Approximate Nearest Neighbor) 的基本原理
3. HNSW(Hierarchical Navigable Small Worlds) 的基本原理

