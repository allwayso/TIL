link: [Eight years of wanting, three months of building with AI - Lalit Maganti](https://lalitm.com/post/building-syntaqlite-ai/)
## The sentences worth remembering

- But when I was tired, my prompts became vague, the output got worse, and I’d try again, getting more tired in the process. In these cases, AI was probably slower than just implementing something myself, ==but it was too hard to break out of the loop==
- Several times during the project, I ==lost my mental model== of the codebase ...The deeper problem was that losing touch created a communication breakdown. When you don’t have the mental thread of what’s going on, it becomes impossible to communicate meaningfully with the agent.
- Tests created a similar false comfort ... Neither humans nor AI are creative enough to foresee the sort of crazy things you might hit in the future. If you don’t have some fundamental foundation, you will be left eternally ==chasing bugs== as they happen.
- But expertise alone isn’t enough. Even when I understood a problem deeply, ==AI still struggled if the task had no objectively checkable answer==. Implementation has a right answer, at least at a local level: the code compiles, the tests pass, the output matches what you asked for. Design doesn’t.

## Look back at myself

LM 作为资深工程师，在 vibe-coding 的时候仍然遇到了很多问题，其中是一些视角是我没有考虑到过的，另外有一些视角是我体验到过没有想得那么清楚的。现在想来，我从来没有拥有过 vibe-coding 项目的心智模型，或许这就是提示词不够精准（完全不精准？）的重要来源。

但是即便如此，LM 的归纳仍然很有价值：
1. AI loop：当人精力越不集中/缺少耐心时，越容易丢失代码的心智模型，进而导致和 agent 的沟通低效，形成一坨 vibe-shit 或者偏离本意的产物，而结果不如意又加剧了人的烦躁，最终陷入不断抽奖、偶尔成功的循环。结果回头发现 vibe-coding 还不如自己写来的快和准确。
2. Tests are false comfort：不管是人还是 agent 都不能预知后续会发生什么，所以在前期/开发过程中设计大量的测试可能只是安慰剂。如果你没有技术上的基础，最终只能做一个追逐bug的人。
3. Code is cheap，design is not：具体代码的实现很快，但是设计架构上的改动和修正要保持一致性是很难的。