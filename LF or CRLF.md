## 2 Different Representation

LF 和 CRLF 是「文件里怎么表示一个换行」的两套约定：

LF = 一个字节 0x0A（Line Feed，换行）——Unix/Linux/macOS 用
CRLF = 两个字节 0x0D 0x0A（Carriage Return + Line Feed，回车 + 换行）——DOS/Windows 用

## Why Windows Using 2 Byte

来自打字机／电传打字机时代，那是两个独立的机械动作：

CR（回车）：把字车推回行首（横向归位）
LF（换行）：把纸往上卷一行（纵向进给）
所以 ASCII 给了两个码位：CR = 13 = 0x0D，LF = 10 = 0x0A。

## The Problem that 2 Format Can Cause

当两台机器分别使用 CR 和 CRLF 来表示换行的时候，对于同一个 git 仓库，对一个文本文件做 git diff 操作的时候会认为每一行都被改动，而实际上除了行尾编码其实没有任何区别。

## How to Avoid It

step1: 一般将统一格式设定为 LF，通过在 .gitattributes 里面设定 `*.txt text eol=lf` ，此时在 check in(commit)/out(clone) 时会将文本文件的 CRLF 行尾自动转为 LF
step2：step1 已经保证了在写入本地、写入仓库的时候格式为 LF，但是一些编辑器可能会自作主张将文件保存/打开为 CRLF，此时只需要在其设置中设为 `eol=lf` 即可
step3：以上设置是仓库内设置，如果希望全局设定为 LF 格式检入检出，可以使用 `git config --global core.autocrlf input`指令，在下一次 pull/checkout 的时候会将文本文件统一为原始格式。需要注意的是 .gitattributes 优先级高于 git config。


