# 故障排查 {#troubleshooting}

从当前遇到的症状查找。下文的按键是默认绑定；如果改过快捷键，以设置中的当前值为准。

## 按键没有反应 {#a-key-does-nothing}

1. **先看焦点。** 点击要操作的区域：主窗口的条目列表或分类树、阅读器的 PDF 页面、笔记编辑器。搜索框、批注评论、Zotero 控件和输入法候选可能正在接收按键。刚打开的 PDF 要先等待加载，再点击页面。
2. **查看功能是否启用。** 用 `<Space>ps` 打开**设置 → 模块**，检查对应模块的**已应用**值和**运行状态**。停用、依赖被阻止和激活失败都可能使入口消失；仅勾选请求，不代表当前已经启用。
3. **检查绑定与上下文。** 在**设置 → 快捷键**中选择当前上下文，搜索动作或按键，查看它是默认、自定义还是未绑定。主窗口、阅读器、文本选择和笔记中的同一个键不一定做同一件事。
4. **检查相关行为开关。** 阅读器的 `v` 还受**文本选择模式**控制；Normal `i` / `Enter` 编辑已选批注还需开启**批注评论编辑**；笔记命令需要**Vim 风格笔记编辑**。这些偏好与模块开关不是同一层设置。

若阅读器显示原生输入状态，按普通 `Escape` 退出后再使用命令。原生文本框和输入法仍保留各自的文字编辑按键，不能把正在输入的字母当作 Neo 浏览命令。焦点与模式见[基本概念](CONCEPTS.md)，录键和重绑定见[设置指南](SETTINGS_GUIDE.md)。

## 模块请求已保存，功能却没有改变 {#module-request-not-applied}

模块只在下一次完全启动 Zotero 时应用。使用 Zotero 的退出命令彻底退出应用，再重新打开；只关闭某个窗口、重新打开 PDF，或在插件管理中停用后启用 Neo，都不会应用新请求。

**等待重启**表示保存的模块请求与本次启动时应用的配置不同，不表示保存失败。重启前继续按已应用值运行；详细状态见[模块参考](SETTINGS_REFERENCE.md#modules)。

## 模块显示已阻止或失败 {#module-blocked-or-failed}

- **已阻止**：查看行内列出的必需依赖。例如，摘录需要笔记和阅读选区。按自己的需要开启依赖或关闭请求，保存后重启 Zotero；Neo 不会自动替你修改其他开关。
- **失败**：查看该行的失败原因。故障属于具体窗口或阅读器实例，不代表其他健康实例都不可用。可关闭重开相应阅读器；仍无法恢复时，重启 Zotero，并保留错误提示以便反馈。
- **等待主机**：该功能尚未连接到所需的窗口或阅读器，例如还没有打开阅读器，不等同于失败。

反馈问题时，附上 Neo/Zotero 版本、当时所在区域、按键和可见错误。需要日志时，见[诊断说明](DEVELOPMENT.md#diagnostics)；不必先重置全部配置而丢掉问题发生时的状态。

## 无法通过快捷键打开设置 {#cannot-open-settings}

在 Zotero 原生偏好页找到 Zotero Neo，点击 **Open Neo Settings**。即使所有可选模块关闭，这个入口仍保留。然后查看模块状态或恢复需要的快捷键。

**恢复默认模块请求**只恢复默认全开的请求，仍需重启 Zotero；不会恢复快捷键、清空阅读器标记或删除资料。若要修改绑定，请在**快捷键**中处理对应条目，不要把两个恢复动作混为一谈。

## 无法应用快捷键修改 {#settings-will-not-apply-a-keybinding}

删除完全重复的绑定，改用没有被 Zotero 或文字编辑保留的按键，或选择支持该动作的上下文。若一个序列是另一序列的前缀，设置会警告较短命令可能等待后续输入，但仍允许保存。

录制时，`Enter` / `Escape` 是要记录的按键，不是结束或取消录制。使用界面上的**完成**或**取消**按钮，再点击**应用绑定**保存草稿。

## 笔记选择器为空，或找不到某条笔记 {#the-notes-chooser-is-empty-or-missing-notes}

初始范围只包含发起条目的已有笔记。选择 **Browse library**（浏览文库）查看同一文库中的其他笔记，选择 **Current item** 返回当前条目范围。标题相同时，查看预览中的所属条目和正文。

摘录只追加到已有笔记，不自动创建目的地。需要新笔记时，先用 Zotero 建立它；其他文库的笔记不在当前候选范围中。详见[查找笔记](NOTE_GUIDE.md#find-the-right-note)和[摘录到笔记](CAPTURE_GUIDE.md)。

## Flash 找不到文字 {#flash-does-not-find-a-phrase}

使用当前 PDF 视图中看得到、能选取的短词句。Flash 只匹配活跃视图的可见文字，不是整篇全文搜索，也不提供 OCR。扫描页没有可读文字层时，改用原生 PDF 操作；要搜索整篇文档，用阅读器 `/`。

## Enter 或 Escape 没有按 Neo 命令执行 {#enter-or-escape-does-not-act-like-a-neo-command}

先完成或取消当前输入法组字。候选窗口存在时，确认、取消和 Backspace 交给输入法，不会提前确认 Neo 选择器或退出编辑器。组合结束后，普通按键恢复各自语义，见[文本输入与输入法](INPUT_METHODS.md)。

## 评论中 Enter 换行，Escape 却保存了内容 {#enter-adds-a-line-in-a-comment-or-escape-saves-it}

这是批注评论编辑器的正常行为：`Enter` 换行，普通 `Escape` 保存最终草稿并关闭。编辑器保持打开时，最后一次输入约两秒后自动保存；Escape 不是放弃草稿。输入法组字期间的 Escape 则先由输入法处理。

关闭 PDF 视图或阅读器前，先按 `Escape` 保存；销毁视图本身不会补存尚未保存的文字。已经开始的原生保存不会因界面关闭而被撤销。详见[批注评论编辑](SELECTION_GUIDE.md#edit-an-annotation-comment)。

## 翻译或 citekey 复制不可用 {#translate-or-citekey-copy-is-unavailable}

Reader Select 的翻译动作依赖已安装的 **Translate for Zotero**。`<Space>yy` 需要 **Better BibTeX**，并且目标有可用的 citekey；任一目标或 citekey 无法解析时，Neo 拒绝复制并保留剪贴板。

相应 Neo 模块也需要处于可用状态。缺少外部集成不会因为给动作绑定一个按键就自动补上。

## Plugin Manager 找不到或不能安装扩展 {#plugin-manager-cannot-find-or-install-a-plugin}

`<Space>pp` 只管理 Zotero 已知的已安装扩展。它不提供扩展发现、安装、更新或移除，也不能停用 Neo 自身。这些操作请使用 Zotero 原生插件管理；如果 `<Space>pp` 入口不见了，先检查 Neo 的扩展模块是否已应用启用。

## 第一次标题或图表导航较慢 {#first-heading-or-figure-navigation-takes-a-while}

首次请求可能需要 Zotero 在本地分析 PDF，稍后请求可复用结果。某些 PDF 没有可用的标题、图或表目标，这时改用翻页或文字搜索。Neo 不根据看起来像标题的普通文字编造结构目标；具体入口见[阅读器指南](READER_GUIDE.md#find-a-passage-and-inspect-document-structure)。
