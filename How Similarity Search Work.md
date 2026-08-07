## 尝试理解的问题

最初我的疑问是：对于 RAG 而言，我的检索内容和分块 chunk 的大小往往比较悬殊，使用同样的 embedding 模型得到的 token 长度差距会比较大，这会不会导致检索不精准。

但是在了解的过程中，我发现我对向量检索的基本原理都不了解，所以我觉得先了解一下 query 和 chunk 块的匹配机制是什么。于是我将基本问题展开为了一下的三个子问题：
1. 相似性搜索是什么
2. ANN(Approximate Nearest Neighbor) 的基本原理
3. HNSW(Hierarchical Navigable Small Worlds) 的基本原理

整个向量检索是比较复杂的问题，放在一起讲篇幅较长，不符合 TIL 短平快的风格，所以将 HNSW 移至另一篇笔记中。
## 相似性搜索

传统搜索引擎、数据库基于符号对象的精确匹配，但是用户有时会提出一些语义不那么明确的 query，比如 ”beautiful shoes“ ，这就提出了模糊匹配的要求。

在机器学习的过程中，我们训练模型从文本/图像中通过向量形式提取深层语义，这个过程叫做 vector embedding。这意味着语义相似的向量在空间上是接近的，所以我们可以通过向量距离来衡量语义的相似度，这是向量数据库的基础。当然，用户 query 和数据要经过同一个 embedding 模型，避免不同的模型在语义理解上产生偏差。

那么如何计算向量之间的距离呢？在机器学习中常用的距离度量主要包括欧几里得距离、曼哈顿距离、余弦相似度和切比雪夫距离。


<div style="text-align:center;"> <img src="https://www.pinecone.io/_next/image/?url=https%3A%2F%2Fcdn.sanity.io%2Fimages%2Fvr8gru94%2Fproduction%2F61e84af94e074706365510888438a6520e28bceb-948x828.png&w=1920&q=75" width="500"> </div>

确定了距离计算的方法之后，接下来的关键就是如何进行高效的检索——即给定一组向量集合和一个查询向量，在集合中寻找与之最相似的项目。对于本节而言，主要考虑的是 K-NN，ANN 和 HNSW。

## ANN

在介绍 ANN 之前需要先介绍一下 K-NN。K-NN的基本算法是通过穷举向量集合，对其中所有向量与查询向量之间的距离进行排序，并找出前 K 个距离最近的向量。

纯粹 K-NN 算法没有误差，但是内存和计算的开销太大，有时候不得不牺牲一些精度来换取速度。这就引入了 ANN(approximate nearest neighbor) , 其形式化定义为：对查询 q，返回的 k 个点距离不超过真正最近邻的 (1 + ε) 倍，以概率 δ 保证。

为了换取速度，主要有两个优化方向：一个是加速运算，一个是减小搜索区域。本节中两个方向各提及一种算法，PQ 压缩和 HNSW。

### Product Quantization

高维向量的存储和运算都很贵，所以我们引入了 [PQ 压缩技术](https://mccormickml.com/2017/10/13/product-quantizer-tutorial-part-1/)。其大致思想如下：
1. 将高维空间 N 拆成 a 个子空间，比如把128维向量拆成8个16维向量
2. 在各个子空间上做 K-means 聚类，将每个子变量用其最近的聚类中心 id 表示，比如 K=256 时，每个子变量可以用 8 比特表示，这样就做了维度上的降维
3. 对于一个查询向量 q，将其也拆分为 a 个子向量，然后将其每个子向量与对应子空间上的 K 个聚类中心做距离运算，得到 a 张 N/a\*K 的表格，这个表格称为 codebook
4. 在遍历所有向量 v，计算其与 q 之间的距离的时候，只需要进行查表和加法运算即可。
5. 查表：查询向量 v 的每个子向量 $v_i$  编码对应的聚类中心与 ${q_i}$ 之间的距离 $d_i$ 
6. 加和： $d=d_1+d_2+d_3+...+d_a$ 即 q 与向量 v 之间的距离

> PQ 算法通过分割+聚类，将高维向量通过聚类中心+码本进行压缩，把高维向量乘法运算转变为查表+加法运算，降低内存占用的同时加速了运算。


## 参考文献

[Product Quantizers for k-NN Tutorial Part 1 · Chris McCormick](https://mccormickml.com/2017/10/13/product-quantizer-tutorial-part-1/)：pq 压缩和 K-NN
[What is Similarity Search? | Pinecone](https://www.pinecone.io/learn/what-is-similarity-search/):相似度搜索的基本框架
[Faiss: The Missing Manual | Pinecone](https://www.pinecone.io/learn/series/faiss/)：：FAISS算法的教学文档

