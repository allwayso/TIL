## 尝试解决的问题

在给 pi 写一个俄罗斯方块小游戏的时候意外接触到了神秘代码（代码？）：

```ts
const R = "\x1b[0m";
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[36m${s}${R}`;
const yellow = (s: string) => `\x1b[93m${s}${R}`;
const magenta = (s: string) => `\x1b[35m${s}${R}`;
const green = (s: string) => `\x1b[32m${s}${R}`;
const red = (s: string) => `\x1b[31m${s}${R}`;
const blue = (s: string) => `\x1b[34m${s}${R}`;
const orange = (s: string) => `\x1b[33m${s}${R}`;
```

经过初步了解得知这是 SGR ，ANSI 转义序列里控制文字外观的指令子集

## 基本语法

```ts
   ESC [ 参数 m
   // 如 \x1b[ 1;36 m

```

其中：
 - ESC = \x1b = \033 = ASCII 27
 - \[ 标记 CSI（Control Sequence Introducer）
 - 参数用 ; 分隔
 - m 结尾（SGR 的终止符）

其中每个参数对应一个指令，包括字重、下划线、字体、前景、背景颜色等等，其中一些是开启指令，若无执行对应关闭指令则持续开启，0 指令为关闭全部指令。