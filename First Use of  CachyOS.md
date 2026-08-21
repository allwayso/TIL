### 尝试解决的问题

拿到了一个古早废弃 dell 笔记本，决定初尝 linux 系统，在神秘网站上看到 cachyOS 下载量很高，遂下载

## 双系统/单系统？

一开始不是很确定老电脑里面有没有还需要保存的东西，于是就下了 wiztree 看怎么删，腾出空间给 cachyOS。结果删了半天删掉 20G ，实在懒得删了，遂决定格盘下单系统。

## CachyOS 启动！

人生第一次装操作系统，值得纪念

### 安装阶段

1. 在U盘中下载 ventoy 和 cachyOS ISO，制作启动盘
2. 进 BIOS
3. F2->secure boot->disabled（不关的话会报错）
4. F12->UEFI USB HDD
5. ventoy->boot in normal mode
6. 进入live桌面，双击 install cachyOS，进入安装指引
7. 依次选择语言、时区、键盘、分区、文件系统、引导器、桌面、extra package，username

### 配置阶段

1. 更新系统：sudo pacman -Syu
2. 装 yay:git clone yay-bin
3. 装 clash：从主力机上下载 clash verge 到u盘，直接拷到牢笔记本里
4. Samba 共享：下载samba，编写config，设置账密
5. 常开：KDE和命令行两种方式设置屏幕常开，关闭自动休眠
6. 传递信息：pairdrop 比 localsend 好用很多，可能是防火墙的原因