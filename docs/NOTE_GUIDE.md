# 查找并编辑 Zotero 笔记 {#find-and-edit-zotero-notes}

从当前条目的文库记录打开已有笔记，也可以在同一文库中查找其他论文的笔记或独立笔记。Neo 会在 Zotero 编辑器中打开笔记，内容按 Zotero 的常规方式保存。

## 开始查找并编辑笔记 {#try-it}

1. 在 Zotero 主窗口的条目列表中选中一篇论文，按 `<Space>fn` 打开笔记选择器。
2. 用方向键选择已有笔记并按 `Enter` 打开。要查找其他论文的笔记或独立笔记，选择 **Browse library**，再选中目标笔记。
3. 在笔记编辑器中单击正文。若已启用**Vim 风格笔记编辑**，按 `i` 输入，按 `Escape` 返回笔记 Normal 模式；若未启用，直接使用 Zotero 编辑器输入。

## 打开后的笔记内容 {#what-you-should-see}

打开后会显示笔记原有内容。预览会标明所属论文或独立笔记，并显示正文。要新建笔记，请先在 Zotero 中创建，再从选择器打开。

## 找到需要的笔记 {#find-the-right-note}

在主窗口、阅读器或笔记编辑器的 Normal 模式按 `<Space>fn`。选择器默认查找当前条目的笔记：主窗口使用条目游标所在条目，阅读器使用当前 PDF 所属条目，笔记编辑器使用当前笔记的所属条目；独立笔记以自身为范围。Neo 选择集不会改变阅读器或笔记编辑器的当前上下文。

选择 **Browse library** 可查找同一文库中其他论文的笔记和独立笔记；选择 **Current item** 返回原来的条目范围，且保留查询。标题相似时，查看预览中的所属条目和正文再确认。


## 在 Normal 模式中移动和编辑 {#move-and-edit-in-normal-mode}

在[设置 → 交互](SETTINGS_GUIDE.md#choose-note-and-picker-behavior)中启用**Vim 风格笔记编辑**，即可在笔记编辑器中使用 Vim 操作。此设置只控制笔记编辑，不会关闭 `<Space>fn` 笔记查找。Insert 模式中的文字输入和 IME 由 Zotero 编辑器处理；关闭该设置时，直接使用 Zotero 的常规编辑快捷键。

按 `h` / `j` / `k` / `l` 移动文本光标；`w` / `b` 按词移动，`0` / `$` 移到行首或行尾，`gg` / `G` 移到笔记开头或结尾。按 `i` 在光标处输入，按 `a` 在光标后输入，按 `A` / `I` 在行尾或行首输入。按 `o` / `O` 在下方或上方新建一行并开始输入。按 `Escape` 返回 Normal 模式。

小幅修改可以按 `x` 删除光标处字符，按 `dd` 删除一行，按 `dw` 从光标处按词向前删除。按 `ciw` 替换当前词，输入新文字后按 `Escape`。按 `u` / `<C-r>` 撤销或重做此笔记编辑器中的更改；它们不会撤销 Zotero 中的其他操作。

按 `yy` 复制一行，按 `yw` 复制一个词，按 `yiw` 复制当前词。这些复制操作会同时更新 Neo 的 Note 寄存器和系统剪贴板。`p` / `P` 只使用当前编辑器的 Note 寄存器，在光标后或前放入其中的文字；删除和修改命令也会更新该寄存器。切换笔记后，不会沿用另一编辑器的寄存器。要跨笔记粘贴或把其他应用的文字粘贴进笔记，按 `i` 进入 Insert，再用 Zotero 的原生粘贴快捷键（Windows/Linux 为 `Ctrl+V`，macOS 为 `Command+V`）。

笔记由 Zotero 编辑器按其常规行为保存。完整的移动和编辑命令见[命令参考：笔记编辑器](COMMAND_REFERENCE.md#note-editor)。


## 从笔记返回所属论文 {#continue-from-the-note-to-its-paper}

笔记有所属论文时，在笔记 Normal 模式按 `<Space>o` 打开该条目的 PDF；如果当前笔记属于另一条目，命令会使用笔记自己的上下文。独立笔记没有可打开的论文附件，请回到主窗口选择论文。

笔记有所属条目时，`<Space>ta` / `<Space>tr` 为该条目添加或移除标签；独立笔记的标签操作作用于笔记本身，而不是主窗口的 Neo 选择集。按 `<Space>yy` 可在有 citekey 时复制所属条目的 citekey。`<C-o>` / `<C-i>` 也可在支持的 Neo 历史位置间后退和前进；详见[共享后退与前进历史](SEARCH_GUIDE.md#shared-back-and-forward-history)。