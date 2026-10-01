## Overview

## Main text

### 1.1 Information is bits + context

源代码中的字符通过 ASCII 码表示，所以源代码本质上是一个比特序列(a sequence of bits)。

### 1.2 Programs Are Translated by Other Programs into Different Forms

编译系统(compile system) 经过预处理器 (pre-prosessor), 编译器 (compiler), 汇编器 (assembler) 和链接器 (linker) 将源代码变为机器语言。

> GNU,GCC 和四个步骤的具体内容，不过对 GNU 更感兴趣一点

### 1.3 It Pays to Understand How Compilation Systems Work

为了提高程序性能、理解编译期错误和避免安全错误，程序员应当理解编译系统的工作原理。

### 1.4 Processors Read and Interpret Instructions Stored in Memory

用一张简化图理解当在 shell 中输入 `./hello` 时发生了什么：字符和回车键经过 USB controller 和 I/O bridge 先进入寄存器再写入主存，当回车键按下时 shell 通过 DMA 技术将目标文件的代码和数据从磁盘复制到主存中，然后处理器开始执行 main 函数中的指令，将 `hello,world` 从主存中写入寄存器，最终经过图形化适配器显示在屏幕上。

<div style="text-align: center;">
    <img src="Figure 1.4 Hardware organization of a typical system..png" width="500" />
    <div style="font-size: 0.85em; color: #888; margin-top: 5px;">ALU:arthimetic/logic unit; PC: promgram counter</div>
</div>

### 1.5 Caches Matter

1.4 展示的过程中有很多复制操作，为了提高程序的效率，必须加快字符在各个存储器之间运行的速度。而基于机械原理，越小的存储设备的读写速度越快，所以设计师在 CPU 中放入了一个读写速度接近寄存器的小型存储器，即高速缓存。由于程序的时间/空间上的局部性原理，一块很小的缓存就可以存储程序中频繁访问的大多数字段，从而减少CPU访问主存的时间，进而提高程序的效率。

### 1.6 Storage Devices Form a Hierarchy

寄存器、L1 缓存 ...... 直到远程存储器，构成了存储的分层架构，其基本原理是上层为下层的高速缓存。

<div style="text-align: center;">
    <img src="Figure 1.9 An example of a memory hierarchy.png" width="600" />
    <div style="font-size: 0.85em; color: #888; margin-top: 5px;">Figure 1.9 An example of a memory hierarchy</div>
</div>

### 1.7 The Operating System Manages the Hardware

操作系统是硬件层以上的一层抽象，应用程序必须通过操作系统操控硬件。

> linux and unix

### 1.8 Systems Communicate with Other Systems Using Networks

可以将网络连接作为一个 I/O 设备。

### 1.9 Important Themes

介绍了三个贯穿始终的概念：

- Amdahl 定律：设 α 为程序可以优化的部分占总体的比重，k 为优化程度，则总体的加速比 $S=\frac{1}{(1-\alpha) + \frac{\alpha}{k}}$
- 并发(concurrency)和并行(parallelism)
- 抽象

### 1.10 Summary

Just a summary repeating the sections.
