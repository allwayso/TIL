## 尝试解决的问题

粗读paper，只读概念，争取在一个小时内得到大致框架。内容包括：1intro全文，3.1首段和尾段，3.2开头段，5table2，8conclusion

---
## 正文

读到哪写到哪，不一定有逻辑关联
### 基础概念

1. Temporal composability：时间可组合性，即当移除一个组件的时候，其对环境产生的改变必须完全撤销
2. Spatial composability：空间可组合性，即组件必须通过结构化、可验证的方式声明、发现和解析彼此的依赖关系
### 偶遇容器

原文中提及 container orchestrator： One reason dynamic composability has received limited formal attention is that operating systems and ==container orchestrators== already provide a coarse-grained substitute.

所在段落标题为“The Coarse-Grained Workaround”，即粗粒度的权宜之计，指的是操作系统提供了进程级的时间可组合性（如果一个组件被分配到一个进程中，那么操作系统可以通过杀掉进程完全、安全的撤销组件的改动），并且由容器编排器提供了空间可组合性，但是这两者的粒度对于现代系统而言都太粗了。

这里操作系统我能够大概理解，但是容器编排器这个部分我不是很理解，之前虽然有接触过 docker 之类的容器管理软件，但是从来没有细究过 container 的真正作用。

由于此部分内容不是论文的核心内容，所以转移至[[Slight touch of container|另一篇笔记]]中展开。
