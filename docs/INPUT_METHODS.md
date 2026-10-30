# 文字输入和中文输入法 {#text-input-and-ime-ownership}

在搜索框、选择器或批注评论框中输入文字时，Neo 会让 Zotero 和输入法处理打字、选字、复制粘贴等操作。输入法还在选字时，`Enter`、`Escape` 和方向键会先交给输入法，不会误触发 Neo 命令。

## 在搜索框中输入中文 {#text-entry-controls}

选择器查询框、标签候选查询框、Plugin Manager 筛选框和 Reader Flash 查询框都可直接输入文字。输入法组合期间，候选移动、确认、`Escape` 和 `Backspace` 交由浏览器与输入法处理；尚未提交的组合内容不会触发 Neo 命令。提交后，Neo 使用查询文字匹配结果。批注评论编辑器中的文字也由原生输入控件处理；`Enter` 插入换行。

Note 编辑器中的普通文字与输入法输入由 Zotero 原生编辑器处理。开启 **Vim 风格笔记编辑** 时，只有 Note Normal 下的命令由 Neo 处理；进入 Insert 后，文字和输入法仍交给原生编辑器。

## 哪些按键由 Zotero 处理 {#native-and-local-shortcut-ownership}

焦点位于查询框或编辑器时，文字编辑、文本光标移动、已提交的查询内容，以及原生复制、粘贴和撤销仍由控件处理。选择器明确支持的结果导航、确认和取消等按键则由 Neo 按上下文处理；输入法组合期间这些按键仍交给输入法。解除某个 Neo 绑定也不会禁用 Zotero 的原生快捷键。

Zotero 或文本编辑保留的按键不能绑定给 Neo。多键序列中只要有一个按键属于原生保留按键，Neo 就会取消该待执行序列；序列中的每个按键都必须能由 Neo 执行。焦点或指针切换到原生界面时，待执行的 Neo 按键序列也会结束。

Reader Outline 中的方向键、`Tab`、`Shift+Tab`、`Enter`、`Return`（包括带修饰键的 `Enter`）仍由 Zotero 处理。Reader 的 Annotations、Bookmarks 和 Thumbnails 面板也保留原生方向键与 `Tab` 行为。Outline 的确认操作因此没有默认绑定；其余可绑定操作见[命令参考](COMMAND_REFERENCE.md#modes-focus-and-capabilities)。

Zotero 原生“通过标识符添加条目”窗口在显示、打开或关闭期间始终接收输入。文字、粘贴、输入法、`Enter`、`Shift+Enter`、`Escape` 和弹窗菜单按键都交给 Zotero；这里的 `Escape` 不会触发 Neo 对普通可编辑字段的通用取消行为。该窗口不是 Neo 模式，也不新增绑定上下文。

## Reader Flash {#reader-flash}

Flash 使用有焦点的查询框接收文字。文字编辑、`Backspace` 和输入法组合由浏览器处理；Neo 使用已提交的查询文字寻找当前 PDF 可见区域中的内容，再由提示标签确定目标。可输入 Unicode，也可使用输入法；候选文字必须能在当前阅读器视图中找到。Flash 不会对 PDF 做 OCR，不支持转写或模糊匹配；较宽泛的查询可缩小后再选择提示。按提示标签选择，或按 `Enter` 跳到最近的匹配项；按 `Escape` 取消 Flash 并保留现有选区。详见[命令参考中的 Reader Select](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)。

## 输入法选字时 {#compatibility}

操作系统负责显示输入法候选窗及处理输入法自身的按键。组合输入尚未提交时，输入法继续接收候选导航和确认等按键；提交文字后，再使用 Neo 支持的命令。