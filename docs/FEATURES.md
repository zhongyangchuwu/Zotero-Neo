# Neo 能做什么 {#features}

Neo 可以用键盘浏览文献、阅读 PDF、选中文字和添加批注，也能整理标签与笔记。这里挑几个常用操作介绍；所有快捷键见[命令参考](COMMAND_REFERENCE.md)。

## 输入页面上的词句，选中 PDF 文字 {#select-pdf-text-by-typing-what-you-see}

在 PDF 中按 `v`，输入页面上看到的词或短语。Neo 会在匹配的位置显示字母提示，按对应字母就能选中那段文字。

选中后，可以用 `h` / `l` 调整范围，按 `y` 复制，或者按 `zy` 添加黄色高亮。要选很长的一段，也可以查找另一端的位置，不必用鼠标从头拖到尾。

这项功能需要 PDF 自带可选取的文字。扫描版没有文字层时，Neo 不提供 OCR。

[试试文本选择](SELECTION_GUIDE.md#try-it)

## 浏览论文时先做标记，之后一起整理 {#build-a-reading-list-while-you-browse}

在 Zotero 的条目列表中按 `s`，就能把当前论文加入 Neo 选择集。你可以接着浏览、切换分类，之后按 `<Space>ss` 查看已标记的论文，一起添加标签或整理到分类中。

这个选择集只在当前窗口会话中有效，重启 Zotero 后不会保留。想长期保存阅读清单，请使用 Zotero 的分类或标签。

[管理文献](MAIN_GUIDE.md) · [整理标签](TAGS.md)

## 不选文字，直接复制 DOI、链接和批注 {#copy-references-and-annotation-content-by-label}

阅读 PDF 时，在普通模式下按 `y`，页面上能复制的 DOI、arXiv ID、网址、批注摘录和评论旁会显示字母提示。输入对应字母即可复制。按 `f` 可以打开支持的链接。

复制标识符或打开链接不会将论文导入文库。需要添加论文时，可以使用 Zotero 的“通过标识符添加条目”。

[复制或打开页面上的内容](READER_GUIDE.md#copy-or-follow-visible-targets) · [通过标识符添加文献](MAIN_GUIDE.md#add-items-by-identifier)

## 在标题、图表和阅读位置之间跳转 {#follow-the-structure-of-a-paper}

Neo 可以跳到上一节或下一节标题、图表和批注，也能给重要位置设置标记。要对照方法和实验结果，可以把同一份 PDF 分成两个窗格。

标题和图表跳转依赖 PDF 中可用的结构信息；没有这些信息时，仍可按页码导航或搜索文字。

[阅读器操作](READER_GUIDE.md) · [搜索和返回](SEARCH_GUIDE.md)

## 更多操作 {#explore-the-complete-workflow}

[使用指南](USER_GUIDE.md)按任务介绍文献库、PDF 和笔记的操作。初次使用看[安装与入门](GETTING_STARTED.md)；想改快捷键、滚动方式或主题，看[设置指南](SETTINGS_GUIDE.md)。
