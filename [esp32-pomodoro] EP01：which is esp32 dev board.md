## esp32-pomodoro plan

出于对硬件的好奇，我决定用我的业余时间（全部时间？）学习一下 esp32。为什么是 esp32呢？大概是因为套件便宜+生态丰富吧。

作为 esp32 的启动计划，遵循我的 To learn is to create 准则，自然也是从一个项目开始认识 esp32 开发。

番茄钟，启动！

## Fight against some stupid barriers

### Which is dev board

Esp32 的套件不贵，搞到手之后自然得先翻一下那堆零件，看看开发板型号有没有买错——没想到这就是遇到的第一个考验，我还没查过开发板到底长啥样，而套件里面一堆零件，一个个都挺唬人的，导致我甚至找半天不知道哪个是开发板。

直到要通过 micro USB 线连接开发板的时候，才发现我之前拿的是一个 LCD1602 蓝屏，它上面根本没有任何插口，这谁绷的住。

至于软件环境的配置倒是相对轻松一点（指全部可以交给agent代工），VSCode里面下个 platformIO 插件就差不多完工了。哦其实好像没有那么简单，下好插件之后还需要从 PIO Home>Open 启动一个项目，然后就得到了以下这个项目最初的模样：

 ```text
   platformio.ini
   .gitignore  (内容只有 .pio)
   include/README
   lib/README
   src/        (空的,除非加了 --ide 或 -e)
   test/README
 ```
### Fucking useless micro USB line

好不容易分清楚屏幕和开发板的区别之后，还有第二关：卖家配的 micro USB 线接触不良，红灯一直不亮，直接给我干蒙蔽了。现在这个所谓的“安卓头”基本已经被淘汰了，在宿舍群收了一下也没收到，没招，美团吧。

线倒是很便宜，但是美团还得凑单有点烦，不过不知为何今晚特别想吃东西，干脆整了两个肠和一罐八宝粥，美滋滋。

### Anyway the light is up

最终还是完成了番茄钟的第一步：在开发板上跑起了一个循环

```powershell
正在执行任务: C:\Users\camellia\.platformio\penv\Scripts\platformio.exe device monitor --port COM3 

--- Terminal on COM3 | 115200 8-N-1
--- Available filters and text transformations: debug, default, direct, esp32_exception_decoder, hexlify, log2file, nocontrol, printable, send_on_enter, time
--- More details at https://bit.ly/pio-monitor-filters
--- Quit: Ctrl+C | Menu: Ctrl+T | Help: Ctrl+T followed by Ctrl+H
PI_FAST_FLASH_BOOT)
configsip: 0, SPIWP:0xee
clk_drv:0x00,q_drv:0x00,d_drv:0x00,cs0_drv:0x00,hd_drv:0x00,wp_drv:0x00
mode:DIO, clock div:2
load:0x3fff0030,len:1184
load:0x40078000,len:13232
load:0x40080400,len:3028
entry 0x400805e4
ESP32 OK
ESP32 OK
ESP32 OK
ESP32 OK
ESP32 OK
ESP32 OK
...
```
## New Knowledges

踏出门的前几步总是会接触到很多陌生的东西，这里尽可能有条理、精简地整理一下在摸索过程中得到的新知识。

### Difference between Type-c and Micro Usb

Micro Usb 是上个时代的产物，感觉十年之前的电子设备使用的还是蛮多的（或者那个时候 USB3 还没出来吧），它的电流和数据传输能力均不如 type-c，但体感上更显著的一点是 Micro USB 很容易弯折或者弹片疲劳，导致充电接触不良。我之前的手机很多就是这样退役的。

但是如果言尽于此似乎有些浅薄，让我们更深一层理解为什么需要 Micro Usb 转 Usb-A 。

这是由于开发板和电脑的语言不通，笔记本理解的是 USB 协议，而开发板理解的是 UART，所以需要一个“翻译”芯片来对齐两个协议，在 ESP32 中的这个芯片就是 CP2102 。当然只有开发扳方请了翻译还不行，笔记本方不认识翻译这个人，所以需要安装 Silicon Labs 的 VCP 驱动之后才能将其挂载为 COMx 端口。至此，双方可以进行流畅的对话了。

### What is An Esp32 Dev Board

首先要区分三个名称，ESP32-DOWD-V3 是芯片，ESP32-WROOM-32 是模组，ESP32-DevKit 是整个开发板，是层层包含关系。

或许我们可以再区分三种硬件，树莓派是一个极简但完整的“电脑”，而 ESP32 只能看作微控制器扳，远远称不上电脑。

当然通过类比PC主板的方式可以帮助我们理解 ESP32 开发板：

| PC 主板           | ESP32 开发板                      | 说明                   |
| --------------- | ------------------------------ | -------------------- |
| CPU 插槽 + CPU    | **ESP32-D0WD-V3**（在模组里）        | 处理器                  |
| DDR 内存条插槽       | 芯片内部的 **320 KB SRAM**          | 工作内存                 |
| M.2 / SATA 硬盘   | **4 MB SPI Flash**（在模组里）       | 非易失存储，放"引导程序 + 你的程序" |
| BIOS/UEFI 固件芯片  | ROM bootloader（芯片内固化）          | 第一阶段引导               |
| 引导加载器（GRUB）     | `bootloader.bin` @ `0x1000`    | 第二阶段引导               |
| MBR/GPT 分区表     | `partitions.bin` @ `0x8000`    | 描述存储怎么划分             |
| BIOS 启动顺序设置     | `otadata` @ `0xe000`           | 决定从哪个分区启动            |
| 双系统 A/B 分区      | `app0` / `app1`                | 同一个设计思路              |
| 网卡              | 内置 Wi-Fi + BT（模组内，带天线）         | 集成度更高                |
| 主板上的调试排针 / BMC  | CP2102 桥 + USB 口               | "外挂式管理通道"            |
| ATX 多路供电 + VRM  | USB 5V → 一颗 AMS1117 LDO → 3.3V | 极简到极致                |
| 前面板电源键 / 重启键    | **EN** 键                       | 硬复位                  |
| 前面板电源灯          | PWR 灯                          | —                    |
| PCIe / SATA 扩展槽 | **2×19 排针**                    | 只能插面包板级器件            |
| CMOS 电池（保存时间）   | ❌ 没有                           | 所以断电就丢时间             |
| 南桥/北桥芯片组        | ❌ 不存在                          | 外设控制器全集成进 SoC 了      |
 即使有这些相似之处，但是由于 ESP32 没有“操作系统”这一层抽象，用户代码直接跑在硬件上，这很容易出现不可预知的结果，比如 malloc 失败、递归太深导致的随机重启。当然没有操作系统自然也就没有虚拟内存，更不要提运算、存储、总线速度上几个数量级的差距。

### What is PlatformIO and Arduino?

### What happened when touching "Build" or "Upload" 

### The Architecture of a platformio project


