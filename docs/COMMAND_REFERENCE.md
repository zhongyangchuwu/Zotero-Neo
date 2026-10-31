# 命令参考

在此查找命令的默认绑定、执行上下文、计数行为和目标条件。表中 Reader、Main 和 Note 分别指阅读器、主窗口和笔记编辑器。日常用法见[用户指南](USER_GUIDE.md)；标签操作与筛选见[标签指南](TAGS.md)；文字输入和输入法见[输入与输入法](INPUT_METHODS.md)。

## 目录

- [如何阅读此参考](#如何阅读此参考)
- [模式、焦点与功能可用性](#模式、焦点与功能可用性)
- [按键记法与输入规则](#按键记法与输入规则)
- [命令面板、重映射与未绑定操作](#命令面板、重映射与未绑定操作)
- [导航与共享跳转历史](#导航与共享跳转历史)
- [Reader 普通模式](#reader-普通模式)
- [Reader Select 与批注操作](#reader-select-与批注操作)
- [主窗口](#主窗口)
- [Note 编辑器](#note-编辑器)
- [临时界面与选择器操作规则](#临时界面与选择器操作规则)
- [Action ID 索引](#action-id-索引)
- [默认按键索引](#默认按键索引)
- [计数示例](#计数示例)

## 如何阅读此参考

每行命令列出其 `ActionId`、随 Neo 提供的默认绑定及可用上下文。同一个按键在不同上下文中可能执行不同操作。已保存的偏好设置可以添加或移除绑定；执行命令仍须有有效目标。

“历史记录”指 Neo 共享的后退/前进列表。只有操作完成后到达另一个可恢复的位置，才会添加记录；滚动等视图变化不算跳转。可恢复的位置及限制见[导航与共享跳转历史](#导航与共享跳转历史)。

## 模式、焦点与功能可用性

主窗口、阅读器、笔记、侧栏、选择器和 Plugin Manager 使用下表所列的绑定上下文。焦点决定当前可用的本地命令；目标、行为偏好和宿主状态也会影响具体操作。九个核心模块固定启用，只有链接与复制提示（`reader-hints`）和扩展管理面板（`extensions`）可关闭，设置见[模块设置指南](SETTINGS_GUIDE.md#开关两项可选功能)。

| 操作界面 | BindingContext | 可用功能 |
| --- | --- | --- |
| 阅读器 | `reader-normal` | 阅读、页面/视图与分类导航、批注、标签页、共享操作及普通模式命令面板。 |
| 阅读器 | `reader-select` | 对有效 PDF 文本选区进行微调和执行选区操作。 |
| 主窗口 | `main-normal` | Zotero 文库树和条目、搜索、Neo 选择集、命令及命令面板。 |
| 主窗口 | `main-select` | 主窗口可视条目行中的临时可视范围。 |
| 笔记 | `note-normal` | Note 光标移动、操作符及受支持的共享操作。 |
| 笔记 | `note-insert` | Note 编辑器原生文字输入及明确绑定的方向窗格焦点操作。 |
| Reader Outline | `reader-outline` | 四种面板焦点操作和全局标题导航；面板内支持上/下项、父级/子级与取消；支持 `uiConfirm`，但默认未绑定。标题、图注和表格标题导航也使用此上下文。 |
| Reader Bookmarks | `reader-marks` | 四种面板焦点操作和全局标题导航；面板内支持上/下项、首项/末项、确认、取消、删除和清除。 |
| Reader Annotations | `reader-annotations` | 四种面板焦点操作和全局标题导航；面板内支持上/下项与取消。 |
| Reader Thumbnails | `reader-thumbnails` | 四种面板焦点操作和全局标题导航；面板内支持上/下项与取消。 |
| 选择器查询框 | `picker-input` | 本地上/下项、确认、取消、预览移动和上/下窗格操作。查询文字和输入法仍由原生控件处理。 |
| 选择器结果 | `picker-list` | 支持查询框中的操作，另可在本地聚焦查询框。 |
| Plugin Manager 筛选框 | `plugins-input` | 仅支持 `uiFocusList`；其默认按键 `Escape` 会将焦点返回结果列表。 |
| Plugin Manager 结果 | `plugins-list` | 本地上/下项、首项/末项、翻页、搜索、取消及 Plugin Manager 操作。 |

Reader Select 处理符合条件的 PDF 文本选区；Main Select 是可视范围内条目行的临时选区。Note Insert 是 Note 编辑器的输入上下文。批注评论编辑和原生输入转交属于输入行为，不是 Reader 模式。文本框和正在进行的输入法组合保留原生编辑按键。

在 Reader 中，启用**文本选择模式**后按 `v` 进入 Select。启用**批注评论编辑**后，按 `i` / Enter 可打开符合条件的已选批注评论编辑器；其中显示 `COMMENT`，并非 Reader Insert 模式。若关闭批注评论编辑，按 `i` 会将键盘控制权交给原生输入，直到按 Escape。在 Main 中，`v` 开始选择临时条目行范围。在 Note 中，启用**Vim 风格笔记编辑**后按 `i` 进入 Insert；按 Escape 返回 Normal。

## 按键记法与输入规则

- 可打印按键按原样区分大小写：`g` 与 `G` 不同；`gg` 表示连续按两次 `g`。`<Space>` 表示空格键，`:` 表示冒号键。符号按键使用尖括号记法，例如 `<C-o>`、`<Enter>`、`<Return>`、`<Esc>` 和 `<BS>`。表格中同时列出的 `<Enter>` 与 `<Return>` 是同一按键的别名。
- Ctrl 与 Meta 会统一按 Ctrl 处理；`Ctrl`、`Alt`、`Shift` 可与其他按键组合。例如 `<C-d>` 表示 Ctrl+d。可打印的 Shift 符号按实际字符表示（例如 `+`）；命名按键可以显式保留 Shift。
- 支持计数的上下文可在命令前输入十进制数字。只有在已输入其他计数数字后，`0` 才会继续组成计数；否则它本身是命令，例如 Reader Select 的行首动作。每个动作分别规定计数是重复执行、选择指定位置，还是不起作用。
- 如果一个绑定同时也是更长序列的开头，Neo 会短暂等待后续按键；匹配到后续按键时执行较长绑定，超时则执行较短绑定。未匹配的按键会开始新命令。
- 等待命令时，`Escape` 取消整条待完成输入，包括计数，优先于退出 Select 等模式。`Backspace` 先删除序列中的末尾按键，序列退空后再逐位删除计数；退格后仍有前缀时，空闲 5 秒会清除它，不执行已取消的短动作。在没有待完成输入的查询框或编辑器中，退格仍用于编辑文字。
- 实际文字输入和输入法组合由浏览器/Gecko 处理。组合进行中或原生可编辑控件有焦点时，Neo 不会把组合按键重新解释为命令。`Dead`、无法识别的按键及仅修饰键事件不是命令。详见[输入与输入法](INPUT_METHODS.md)。
- 表格列出随 Neo 提供的默认绑定。Neo 未使用的按键仍可供 Zotero 或浏览器使用；原生文字输入和输入法规则见[输入与输入法](INPUT_METHODS.md)。

前缀提示按当前上下文和已保存的有效绑定列出后续按键，不限于 `<Space>`：Reader Normal 的 `[`、`]`、`g`、`z`，Reader Select 的 `z`，以及 Note Normal 的 `g`、`d`、`y`、`c` 都可显示。默认停顿 200ms 后出现；没有独立动作的前缀空闲 5 秒后清除，存在短动作／长序列歧义的绑定仍按匹配器的 800ms 超时决定。Reader 的数字计数即时显示在右下角状态指示器中，不等待指南延迟；命令执行或取消后清除。动态 `m{字符}` 与反引号书签输入不属于这份绑定指南。

## 命令面板、重映射与未绑定操作

在 Reader Normal、Main Normal 或 Note Normal 中按 `:` 打开命令面板。搜索可用操作，用 `↑` / `↓` 移动；结果列表获得焦点时也可按 `j` / `k`，或按 `Ctrl+j` / `Ctrl+k` 移动。按 Enter 执行，按 Escape 关闭。面板包含当前可用但没有按键绑定的操作；不接受命令参数或计数，选中的操作只执行一次。

在“设置 → 快捷键”中，可按操作组或上下文筛选，并按本地化名称、ActionId、当前按键或默认按键搜索。结果会标明**默认**、**自定义**或**未绑定**，包括受支持但没有快捷键的操作。

选择操作和上下文后，可添加、录制、解除绑定或重置其绑定。**添加**和**录制**是明确的控件；录制到的 `Enter` 与 `Escape` 会作为按键记录，因此要用**完成**或**取消**结束录制。修改在点击**应用绑定**前仍是草稿。重复绑定、不受支持的操作/上下文组合及原生保留按键都会阻止应用；严格前缀组合可以保存，但会显示警告。

选择**所有分组**时，原生快捷键会作为单独的只读条目显示。原生保留按键不能分配给 Neo，即使它只出现在某条序列中也不行。Outline 中的 `Enter` / `Return` 仍由 Zotero 处理；该上下文支持 `uiConfirm`，但默认未绑定。原生文字输入和输入法仍可正常使用。

**默认**表示该按键随 Neo 提供；**自定义**表示已保存的偏好设置改变了绑定；**未绑定**表示该可用操作没有按键。当前上下文不支持的操作不能通过分配按键变为可用。

## 导航与共享跳转历史

### 命令与计数行为

`navigateBack` 和 `navigateForward` 可在 Main Normal、Reader Normal 和 Note Normal 中使用；默认绑定为 `<C-o>` 和 `<C-i>`。快捷键前的正数计数会遍历相应数量的位置，例如 `2<C-o>`。命令面板中的操作不接受计数。到达列表任一端时，后退或前进都会停止。

每个 Main 窗口各有一份最多包含 100 个位置的列表。计数到达可用位置的末端时停止，不会循环。后退后发生新跳转会取代原来的前进分支；连续到达等效位置时会合并记录。后退/前进不会改变 Neo 选择集。

### 记录条件与排除项

只有操作完成并到达另一个可恢复的位置时，才会添加记录。无效果、失败或取消的操作不会添加记录。

| 界面/操作 | 历史记录行为 |
| --- | --- |
| Main 条目行 `gg` / `G` | 条目游标发生变化时可添加记录。Main `j` / `k` 和分类树移动不会添加记录。正数 `G` 选择从 1 开始计数的行；单独按 `G` 选择末行，`gg` 选择首行。 |
| Main 内部查找 `n` / `N` | 已提交的搜索移动条目游标时可添加记录。未命中、游标未变化或取消提示框都不会添加记录。 |
| Main 打开条目、条目/笔记选择器或在文库中显示 | 成功转到其他条目、笔记或标签页时可添加记录。切换分类范围、打开或浏览选择器、点击原生标签栏都不会添加记录。 |
| `H` / `L` 或确认标签页选择器 | 切换到另一打开的标签页时可添加记录。每次按 `H` / `L` 只切换一个标签页，忽略计数。选择当前标签页不会添加记录。 |
| Reader PDF 页面目标 | Zotero 支持页码导航时，`ngg` / `nG` 转到从 1 开始计数的第 `n` 页；请求页码是否有效由 Zotero 决定。不带计数时，`gg` 转到第一页起点，`G` 转到文档末尾。如果宿主不支持该 API，`gg` / `G` 会滚动到文档两端并忽略计数。普通滚动及相邻的 `h` / `l` 翻页不会添加记录。 |
| Reader 标记、Outline、批注导航、PDF 搜索结果及内部/引文链接 | 完成并转到另一个 Reader 位置时可添加记录。选择或高亮内容但位置未变时不会添加记录。 |
| 外部 PDF 链接 | 由 Zotero 打开，不属于 Neo Reader 历史记录。 |
| 滚动、缩放、分屏布局、选区/光标移动、筛选器及分类编辑 | 这些操作改变视图或选区状态，不改变历史位置。 |
| 操作失败、目标未变、选择器取消或目标不可用 | 不会添加新位置。 |

### 状态快照与恢复

- **Main：**后退/前进会恢复可用的文库或分类视图、Quick Search、标签和 Advanced Search 筛选器、条目游标及焦点。Neo 选择集保持不变。
- **Reader PDF：**恢复同一条目以及各 PDF 窗格中可恢复的页码/视口位置。缩放和分屏布局保持原样。若 Reader 标签页已关闭，只要附件仍可读取，Neo 就能重新打开它。
- **其他 Reader 标签页和普通标签页：**返回仍打开的标签页及 Zotero 保留的位置。PDF 附件历史记录无法重新打开已关闭的普通标签页。
- **Note：**独立 Note 会返回其标签页和原生保留的位置；上下文 Note 面板会恢复底层 Main 视图，但不会恢复 Note 光标或编辑器焦点。
- **目标不可用：**如果附件缺失、不可读或无法恢复，历史位置不会前移。部分恢复可能已改变先恢复成功的标签页或视图。

执行后退或前进前，Neo 会先更新离开位置，使上次跳转后的移动可作为返回点。关闭 Reader 或 Note 标签页不会清除历史；关闭 Main 窗口会清除该窗口的列表。新打开的 Reader 可能需要等加载完成后才能使用其命令。

### 混合导航示例

- 在支持数字页码导航的 PDF 中，`5gg` 转到第 5 页，单独按 `gg` 转到第一页起点。如果宿主不支持该功能，`gg` 会滚动到文档边界。
- 打开 Reader A，按 `L` 切换到 Reader B，再跳到一个标记。后退先返回标记跳转前的位置，再返回标签页切换前的位置；前进则按相反顺序恢复。
- 如果历史记录中的 Reader 标签页已关闭，后退可重新打开仍可读取的附件。目标不可读或不可用时，历史位置不变。
- 后退后发生新的已完成跳转时，会取代原来的前进分支；滚动或取消选择器不会建立新分支。

## Reader 普通模式

| ActionId | 默认绑定 | 含义／计数／历史记录 |
| --- | --- | --- |
| `toggleReadingMode` | `<Space>rr` | 切换当前分屏的 Zotero 原生 Reading Mode，使用同一 Reader Normal／Select 按键。 |
| `toggleBodySelection` | `<Space>rb` | 在当前 Reader 会话切换正文／全部文字选择。首次开启优先读取所选后端的有效缓存，缺失时显式准备原生结构；PDF 与 Reading Mode 的键盘选择排除图表、图注和页边文字；再次按下关闭。 |
| `openFigurePicker` | `<Space>rf` | 搜索已有解析中的图表，预览原 PDF 裁图。支持整组／独立主体、类型筛选及 `p:6` 页码查询；Enter 定位，Escape 取消。预览不改变阅读位置，确认沿用原生导航历史。 |
| `openChapterSearch` | `<Space>rs` | 在选择的章节及子章节中查找字面原文，按段落显示区域定位；Enter 确认，Escape 取消，不改变原生 Find。 |
| `openObjectExcerpts` | `<Space>re` | 预览、复制整组图表／公式与来源，可复制原图、结构文本或显式保存为新笔记；不恢复通用文字 Capture。 |
| `organizeChapterNotes` | `<Space>rn` | 预览当前 PDF 已有批注与图表摘录，按章节筛选并显式保存新笔记；相同内容复用已有笔记并保留手工修改。 |
| `prepareDocuments` | `<Space>ru`（Main／Reader） | 打开增强阅读准备：Main 固定 EffectiveSelection 对应 PDF，Reader 只取当前附件；优先读缓存，显式上传缺失项，显示逐文件进度、回执，支持停止本地等待和继续／重试。 |
| `compareDocumentParsing` | `<Space>rd` | 打开原生／云端解析对照（默认 MinerU）并读取匹配的本地缓存；普通解析按钮优先复用，缓存未命中时上传 PDF，“重新解析并上传 PDF”明确刷新结果。支持区域／整组定位及报告复制。 |
| `scrollDown` / `scrollUp` | `j` / `k` | 按设置的步长滚动；计数按倍数增加步长。连续滚动，不记入历史。 |
| `scrollLeft` / `scrollRight` | `zh` / `zl` | 按设置的步长水平平移；计数按倍数增加步长。 |
| `halfPageDown` / `halfPageUp` | `<C-d>` / `<C-u>` | 每步移动半个视口；计数会重复执行。 |
| `fullPageDown` / `fullPageUp` | `<C-f>` / `<C-b>` | 每步移动一个视口；计数会重复执行。 |
| `prevPage` / `nextPage` | `h` / `l` | 按 Zotero 的上/下一页步进执行 `max(1,count)` 次；相邻翻页不会添加历史位置。 |
| `firstPage` / `lastPage` | `gg` / `G` | Zotero 支持页码导航时，正数计数（`ngg` 或 `nG`）会定位到从 1 开始计数的页首；页码是否有效由 Zotero 决定。不带计数时，`gg` 转到第一页起点，`G` 转到文档末尾。若无页码导航功能，两者滚动到文档边界并忽略计数。 |
| `zoomIn` / `zoomOut` | `+`、`zI` / `-`、`zO` | 放大或缩小一个 Reader 缩放步长；计数会重复执行。 |
| `zoomReset` | `=`、`z0` | 重置缩放/适合页面宽度，只执行一次；计数不会重复执行。 |
| `scrollTop` / `scrollCenter` / `scrollBottom` | `zt` / `zz` / 未绑定 | 将当前页面放在视口顶部、中央或底部。`scrollBottom` 默认没有绑定。 |
| `openSearch` / `findNext` / `findPrevious` / `clearSearch` | `/`、`n`、`N`、`<Esc>` | 打开 Reader 的 PDF 查找栏；`n` / `N` 每次分别向后/向前请求一个 Zotero 搜索结果，不受计数影响。结果若转到另一个 Reader 位置，可添加历史记录。 |
| `followLink` | `f` | 为当前 PDF 视图中可见的原生内部链接、引文链接、外部链接及可识别的 DOI/arXiv/HTTP(S) 文本显示提示。输入提示以打开目标；按 Backspace 编辑，按 Escape 取消。原生链接仍使用 Zotero 行为；裸 DOI/arXiv 文本使用对应解析器。内部/引文目标可记入历史，外部链接不会。忽略计数。 |
| `copyTarget` | `y` | 为当前 PDF 视图中可见的 DOI/arXiv/HTTP(S) 文本、原生外部链接及批注摘录/评论目标显示提示。无需预先选择目标。确认提示后复制其内容；按 Escape 或无候选项时剪贴板保持不变。忽略计数。 |
| `prevHeading` / `nextHeading` | `[s` / `]s` | 按文档顺序在原生 Outline 的标题间导航，包括 Section 和 Subsection，并循环。无论分支是否折叠或当前选中了哪一行，都可从 Reader 普通模式及各 Reader 侧栏调用。 |
| `prevFigure` / `nextFigure` | `[f` / `]f` | 在明确标出的 Figure 目标及可识别的图注间移动。能关联时定位包含子图与 caption 的整组，否则定位到图注。首次使用可能需要在本地处理 PDF。 |
| `prevTable` / `nextTable` | `[t` / `]t` | 在明确标出的 Table 目标及可识别的表格标题间移动；能关联时包含表格本体和 caption。首次使用可能需要在本地处理 PDF。 |
| `prevAnnotation` / `nextAnnotation` | `[a` / `]a` | 选择上一条/下一条批注，到达任一端时循环；忽略计数。转到其他 Reader 位置时可添加历史记录。 |
| `prevBookmark` / `nextBookmark` | `[m` / `]m` | 按文档顺序在 Reader 标记间移动，到达任一端时循环。跳到标记可添加历史位置。 |
| `editAnnotation` | `<Enter>`、`<Return>` | 打开或聚焦选中批注的评论编辑器。输入指示为 `COMMENT`；Enter 插入换行，Escape 保存并关闭。 |
| `deleteAnnotation` | `dd` | 确认后删除选中的批注。取消确认则保留批注。 |
| `yankAnnotation` | **未绑定** | 从命令面板直接复制当前批注目标的摘录。没有有效批注目标时不会复制。 |
| `yankAnnotationComment` | `Y` | 直接复制当前批注目标的评论。没有有效批注目标时不会复制。 |
| `recolorYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | 更改选中批注的颜色。没有选中的批注时不起作用。 |
| `filterYellow/Red/Green/Blue/Purple` / `filterClear` | `Zy` / `Zr` / `Zg` / `Zb` / `Zp` / `Za` | 设置颜色筛选器，或清除批注侧栏的颜色筛选。 |
| `enterVisual` / `enterInsert` / `exitMode` | `v` / `i` / `<Esc>`（仅在 Neo 接管的上下文中） | 分别进入 Select、打开符合条件的批注评论，或退出当前交互。Reader 的这些操作受**文本选择模式**和**批注评论编辑**设置控制；`exitMode` 在 Reader Normal 中没有绑定。 |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | 将焦点移到该方向最近的可用窗格；不会循环，也不会创建窗格。 |
| `focusReaderOutline` / `focusReaderMarks` / `focusReaderAnnotations` / `focusReaderThumbnails` | `<Space>ro` / `<Space>rm` / `<Space>ra` / `<Space>rt` | 打开或聚焦 Outline、Bookmarks、Annotations 或 Thumbnails。重复执行时仍停留在该面板。 |
| `toggleReaderSplitHorizontal` / `toggleReaderSplitVertical` | `<Space>-` / <code>&lt;Space&gt;&#124;</code> | 切换 Reader 分屏布局。后退/前进不会恢复分屏布局。 |
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | 打开条目/笔记选择器。确认结果以打开它；浏览或取消不会添加历史位置。 |
| `mainAddByIdentifier` | `<Space>ai` | 将关联的 Library 窗口置前并打开原生标识符录入，不改变该窗口的分类范围。使用该主窗口上下文，而不是 Reader 条目的分类；忽略计数。见[通过标识符添加条目](MAIN_GUIDE.md#用-doi、arxiv-id-等添加论文)。
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | 选择已打开的标签页、切换到上一个/下一个标签页，或关闭当前标签页。切换可添加历史记录；每次 `H` / `L` 只切换一个，不受计数影响。关闭标签页不会清除较早的记录。 |
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | 遍历共享历史记录；快捷键支持计数，命令面板中的操作每次只执行一次。 |
| `openCommandPalette` / `openNeoSettings` / `managePlugins` | `:` / `<Space>ps` / `<Space>pp` | 打开命令面板、设置或常驻 Plugin Manager。 |
| `addTag` / `removeTag` / `addToCollection` / `removeFromCollection` | `<Space>ta` / `<Space>tr` / `<Space>ca` / `<Space>cr` | 对当前 Reader 条目执行标签或分类操作。候选项、目标规则和筛选条件见[标签操作与筛选](TAGS.md)。 |
| `mainYankCitekey` | `<Space>yy` | 复制当前 Reader 条目的 citekey；不会使用 Main 选择集。 |
| `showInLibrary` | **未绑定** | 在 Reader Palette 中将当前 Reader 条目显示在 Main 文库中。成功改变位置时可添加历史记录。 |
| `toggleReaderSidebarOutline` | **未绑定** | 切换 Zotero 原生 Reader Outline 侧栏；默认不提供绑定。 |
| `toggleMarksExplorer` | **未绑定** | 切换 Bookmarks 视图；默认不提供绑定。

Reader Select 操作见[Reader Select 与批注操作](#reader-select-与批注操作)。方向焦点操作只移到现有窗格，其中可能包括 Note 窗格。
Reader Normal 的计数规则因操作而异：滚动步进、半屏/整屏移动、`h` / `l` 翻页、缩放和历史导航会按所在行所述重复或遍历；支持页码导航时，数字 `gg` / `G` 是单次页码目标。搜索、批注、标签页切换、窗格/布局、选择器及其他 Reader Normal 操作都只执行一次。Reader Select 的绑定操作均忽略计数。

## Reader Select 与批注操作

在 Reader 中按 `v` 进入 Select，然后使用 Flash 选择一段文本范围；如果当前已有原生选区且可用，也可直接沿用该选区。Select 默认操作如下：

| ActionId | 默认绑定 | 含义 |
| --- | --- | --- |
| `flashText` | `s` | 使用 Flash 选择另一端，同时保留当前锚点。查询支持 Unicode 和输入法；按 Enter 选择最近的带标签目标，按 Escape 取消本次 Flash 操作。 |
| `extendTokenDown` / `extendTokenUp` | `j` / `k` | 按视觉行移动，保留水平位置并吸附完整词元。 |
| `extendTokenBackward` / `extendTokenForward` | `h` / `l` | 向前/向后调整一个词元；跨锚点时保留锚词，标点独立选择。 |
| `extendLeft` / `extendRight` | `H` / `L` | 按字符精细调整。 |
| `extendDown` / `extendUp` | — | 保留原始视觉行端点移动，可自定义绑定。 |
| `extendWordForward` / `extendWordBackward` | `w` / `b` | 扩展到下一个/上一个词边界。 |
| `extendLineStart` / `extendLineEnd` | `0` / `$` | 扩展到当前行边界。 |
| `extendSentenceForward` / `extendSentenceBackward` | `)` / `(` | PDF／Reading Mode 按唯一匹配到原文的逻辑段落和句界扩展；匹配失败保留原生 HTML／词元退路。 |
| `extendParagraphForward` / `extendParagraphBackward` | `}` / `{` | PDF／Reading Mode 按唯一匹配的逻辑段落边界扩展，可跨 span、栏或已渲染相邻页；来源不确定时保留退路。 |
| `swapVisualEnds` | `o` | 交换锚点和活动端。 |
| `openSelectionActions` | `a`、`<Enter>`、`<Return>` | 打开选区操作临时面板；取消不会清除选区。 |
| `highlightYellow/Red/Green/Blue/Purple` | `zy` / `zr` / `zg` / `zb` / `zp` | 根据当前范围创建相应颜色的批注。 |
| `addNote` | `za`、`i` | 在 PDF 中创建批注并打开其评论编辑器。 |
| `copySelection` | `y` | 复制已选 PDF 文本，并规范化换行和空白。 |
| `searchSelection` | `#` | 在 Reader 中搜索选中文字。 |
| `exitMode` | `v`、`<Esc>` | 取消 Reader Select 并返回 Normal。 |
| `underlineSelection` | **未绑定** | 如果内置操作可用，可通过选区操作执行受支持的 Select 操作；默认没有快捷键。 |

Flash 接受当前视图中的可见文字，包括 Unicode 和输入法输入。部分单词匹配会扩展到完整词元，短语扩展到首末完整词元，标点可独立选取；同一词元范围只显示一个提示。选择显示的提示，或按 Enter 选择最近的匹配项；去重后的目标超过 48 个时，继续输入以缩小查询。按 Escape 取消 Flash 并保留当前选区。选区操作提供“为选区添加下划线”和“添加批注评论”；仅在 Zotero Translate 集成可用时显示“翻译”。详见[输入与输入法](INPUT_METHODS.md#reader-flash)和[选择与批注指南](SELECTION_GUIDE.md#从一段文字开始)。
Reader Select 忽略计数：每次移动或选择操作都只执行一次。评论编辑器的控件和保存行为见[批注评论编辑器](#批注评论编辑器)。

## 主窗口

Main Normal 命令取决于焦点所在位置：分类树、条目列表、Quick Search、其他可编辑字段或 Neo 面板。条目游标、Zotero 原生多选、临时 Visual 范围和 Neo 选择集是不同目标。部分操作遇到隐藏或不可用目标时会拒绝执行，不会改为操作其他条目。Neo 选择集只保留在当前主窗口会话中，不跨重启保存。

### Main 操作

| ActionId | 默认绑定 | 含义／计数／历史记录 |
| --- | --- | --- |
| `mainNavDown` / `mainNavUp` | `j` / `k` | 在分类树或条目列表中向下/上移动条目游标；计数按行数累加，并限制在可见列表范围内。连续移动，不记入历史。 |
| `mainNavFirst` / `mainNavLast` | `gg` / `G` | 在条目列表或分类树中，`gg` 跳到首行，`G` 跳到末行；正数计数配合 `G` 会选择从 1 开始计数的行。只有条目游标变化时才可添加历史记录；分类树移动不会添加。 |
| `mainActivate` | `<Enter>`、`<Return>` | 在分类树中激活该范围；在条目列表中打开条目游标所在的条目/PDF。目标变化时可添加历史记录。 |
| `mainTreeCollapse` / `mainTreeExpand` | `h` / `l` | Items 获得焦点时，`h` 切换到 Collections；否则折叠已展开的分类，或选择其父级。选中非空且已折叠的分类时，`l` 展开它；若已展开或为空，则将焦点移到 Items。不记入历史。 |
| `mainTreeToggle` / `mainTreeOpenOnly` / `mainTreeCloseOnly` | `za` / `zo` / `zc` | 切换、仅展开或仅折叠选中的分类行。 |
| `mainTreeExpandAll` / `mainTreeCollapseAll` | `R` / `M` | 展开/折叠当前文库树中的所有分类。 |
| `mainTreeParent` | `<BS>` | 移到父级分类。 |
| `mainFocusTree` / `mainFocusLeft` / `mainFocusRight` / `mainFocusItems` | `e` / `wh` / `wl` / `ww` | 将焦点移到分类树、左侧窗格、右侧详情窗格或中间条目列表。焦点变化不记入历史位置。 |
| `mainEnterSelect` | `v` | 在条目行中开始临时 Visual 范围。 |
| `mainToggleSelection` | `s` | 将当前条目目标加入 Neo 选择集，或从中移除；若可能，再将条目游标移到下一行。在分类树中不会改变 Zotero 原生范围选择。 |
| `mainClearSelection` | `<Space>sc` | 明确清空 Neo 选择集。 |
| `mainCancelTarget` | `<Esc>` | 取消临时 Visual 范围或 Zotero 原生多选，不会清空 Neo 选择集。 |
| `mainSelectDown` / `mainSelectUp` | Main Select 中的 `j` / `k` | 按计数指定的行数扩展临时范围，并限制在可见列表范围内。 |
| `mainSelectFirst` / `mainSelectLast` | Main Select 中的 `gg` / `G` | `gg` 无论计数如何都扩展到首行；`G` 扩展到末行，或扩展到正数计数指定的行（从 1 开始计数）。 |
| `mainSelectSwapEnds` | Main Select 中的 `o` | 交换范围锚点和活动端。 |
| `mainSelectFinish` / `mainSelectCancel` | Main Select 中的 `s` / `v`、`<Esc>` | 提交或取消临时范围；取消不会清空 Neo 选择集。 |
| `mainTrashItems` | `dd`、`x` | Neo 选择集非空时将其中条目移入回收站；否则处理当前临时目标或条目游标所在条目。需要确认。隐藏的选择集成员会阻止操作；取消确认会保留选择集。 |
| `mainRestoreTrashedItems` | `u` | 恢复 Neo 最近一次移入回收站的条目批次；该批次不可用时操作无效果/失败。 |
| `mainOpenPDF` | `o` | 仅打开条目游标所在的条目/PDF；不会批量打开 Neo 选择集或 Zotero 原生多选中的条目。 |
| `mainYankCitekey` | `<Space>yy` | 复制 Main 当前有效条目目标的 citekey。任何目标不可用或缺少 citekey 时，剪贴板保持不变。 |
| `openSearch` | `/` | Main Normal 中要求 Items 获得焦点；会取消临时 Visual 范围，并打开 Neo 内部查找提示框，在可见条目行中搜索。它不是 Zotero Quick Search；后者使用 `mainQuickSearch`（`<Space>fq`）。 |
| `findNext` / `findPrevious` | `n` / `N` | 条目列表获得焦点时，按已提交的内部查找查询向前/后重复搜索一次；忽略计数。没有查询、未命中或游标未改变时，位置不变。游标改变时可添加历史记录。 |
| `mainQuickSearch` / `mainAdvancedSearch` | `<Space>fq` / `<Space>fa` | 聚焦原生 Quick Search 或打开 Advanced Search；`fa` 可将现有 Quick Search 文字转换过去。这些操作改变 Main 视图范围，不改变 Reader 页码位置。 |
| `mainAddByIdentifier` | `<Space>ai` | 为一个可写文库及其当前所选分类打开原生标识符录入；不使用条目目标或 Neo 选择集。跨文库或只读范围不可用；忽略计数。见[通过标识符添加条目](MAIN_GUIDE.md#用-doi、arxiv-id-等添加论文)。
| `findAllItems` / `findCollectionItems` / `findNotes` | `<Space>ff` / `<Space>fc` / `<Space>fn` | 打开共享的条目/笔记选择器。确认结果时可添加历史位置；浏览或取消不会添加。 |
| `findCollections` | **未绑定** | Main Normal：在一个文库范围内按名称或完整路径搜索分类。未选定文库范围时，提示 `Choose one library scope to find collections`。浏览或取消不会改变范围；确认后进入该分类，目标变化时可添加共享历史位置。 |
| `switchTab` / `previousTab` / `nextTab` / `closeCurrentTab` | `<Space>,` / `H` / `L` / `<Space>q` | 打开标签页选择器、切换到上一个/下一个打开的标签页，或关闭当前标签页。选择器确认、`H` / `L` 成功切换时会记录位置；`H` / `L` 忽略计数。单独关闭标签页不会记入历史，也不会删除旧记录。 |
| `navigateBack` / `navigateForward` | `<C-o>` / `<C-i>` | 按计数遍历共享历史记录。 |
| `addTag` / `removeTag` | `<Space>ta` / `<Space>tr` | 对 Main 当前标签操作目标执行操作。目标优先级、同一文库限制和候选项见[标签操作与筛选](TAGS.md)。 |
| `toggleTagFilter` / `clearTagFilters` | `<Space>tf` / `<Space>tc` | 仅限 Main：切换 Zotero 原生 AND 标签筛选，或清除全部标签筛选。不会记入跳转历史。 |
| `addToCollection` / `removeFromCollection` | `<Space>ca` / `<Space>cr` | 在 Main 中使用同一文库的有效条目目标。添加会显示直接成员关系覆盖情况，只补入尚未包含的条目；移除会列出至少分配给一个目标的分类，只移除选中的直接成员关系。其他成员关系和条目不变。Reader 仍只对当前条目执行操作。 |
| `addItemsToCurrentCollection` | **未绑定** | 需要一个当前有效的普通分类；否则提示 `Choose one active ordinary collection to add items`。操作开始后固定该分类，再搜索同一文库中的条目（每次查询最多 100 个结果）。每次按 Enter 保存一项并保持选择器打开；按 Escape 结束流程，但不会撤销已保存的添加。Main 筛选器和 Neo 选择集保持不变，因此新添加的条目可能仍不可见。 |
| `moveToCollection` | **未绑定** | 仅当一个有效普通分类作为明确来源且每个目标都直接属于该分类时，才能处理 Main 的有效条目目标。否则提示 `Move requires one active ordinary source collection; use Add to collection instead` 或 `Move requires unchanged targets directly assigned to the active source; use Add to collection instead` 并拒绝操作。选择同一文库中的目标分类；添加目标成员关系和移除来源成员关系会原子执行，其他成员关系保持不变。 |
| `moveCollection` | **未绑定** | 分类树获得焦点时使用树中条目游标所在的普通分类，即使 Zotero 同时选中了多个分类范围也不受影响；否则要求只有一个当前有效的普通分类。没有符合条件的目标时，提示 `Choose one ordinary collection; multiple selections are not supported`。可选择同一文库中的父分类或根目录；该分类及其后代一并移动，不能把它或后代选作目标。 |
| `createCollection` | **未绑定** | 分类树获得焦点时使用树中条目游标所属的文库；否则要求一个当前有效的文库/分类范围。没有范围时，提示 `Choose one library scope to create a collection`。明确选择父分类或文库根目录，在 Zotero 原生提示框中输入名称并确认。 |
| `renameCollection` | **未绑定** | 分类树获得焦点时重命名树中条目游标所在的普通分类；否则要求一个当前有效的普通分类。没有符合条件的目标时，提示 `Choose one ordinary collection; multiple selections are not supported`。使用 Zotero 原生名称提示框。 |
| `deleteCollection` | **未绑定** | 分类树获得焦点时删除树中条目游标所在的普通分类；否则要求一个当前有效的普通分类。没有符合条件的目标时，提示 `Choose one ordinary collection; multiple selections are not supported`。Zotero 原生 **Delete collection — keep items** 确认适用于整个子树；所有条目仍留在文库中，`u` 不能撤销分类结构的变更。 |
| `openCommandPalette` / `managePlugins` / `openNeoSettings` | `:` / `<Space>pp` / `<Space>ps` | 打开命令面板、常驻 Plugin Manager 或设置。 |
| `focusReaderSplitLeft/Down/Up/Right` | `<C-h>` / `<C-j>` / `<C-k>` / `<C-l>` | 将焦点移到该方向最近的可用窗格；到达边界时不循环。 |
| `showInLibrary` | **不支持** | Main Normal 不支持此功能。Reader Normal 和 Note Normal 的命令面板提供未绑定的操作；目标取自当前 Reader 或 Note 上下文条目，不会使用 Main 选择集。 |

Main 条目操作优先使用非空的 Neo 选择集；否则会按操作使用当前目标，例如 Visual 范围、Zotero 原生多选或条目游标。分类树范围选择与条目选择集相互独立。标签目标规则见[标签操作与筛选](TAGS.md)。

Main 中，`mainNavDown/Up`、`mainNavLast`、`mainSelectDown/Up`、`mainSelectLast` 和 `navigateBack/Forward` 会按计数重复。`mainNavFirst` 与 `mainSelectFirst` 始终选择首行。其他操作只执行一次；内部查找 `n` / `N` 每次只搜索一步，不受计数影响。

### Main 内部查找

条目列表获得焦点时，按 `/` 打开提示框；按 Enter 提交非空查询，并将条目游标移到下一个可见匹配项。按 Escape 取消，不会替换上一个查询。`n` / `N` 每次搜索一步，并在可见行中循环一次。匹配不区分大小写，范围包括条目显示名称/标题、首位创建者、年份及可用时的 citekey。没有查询、未命中或游标不可移动时，历史位置不变。内部查找不同于 `ff` / `fc` 选择器搜索和原生 `fq` / `fa` Quick/Advanced Search。

## Note 编辑器

启用**Vim 风格笔记编辑**后，Note 编辑器可使用 Normal 光标移动和编辑命令；此设置默认开启。按 `i` 进入 Insert，文字和输入法会交给 Zotero/浏览器；按 `Escape` 返回 Note Normal。关闭此设置时，文字输入仍由 Zotero 编辑器处理。

| ActionId | 默认绑定 | 操作效果 |
| --- | --- | --- |
| `noteMoveLeft` / `noteMoveDown` / `noteMoveUp` / `noteMoveRight` | `h` / `j` / `k` / `l` | 按字符/行移动光标。 |
| `noteMoveWordForward` / `noteMoveWordBackward` | `w` / `b` | 按词移动。 |
| `noteMoveLineStart` / `noteMoveLineEnd` | `0` / `$` | 在当前行内移动。 |
| `noteMoveDocumentStart` / `noteMoveDocumentEnd` | `gg` / `G` | 移到文档边界。 |
| `noteDeleteChar` | `x` | 删除光标所在字符。 |
| `noteAppendAfter` / `noteAppendLineEnd` / `noteInsertLineStart` | `a` / `A` / `I` | 分别在光标后、行尾或行首进入 Insert。 |
| `noteOpenLineBelow` / `noteOpenLineAbove` | `o` / `O` | 在下方/上方新建一行并进入 Insert。 |
| `noteUndo` / `noteRedo` | `u` / `<C-r>` | 撤销或重做一项 Note 编辑更改。 |
| `notePutAfter` / `notePutBefore` | `p` / `P` | 将 Neo 的 Note 内部寄存器内容粘贴到光标后/前。 |
| `noteDeleteLine` / `noteYankLine` | `dd` / `yy` | 删除/复制当前行。 |
| `noteDeleteLeft/Down/Up/Right` | `dh` / `dj` / `dk` / `dl` | 按相应方向的移动操作删除文本。 |
| `noteDeleteWordForward/Backward` | `dw` / `db` | 按词移动操作删除文本。 |
| `noteDeleteToLineStart/End` | `d0` / `d$` | 删除至行边界。 |
| `noteDeleteInnerWord` | `diw` | 删除当前内部词。 |
| `noteYankLeft/Down/Up/Right` | `yh` / `yj` / `yk` / `yl` | 按相应方向的移动操作复制到内部寄存器。 |
| `noteYankWordForward/Backward` | `yw` / `yb` | 按词移动操作复制文本。 |
| `noteYankToLineStart/End` | `y0` / `y$` | 复制至行边界。 |
| `noteYankInnerWord` | `yiw` | 复制当前内部词。 |
| `noteChangeLeft/Down/Up/Right` | `ch` / `cj` / `ck` / `cl` | 按相应方向的移动操作删除文本并进入 Insert。 |
| `noteChangeWordForward/Backward` | `cw` / `cb` | 按词移动操作替换文本并进入 Insert。 |
| `noteChangeToLineStart/End` | `c0` / `c$` | 替换到行边界并进入 Insert。 |
| `noteChangeInnerWord` | `ciw` | 替换当前内部词并进入 Insert。 |

Note Normal 还支持共享历史、命令面板、切换标签页、条目/笔记选择器、标签操作、设置、Plugin Manager 和复制 citekey。Note 不提供分类成员关系或 Main 标签筛选命令。在 Note Normal 中按 `<Space>o` 会打开 Note 上下文条目，而不是 Main 选择集。其他快捷键见默认按键索引。

Note 中，计数会重复 `h/l` / `j` / `k` / `w` / `b` / `0` / `$` 移动及 `x` 删除字符。`gg/G`、Insert 命令、`p` / `P`、撤销/重做以及每个 `d` / `y` / `c` 操作符都只执行一次，不受计数影响。`y` 会更新 Note 寄存器和系统剪贴板；删除/替换会更新 Note 寄存器，`p` / `P` 会粘贴其中内容。

## 临时界面与选择器操作规则

### 共享选择器

条目、笔记、标签页、标签和分类选择器共用查询框和结果控制。查询框与结果列表分别使用 `picker-input` 和 `picker-list` 上下文，可单独重映射。默认按键包括：Up/Down、`Ctrl+j` / `Ctrl+n` 和 `Ctrl+k` / `Ctrl+p` 移动；`Ctrl+d` / `Ctrl+u` 滚动预览；Enter 或 Shift+Enter 确认；Escape 取消。在结果列表中，`j` / `k` 可移动，`/` 聚焦查询框。`uiNextPane` 和 `uiPreviousPane` 在 `picker-input` 中受支持，但默认未绑定。查询文字和输入法由原生控件处理。可通过偏好设置启用鼠标选择行和双击确认；悬停不会选中结果。

笔记选择器（`fn`）默认显示当前条目的笔记。**Browse library**（浏览文库）可查找该文库中的其他现有笔记；**Current item**（当前条目）返回起始条目。预览会显示笔记所属条目和正文。确认 `fn` 的结果会打开该笔记。


添加标签时可能会提供明确的创建候选项；移除标签会列出至少分配给一个目标的标签。虚拟命名空间候选项仅用于缩小查询范围，本身不执行标签操作。Main `tf` 会根据当前视图和现有筛选器切换标签筛选；`tc` 不打开选择器，直接清除全部筛选。标签目标、同一文库范围内的修改限制和平面标签存储方式见[标签操作与筛选](TAGS.md)。Main 中，`ca` 和 `cr` 使用同一文库中的目标及直接成员关系计数，而不是递归显示范围：添加只补入缺少的成员关系；移除会列出至少分配给一个目标的分类，并只删除选中的成员关系。Main Normal 中七个分类操作默认未绑定，可从现有 Palette 打开；流程会复用现有选择器或 Zotero 原生名称/确认对话框。**向当前分类添加已有条目**会在每次按 Enter 时单独保存一项，并保持选择器打开；按 Escape 只结束流程，不会撤销已保存的添加。详情见[文库工作流](MAIN_GUIDE.md#把论文添加到分类或移出分类)。

### Flash 与链接提示

在 Reader Select 中按 `v` 会启动 Flash，以选择范围起点；按 `s` 则选择另一端。输入可见文字（包括通过输入法输入的 Unicode），再选择显示的提示，或按 Enter 选择最近的匹配项。Escape 会取消并保留现有选区；Backspace 根据焦点编辑查询文字或提示标签。

Reader Normal 中按 `f` 会为当前 PDF 视图内可见的内部、引文和外部链接显示提示。输入提示以跟随链接，按 Backspace 编辑，或按 Escape 取消。外部链接使用 Zotero 的常规处理方式；屏幕外的链接不会列出。

### Zotero 原生 Reader Outline 与 Bookmarks

Reader Normal 中按 `<Space>ro`、`<Space>rm`、`<Space>ra` 和 `<Space>rt` 可打开或聚焦 Outline、Bookmarks、Annotations 和 Thumbnails。重复执行会继续聚焦同一面板。每个 Reader 侧栏中也可使用这些面板焦点操作。

在 `reader-outline` 中，按 `j` / `k` 移动行，按 `h` / `l` 移到父级/子级；按 Escape 取消。Zotero 的方向键、Tab/Shift+Tab 和 Enter/Return 仍由原生界面处理。该上下文支持 `uiConfirm`，但默认未绑定。在 `reader-marks` 中，默认按键为 `j` / `k`、`gg` / `G`、Enter、Escape、`d` 和 `x`。在 `reader-annotations` 与 `reader-thumbnails` 中，默认按键为 `j` / `k` 和 Escape。可分别在这些上下文中重映射本地控制。

从 Reader Normal 和各侧栏按 `[s` / `]s` 可跨 Outline 按顺序遍历标题，无论分支是否折叠或当前选中了哪一行。按 `[f` / `]f` 和 `[t` / `]t` 可在 PDF 中有可用目标的 Figure 与 Table 之间移动；能关联时以子图或表格本体与 caption 的全部真实矩形定位，无法明确关联时保留 caption。首次明确请求结构导航可能需要在本地处理 PDF。无法识别目标的 PDF 不会提供这些位置。

### Marks 与 Bookmarks 分组

按 `m` 后接一个小写字母或数字，可设置 Reader 标记；按反引号再按该标签可返回该位置。按 `dm` 后接标签可删除一个标记，`dM` 删除所有标记。Reader Normal 中的 `[m` / `]m` 按文档顺序在标记间移动，并会循环。按 `<Space>rm` 打开或聚焦 Bookmarks。

在 Bookmarks 列表中，`j` / `k` 移动，`gg` / `G` 跳到首个/末个标记，Enter 跳转，`d` 删除所选标记，`x` 清除标记。标记标签只能是小写字母或数字；在列表中 `j`、`k`、`g`、`d` 和 `x` 是列表控制键。这些是 Reader 位置标记，不是 PDF 批注。是否持久保存由**持久化标记**偏好设置控制。

### 批注评论编辑器

启用**批注评论编辑**后，Reader Normal 中按 `i` / Enter 会打开选中批注的评论编辑器；Select 中按 `i` 会为新建批注打开编辑器。编辑器显示 `COMMENT`；输入文字或使用输入法编辑评论，按 Enter 插入换行，按 Escape 保存并关闭。更改还会在两秒后自动保存。Escape 不是取消或撤销；输入法组合进行时，Escape 由输入法自行处理。编辑器始终关联最初打开的批注；批注目标不可用时无法保存。关闭 Reader 不会再触发一次保存；重新打开时只能保证已保存的文字存在。

关闭该设置后，Reader Normal 中按 `i` 会将键盘控制权交给原生输入，直到按 Escape；Enter 不会打开 Neo 编辑器。Zotero 自带的评论字段仍可使用，Select 中独立的“添加批注评论”操作也仍会打开新批注的编辑器。

### 选区操作、Plugin Manager、设置与 Neo 选择集面板

在 Reader Select 中按 `a` / Enter 打开选区操作。用方向键或 `j` / `k` 移动，按 `Home` / `g` 选择首项，按 `End` / `G` 选择末项，按 `1`–`9` 或 Enter 执行操作。按 Escape 关闭面板并保留选区。可使用“为选区添加下划线”和“添加批注评论”；安装 Zotero Translate 后还会显示“翻译”。按 `y` 可复制结果。

按 `<Space>pp` 打开常驻 Plugin Manager，并在其中浏览扩展。在 `plugins-list` 中，默认按 `j` / Down、`k` / Up 移动，按 `gg` / Home 和 `G` / End 跳到首项/末项，按 `Ctrl+d` / `Ctrl+u` 翻页，按 `/` 筛选，按 Escape / `q` 关闭。按 `r` 刷新列表；Zotero 允许时可按 `e` / `d` 启用或停用扩展；按 `p` 打开已注册设置，按 `o` 打开主页，按 `R` 打开关联的 GitHub README，按 `L` 打开其提交历史。在 `plugins-input` 中按 Escape 返回结果。哪些生命周期操作可用由 Zotero AddonManager 决定；Neo 不能在自己的面板中停用自身。

按 `<Space>ps` 打开设置；快捷键修改在点击**应用绑定**前仍是草稿。按 `<Space>ss` 打开 Main 选择集面板：按 `j` / `k` 移动，按 `Home` / `gg` 或 `End` / `G` 跳到首项/末项，按 Enter 在文库中显示条目，按 `x` 将条目从 Neo 选择集中移除，按 `c` 清空选择集，按 `r` 刷新，按 Escape / `q` 关闭。条目不可用时无法显示；显示失败时面板会保持打开。

## Action ID 索引

此索引列出每个 `ActionId`、随 Neo 提供的默认绑定及可用上下文。**未绑定**表示该操作可用但没有随 Neo 提供的快捷键；执行操作仍需要有效目标。

| ActionId | 默认绑定 | 可用功能／主要效果 |
| --- | --- | --- |
| `scrollDown` | Reader Normal `j` | 阅读器向下滚动 |
| `scrollUp` | Reader Normal `k` | 阅读器向上滚动 |
| `scrollLeft` | Reader Normal `zh` | 阅读器水平向左平移 |
| `scrollRight` | Reader Normal `zl` | 阅读器水平向右平移 |
| `prevPage` | Reader Normal `h` | 阅读器翻到上一页 |
| `nextPage` | Reader Normal `l` | 阅读器翻到下一页 |
| `followLink` | Reader Normal `f` | 在 Reader 普通模式中为可见原生链接及可识别的 DOI/arXiv/HTTP(S) 文本显示跟随提示 |
| `copyTarget` | Reader Normal `y` | 在 Reader 普通模式中为可见批注和标识符目标显示复制提示 |
| `flashText` | Reader Select `s` | 在 Reader Select 中选择范围端点 |
| `firstPage` | Reader Normal `gg` | Reader 普通模式跳到首页或计数指定页 |
| `lastPage` | Reader Normal `G` | Reader 普通模式跳到文档末尾或计数指定页 |
| `halfPageDown` | Reader Normal `<C-d>` | Reader 普通模式向下移动半个视口 |
| `halfPageUp` | Reader Normal `<C-u>` | Reader 普通模式向上移动半个视口 |
| `fullPageDown` | Reader Normal `<C-f>` | Reader 普通模式向下移动一个视口 |
| `fullPageUp` | Reader Normal `<C-b>` | Reader 普通模式向上移动一个视口 |
| `zoomIn` | Reader Normal `+`、`zI` | Reader 普通模式放大 |
| `zoomOut` | Reader Normal `-`、`zO` | Reader 普通模式缩小 |
| `zoomReset` | Reader Normal `=`、`z0` | Reader 普通模式重置缩放 |
| `scrollTop` | Reader Normal `zt` | 将视口定位到当前页面顶部 |
| `scrollCenter` | Reader Normal `zz` | 将视口定位到当前页面中央 |
| `scrollBottom` | **未绑定** | Reader 局部的视口定位功能 |
| `openSearch` | Reader/Main Normal `/` | Reader 搜索；Main 的原生搜索/内部查找分派 |
| `findNext` | Reader/Main Normal `n` | Reader/Main 搜索结果或 Main 内部查找 |
| `findPrevious` | Reader/Main Normal `N` | Reader/Main 搜索结果或 Main 内部查找 |
| `prevAnnotation` | Reader Normal `[a` | Reader 批注导航 |
| `nextAnnotation` | Reader Normal `]a` | Reader 批注导航 |
| `prevHeading` | Reader Normal 和四个侧栏上下文 `[s` | 在整个原生 Outline 中前往上一个 Section/Subsection；按当前 PDF 位置、文档顺序导航，到达边界时循环 |
| `nextHeading` | Reader Normal 和四个侧栏上下文 `]s` | 在整个原生 Outline 中前往下一个 Section/Subsection；按当前 PDF 位置、文档顺序导航，到达边界时循环 |
| `prevFigure` | Reader Normal `[f` | 前往上一个 Figure 目标或可识别的图注；能关联时定位包含子图与 caption 的整组，否则定位到图注。首次使用可能需要在本地处理 PDF。 |
| `nextFigure` | Reader Normal `]f` | 前往下一个 Figure 目标或可识别的图注；能关联时定位包含子图与 caption 的整组，否则定位到图注。首次使用可能需要在本地处理 PDF。 |
| `prevTable` | Reader Normal `[t` | 前往上一个明确标出的 Table 目标或可识别的表格标题；首次使用可能需要在本地处理 PDF。 |
| `nextTable` | Reader Normal `]t` | 前往下一个明确标出的 Table 目标或可识别的表格标题；首次使用可能需要在本地处理 PDF。 |
| `prevBookmark` | Reader Normal `[m` | 按文档顺序前往上一个 Reader 标记，到达开头时循环。 |
| `nextBookmark` | Reader Normal `]m` | 按文档顺序前往下一个 Reader 标记，到达末尾时循环。 |
| `clearSearch` | Reader Normal `<Esc>` | 清除/关闭 Reader 搜索 |
| `enterVisual` | Reader Normal `v` | 进入 Reader Select |
| `toggleBodySelection` | Reader Normal `<Space>rb` | 切换当前 Reader 会话的正文选择 |
| `openSelectionActions` | Reader Select `a`、`<Enter>`、`<Return>` | 打开选区操作 |
| `enterInsert` | Reader Normal `i`；Note Normal `i` | Reader 功能/原生输入控制；Note 编辑器切换到 Insert |
| `exitMode` | Reader Select `<Esc>`/`v`；Note Normal `<Esc>`；Note Insert `<Esc>` | 退出当前界面模式；Reader 的 Escape 是固定的输入控制键，Main Select 使用专用取消操作 |
| `extendTokenDown` | Reader Select `j` | 移到下一视觉行并吸附词元 |
| `extendTokenUp` | Reader Select `k` | 移到上一视觉行并吸附词元 |
| `extendTokenBackward` | Reader Select `h` | 活动端后退一个词元 |
| `extendTokenForward` | Reader Select `l` | 活动端前进一个词元 |
| `extendDown` | 无默认绑定 | 保留原始视觉行移动，可自定义 |
| `extendUp` | 无默认绑定 | 保留原始视觉行移动，可自定义 |
| `extendLeft` | Reader Select `H` | 按字符向左精细调整 |
| `extendRight` | Reader Select `L` | 按字符向右精细调整 |
| `extendSentenceForward` | Reader Select `)` | Reader Select 中移动选区范围 |
| `extendSentenceBackward` | Reader Select `(` | Reader Select 中移动选区范围 |
| `extendParagraphForward` | Reader Select `}` | Reader Select 中移动选区范围 |
| `extendParagraphBackward` | Reader Select `{` | Reader Select 中移动选区范围 |
| `extendWordForward` | Reader Select `w` | Reader Select 中移动选区范围 |
| `extendWordBackward` | Reader Select `b` | Reader Select 中移动选区范围 |
| `extendLineStart` | Reader Select `0` | Reader Select 中移动选区范围 |
| `extendLineEnd` | Reader Select `$` | Reader Select 中移动选区范围 |
| `highlightYellow` | Reader Select `zy` | 在 Reader Select 中创建批注 |
| `highlightRed` | Reader Select `zr` | 在 Reader Select 中创建批注 |
| `highlightGreen` | Reader Select `zg` | 在 Reader Select 中创建批注 |
| `highlightBlue` | Reader Select `zb` | 在 Reader Select 中创建批注 |
| `highlightPurple` | Reader Select `zp` | 在 Reader Select 中创建批注 |
| `underlineSelection` | **未绑定** | Reader Select 可通过选区操作使用此操作 |
| `addNote` | Reader Select `za`、`i` | 创建批注并打开评论编辑器 |
| `copySelection` | Reader Select `y` | 复制已选文字 |
| `searchSelection` | Reader Select `#` | 搜索已选文字 |
| `swapVisualEnds` | Reader Select `o`; Main Select `o` maps to `mainSelectSwapEnds` | Reader Select 交换选区端点；Main Select 的 `o` 映射到 `mainSelectSwapEnds` |
| `editAnnotation` | Reader Normal `<Enter>`、`<Return>` | 打开批注评论编辑器 |
| `deleteAnnotation` | Reader Normal `dd` | 确认后删除批注 |
| `filterYellow` | Reader Normal `Zy` | 按批注颜色筛选 |
| `filterRed` | Reader Normal `Zr` | 按批注颜色筛选 |
| `filterGreen` | Reader Normal `Zg` | 按批注颜色筛选 |
| `filterBlue` | Reader Normal `Zb` | 按批注颜色筛选 |
| `filterPurple` | Reader Normal `Zp` | 按批注颜色筛选 |
| `filterClear` | Reader Normal `Za` | 清除批注筛选 |
| `recolorYellow` | Reader Normal `zy` | 更改批注颜色 |
| `recolorRed` | Reader Normal `zr` | 更改批注颜色 |
| `recolorGreen` | Reader Normal `zg` | 更改批注颜色 |
| `recolorBlue` | Reader Normal `zb` | 更改批注颜色 |
| `recolorPurple` | Reader Normal `zp` | 更改批注颜色 |
| `yankAnnotation` | **未绑定** | 从命令面板直接复制当前批注目标的摘录 |
| `yankAnnotationComment` | Reader Normal `Y` | 直接复制当前批注目标的评论 |
| `openCommandPalette` | Reader/Main/Note Normal `:` | 打开当前上下文的命令面板 |
| `openNeoSettings` | Reader/Main/Note Normal `<Space>ps` | 打开设置界面 |
| `findAllItems` | Reader/Main/Note Normal `<Space>ff` | 打开共享文库条目选择器 |
| `findCollectionItems` | Reader/Main/Note Normal `<Space>fc` | 打开共享分类条目选择器 |
| `findNotes` | Reader/Main/Note Normal `<Space>fn` | 打开共享 Note 选择器 |
| `findCollections` | **未绑定** | 在 Main Normal 中按名称或完整路径搜索分类 |
| `mainQuickSearch` | Main Normal `<Space>fq` | 聚焦 Zotero 原生 Quick Search |
| `mainAdvancedSearch` | Main Normal `<Space>fa` | 打开 Zotero 原生 Advanced Search |
| `managePlugins` | Reader/Main/Note Normal `<Space>pp` | 打开 Plugin Manager 面板 |
| `manageSelection` | Main Normal `<Space>ss` | 打开 Main 选择集面板 |
| `navigateBack` | Reader/Main/Note Normal `<C-o>` | 在共享跳转历史中后退 |
| `navigateForward` | Reader/Main/Note Normal `<C-i>` | 在共享跳转历史中前进 |
| `showInLibrary` | **未绑定** | Reader Normal 和 Note Normal 的命令面板提供此操作；Main Normal 不可用。 |
| `mainTrashItems` | Main Normal `dd`、`x` | 确认后将 Main 条目移入回收站 |
| `mainRestoreTrashedItems` | Main Normal `u` | 恢复 Neo 最近一次移入回收站的条目批次 |
| `mainFocusTree` | Main Normal `e`；Note Normal `<Space>e` | 将焦点移到 Main 分类树 |
| `mainFocusLeft` | Main Normal `wh` | 将焦点移到左侧窗格 |
| `mainFocusRight` | Main Normal `wl` | 将焦点移到详情窗格 |
| `mainFocusItems` | Main Normal `ww` | 将焦点移到条目列表 |
| `mainYankCitekey` | Reader/Main/Note Normal `<Space>yy` | 根据当前上下文复制 citekey |
| `mainAddByIdentifier` | Reader/Main Normal `<Space>ai` | 在关联的 Library 窗口中打开 Zotero 原生“通过标识符添加条目”；不使用条目选择集 |
| `mainOpenPDF` | Main Normal `o`；Note Normal `<Space>o` | 打开 Main 条目游标所在的条目，或 Note 上下文条目 |
| `closeCurrentTab` | Reader/Main/Note Normal `<Space>q` | 关闭当前标签页 |
| `addTag` | Reader/Main/Note Normal `<Space>ta` | 为符合条件的目标添加标签 |
| `removeTag` | Reader/Main/Note Normal `<Space>tr` | 从符合条件的目标移除标签 |
| `toggleTagFilter` | Main Normal `<Space>tf` | 切换 Main 的 Zotero 原生标签筛选 |
| `clearTagFilters` | Main Normal `<Space>tc` | 清除 Main 标签筛选 |
| `addToCollection` | Reader/Main Normal `<Space>ca` | 将条目添加到分类 |
| `removeFromCollection` | Reader/Main Normal `<Space>cr` | 从分类移除条目 |
| `addItemsToCurrentCollection` | **未绑定** | 在 Main Normal 中搜索同一文库的条目；每次按 Enter 保存一项并保持选择器打开 |
| `moveToCollection` | **未绑定** | 在 Main Normal 中，将条目从一个明确指定且直接包含这些条目的来源分类原子移动到目标分类 |
| `moveCollection` | **未绑定** | 在 Main Normal 中将当前分类移到另一个父级 |
| `createCollection` | **未绑定** | 在 Main Normal 中于明确指定的分类或文库根目录下创建分类 |
| `renameCollection` | **未绑定** | 在 Main Normal 中重命名当前分类 |
| `deleteCollection` | **未绑定** | 在 Main Normal 中删除分类子树，但保留条目 |
| `mainEnterSelect` | Main Normal `v` | 在 Main 条目行中开始 Visual 范围 |
| `mainToggleSelection` | Main Normal `s` | 切换条目是否属于 Neo 选择集 |
| `mainClearSelection` | Main Normal `<Space>sc` | 清空 Neo 选择集 |
| `mainCancelTarget` | Main Normal `<Esc>` | 仅取消临时目标 |
| `mainSelectDown` | Main Select `j` | 扩展 Main Visual 范围 |
| `mainSelectUp` | Main Select `k` | 扩展 Main Visual 范围 |
| `mainSelectFirst` | Main Select `gg` | 将范围扩展到首项 |
| `mainSelectLast` | Main Select `G` | 将范围扩展到末项 |
| `mainSelectSwapEnds` | Main Select `o` | 交换范围两端 |
| `mainSelectFinish` | Main Select `s` | 提交 Main Visual 范围 |
| `mainSelectCancel` | Main Select `v`、`<Esc>` | 取消 Main Visual 范围 |
| `mainNavDown` | Main Normal `j` | 移动 Main 条目游标 |
| `mainNavUp` | Main Normal `k` | 移动 Main 条目游标 |
| `mainNavFirst` | Main Normal `gg` | 移到 Main 首行 |
| `mainNavLast` | Main Normal `G` | 移到 Main 末行 |
| `mainActivate` | Main Normal `<Enter>`、`<Return>` | 激活当前范围或打开条目 |
| `switchTab` | Reader/Main/Note Normal `<Space>,` | 打开标签页选择器 |
| `previousTab` | Reader/Main/Note Normal `H` | 切换到上一个打开的标签页 |
| `nextTab` | Reader/Main/Note Normal `L` | 切换到下一个打开的标签页 |
| `mainTreeToggle` | Main Normal `za` | 切换分类行的展开状态 |
| `mainTreeOpenOnly` | Main Normal `zo` | 展开分类行 |
| `mainTreeCloseOnly` | Main Normal `zc` | 折叠分类行 |
| `mainTreeExpand` | Main Normal `l` | 展开分类或聚焦条目列表 |
| `mainTreeCollapse` | Main Normal `h` | 折叠分类、移到父级或聚焦分类树 |
| `mainTreeParent` | Main Normal `<BS>` | 移到父级分类 |
| `mainTreeExpandAll` | Main Normal `R` | 展开所有分类 |
| `mainTreeCollapseAll` | Main Normal `M` | 折叠所有分类 |
| `focusReaderSplitLeft` | Reader/Note/Main Normal 和 Note Insert `<C-h>` | 朝指定方向切换窗格焦点 |
| `focusReaderSplitDown` | Reader/Note/Main Normal 和 Note Insert `<C-j>` | 朝指定方向切换窗格焦点 |
| `focusReaderSplitUp` | Reader/Note/Main Normal 和 Note Insert `<C-k>` | 朝指定方向切换窗格焦点 |
| `focusReaderSplitRight` | Reader/Note/Main Normal 和 Note Insert `<C-l>` | 朝指定方向切换窗格焦点 |
| `toggleReaderSplitHorizontal` | Reader Normal `<Space>-` | 切换水平分屏 |
| `toggleReaderSplitVertical` | Reader Normal <code>&lt;Space&gt;&#124;</code> | 切换垂直分屏 |
| `toggleReaderSidebarOutline` | **未绑定** | 明确切换 Reader Outline 侧栏；默认没有快捷键。 |
| `focusReaderOutline` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>ro` | 打开或聚焦 Outline；重复执行后仍停留在该面板。 |
| `toggleMarksExplorer` | **未绑定** | 明确切换 Bookmarks 视图；默认没有快捷键。 |
| `focusReaderMarks` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>rm` | 打开或聚焦 Bookmarks；重复执行后仍停留在该面板。 |
| `focusReaderAnnotations` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>ra` | 打开或聚焦 Annotations；重复执行后仍停留在该面板。 |
| `focusReaderThumbnails` | Reader Normal / Outline / Marks / Annotations / Thumbnails `<Space>rt` | 打开或聚焦 Thumbnails；重复执行后仍停留在该面板。 |
| `uiNext` | Reader Outline / Marks / Annotations / Thumbnails `j`；Picker Input `<C-j>`、`<C-n>`、`<Down>`；Picker List 再加 `j`；Plugins List `j`、`<Down>` | 仅在所列上下文中可配置的下一项操作。 |
| `uiPrevious` | Reader Outline / Marks / Annotations / Thumbnails `k`；Picker Input `<C-k>`、`<C-p>`、`<Up>`；Picker List 再加 `k`；Plugins List `k`、`<Up>` | 仅在所列上下文中可配置的上一项操作。 |
| `uiFirst` | Reader Marks `gg`；Plugins List `gg`、`<Home>` | 仅在所列上下文中可配置的首项操作。 |
| `uiLast` | Reader Marks `G`；Plugins List `G`、`<End>` | 仅在所列上下文中可配置的末项操作。 |
| `uiParent` | Reader Outline `h` | 在 `reader-outline` 中移到父级。 |
| `uiChild` | Reader Outline `l` | 在 `reader-outline` 中移到子级。 |
| `uiConfirm` | Reader Marks `<Enter>`；Picker Input/List `<Enter>`、`<S-Enter>`；Reader Outline **未绑定** | 在受支持的本地上下文中确认；Outline 没有默认绑定，因为 Enter/Return 由宿主处理。 |
| `uiCancel` | Reader Outline/Marks/Annotations/Thumbnails `<Esc>`；Picker Input/List `<Esc>`；Plugins List `<Esc>`、`q` | 在这些本地上下文中取消或返回；`plugins-input` 不支持此操作。 |
| `uiDelete` | Reader Marks `d` | 在 `reader-marks` 中删除选中的书签。 |
| `uiClear` | Reader Marks `x` | 在 `reader-marks` 中清除书签。 |
| `uiSearch` | Picker List `/`；Plugins List `/` | 从结果列表上下文聚焦查询/筛选框。 |
| `uiFocusList` | Plugins Input `<Esc>` | 从筛选框返回结果列表；这是 `plugins-input` 唯一的 `ActionId`。 |
| `uiPreviewDown` | Picker Input/List `<C-d>` | 向下滚动选择器预览。 |
| `uiPreviewUp` | Picker Input/List `<C-u>` | 向上滚动选择器预览。 |
| `uiNextPane` | **未绑定** | 在 `picker-input` 中受支持；默认没有快捷键。 |
| `uiPreviousPane` | **未绑定** | 在 `picker-input` 中受支持；默认没有快捷键。 |
| `uiPageDown` | Plugins List `<C-d>` | 在 Plugin Manager 结果中向下翻页。 |
| `uiPageUp` | Plugins List `<C-u>` | 在 Plugin Manager 结果中向上翻页。 |
| `pluginsRefresh` | Plugins List `r` | 刷新 Plugin Manager 状态。 |
| `pluginsEnable` | Plugins List `e` | Zotero AddonManager 允许时启用扩展。 |
| `pluginsDisable` | Plugins List `d` | Zotero AddonManager 允许时停用扩展。 |
| `pluginsPreferences` | Plugins List `p` | 打开扩展已注册的设置。 |
| `pluginsHomepage` | Plugins List `o` | 打开扩展主页。 |
| `pluginsReadme` | Plugins List `R` | 打开映射到的 GitHub README。 |
| `pluginsGitLog` | Plugins List `L` | 打开映射到的 GitHub 提交历史。 |
| `noteMoveLeft` | Note Normal `h` | Note 光标移动 |
| `noteMoveDown` | Note Normal `j` | Note 光标移动 |
| `noteMoveUp` | Note Normal `k` | Note 光标移动 |
| `noteMoveRight` | Note Normal `l` | Note 光标移动 |
| `noteMoveWordForward` | Note Normal `w` | Note 光标移动 |
| `noteMoveWordBackward` | Note Normal `b` | Note 光标移动 |
| `noteMoveLineStart` | Note Normal `0` | Note 光标移动 |
| `noteMoveLineEnd` | Note Normal `$` | Note 光标移动 |
| `noteMoveDocumentStart` | Note Normal `gg` | Note 光标移动 |
| `noteMoveDocumentEnd` | Note Normal `G` | Note 光标移动 |
| `noteDeleteChar` | Note Normal `x` | 编辑 Note |
| `noteAppendAfter` | Note Normal `a` | 在光标后进入 Insert |
| `noteAppendLineEnd` | Note Normal `A` | 在行尾进入 Insert |
| `noteInsertLineStart` | Note Normal `I` | 在行首进入 Insert |
| `noteOpenLineBelow` | Note Normal `o` | 新建一行并进入 Insert |
| `noteOpenLineAbove` | Note Normal `O` | 新建一行并进入 Insert |
| `noteUndo` | Note Normal `u` | 撤销一项 Note 编辑更改 |
| `noteRedo` | Note Normal `<C-r>` | 重做一项 Note 编辑更改 |
| `notePutAfter` | Note Normal `p` | 将内部寄存器内容粘贴到光标后 |
| `notePutBefore` | Note Normal `P` | 将内部寄存器内容粘贴到光标前 |
| `noteDeleteLine` | Note Normal `dd` | 删除当前行 |
| `noteYankLine` | Note Normal `yy` | 复制当前行 |
| `noteDeleteLeft` | Note Normal `dh` | 按移动操作删除 |
| `noteDeleteDown` | Note Normal `dj` | 按移动操作删除 |
| `noteDeleteUp` | Note Normal `dk` | 按移动操作删除 |
| `noteDeleteRight` | Note Normal `dl` | 按移动操作删除 |
| `noteDeleteWordForward` | Note Normal `dw` | 按移动操作删除 |
| `noteDeleteWordBackward` | Note Normal `db` | 按移动操作删除 |
| `noteDeleteToLineStart` | Note Normal `d0` | 按移动操作删除 |
| `noteDeleteToLineEnd` | Note Normal `d$` | 按移动操作删除 |
| `noteDeleteInnerWord` | Note Normal `diw` | 删除内部词 |
| `noteYankLeft` | Note Normal `yh` | 按移动操作复制 |
| `noteYankDown` | Note Normal `yj` | 按移动操作复制 |
| `noteYankUp` | Note Normal `yk` | 按移动操作复制 |
| `noteYankRight` | Note Normal `yl` | 按移动操作复制 |
| `noteYankWordForward` | Note Normal `yw` | 按移动操作复制 |
| `noteYankWordBackward` | Note Normal `yb` | 按移动操作复制 |
| `noteYankToLineStart` | Note Normal `y0` | 按移动操作复制 |
| `noteYankToLineEnd` | Note Normal `y$` | 按移动操作复制 |
| `noteYankInnerWord` | Note Normal `yiw` | 复制内部词 |
| `noteChangeLeft` | Note Normal `ch` | 按移动操作替换并进入 Insert |
| `noteChangeDown` | Note Normal `cj` | 按移动操作替换并进入 Insert |
| `noteChangeUp` | Note Normal `ck` | 按移动操作替换并进入 Insert |
| `noteChangeRight` | Note Normal `cl` | 按移动操作替换并进入 Insert |
| `noteChangeWordForward` | Note Normal `cw` | 按移动操作替换并进入 Insert |
| `noteChangeWordBackward` | Note Normal `cb` | 按移动操作替换并进入 Insert |
| `noteChangeToLineStart` | Note Normal `c0` | 按移动操作替换并进入 Insert |
| `noteChangeToLineEnd` | Note Normal `c$` | 按移动操作替换并进入 Insert |
| `noteChangeInnerWord` | Note Normal `ciw` | 替换内部词并进入 Insert |

## 默认按键索引

用此表查找随 Neo 提供的 `BindingContext:sequence` 对应的 `ActionId`。已保存的自定义绑定可以替换默认绑定。

| 规范 `BindingContext:sequence` | ActionId |
| --- | --- |
| `reader-normal:j` | `scrollDown` |
| `reader-normal:k` | `scrollUp` |
| `reader-normal:H` | `previousTab` |
| `reader-normal:L` | `nextTab` |
| `reader-normal:zh` | `scrollLeft` |
| `reader-normal:zl` | `scrollRight` |
| `reader-normal:h` | `prevPage` |
| `reader-normal:l` | `nextPage` |
| `reader-normal:gg` | `firstPage` |
| `reader-normal:G` | `lastPage` |
| `reader-normal:<C-d>` | `halfPageDown` |
| `reader-normal:<C-u>` | `halfPageUp` |
| `reader-normal:<C-f>` | `fullPageDown` |
| `reader-normal:<C-b>` | `fullPageUp` |
| `reader-normal:+` | `zoomIn` |
| `reader-normal:-` | `zoomOut` |
| `reader-normal:zI` | `zoomIn` |
| `reader-normal:zO` | `zoomOut` |
| `reader-normal:=` | `zoomReset` |
| `reader-normal:z0` | `zoomReset` |
| `reader-normal:<C-o>` | `navigateBack` |
| `reader-normal:<C-i>` | `navigateForward` |
| `reader-normal:f` | `followLink` |
| `reader-normal:/` | `openSearch` |
| `reader-normal::` | `openCommandPalette` |
| `reader-normal:n` | `findNext` |
| `reader-normal:N` | `findPrevious` |
| `reader-normal:[s` | `prevHeading` |
| `reader-normal:]s` | `nextHeading` |
| `reader-normal:[f` | `prevFigure` |
| `reader-normal:]f` | `nextFigure` |
| `reader-normal:[t` | `prevTable` |
| `reader-normal:]t` | `nextTable` |
| `reader-normal:[a` | `prevAnnotation` |
| `reader-normal:]a` | `nextAnnotation` |
| `reader-normal:[m` | `prevBookmark` |
| `reader-normal:]m` | `nextBookmark` |
| `reader-normal:<Enter>` | `editAnnotation` |
| `reader-normal:<Return>` | `editAnnotation` |
| `reader-normal:dd` | `deleteAnnotation` |
| `reader-normal:y` | `copyTarget` |
| `reader-normal:Y` | `yankAnnotationComment` |
| `reader-normal:zy` | `recolorYellow` |
| `reader-normal:zr` | `recolorRed` |
| `reader-normal:zg` | `recolorGreen` |
| `reader-normal:zb` | `recolorBlue` |
| `reader-normal:zp` | `recolorPurple` |
| `reader-normal:zt` | `scrollTop` |
| `reader-normal:zz` | `scrollCenter` |
| `reader-normal:Zy` | `filterYellow` |
| `reader-normal:Zr` | `filterRed` |
| `reader-normal:Zg` | `filterGreen` |
| `reader-normal:Zb` | `filterBlue` |
| `reader-normal:Zp` | `filterPurple` |
| `reader-normal:Za` | `filterClear` |
| `reader-normal:v` | `enterVisual` |
| `reader-normal:i` | `enterInsert` |
| `reader-normal:<C-h>` | `focusReaderSplitLeft` |
| `reader-normal:<C-j>` | `focusReaderSplitDown` |
| `reader-normal:<C-k>` | `focusReaderSplitUp` |
| `reader-normal:<C-l>` | `focusReaderSplitRight` |
| `reader-normal:<Esc>` | `clearSearch` |
| `reader-normal:<Space>ro` | `focusReaderOutline` |
| `reader-normal:<Space>rm` | `focusReaderMarks` |
| `reader-normal:<Space>ra` | `focusReaderAnnotations` |
| `reader-normal:<Space>rt` | `focusReaderThumbnails` |
| `reader-normal:<Space>-` | `toggleReaderSplitHorizontal` |
| `reader-normal:<Space>\|` | `toggleReaderSplitVertical` |
| `reader-normal:<Space>ff` | `findAllItems` |
| `reader-normal:<Space>fc` | `findCollectionItems` |
| `reader-normal:<Space>,` | `switchTab` |
| `reader-normal:<Space>q` | `closeCurrentTab` |
| `reader-normal:<Space>ta` | `addTag` |
| `reader-normal:<Space>tr` | `removeTag` |
| `reader-normal:<Space>ca` | `addToCollection` |
| `reader-normal:<Space>cr` | `removeFromCollection` |
| `reader-normal:<Space>fn` | `findNotes` |
| `reader-normal:<Space>pp` | `managePlugins` |
| `reader-normal:<Space>ps` | `openNeoSettings` |
| `reader-normal:<Space>yy` | `mainYankCitekey` |
| `reader-normal:<Space>ai` | `mainAddByIdentifier` |
| `reader-select:s` | `flashText` |
| `reader-select:a` | `openSelectionActions` |
| `reader-select:<Enter>` | `openSelectionActions` |
| `reader-select:<Return>` | `openSelectionActions` |
| `reader-select:j` | `extendTokenDown` |
| `reader-select:k` | `extendTokenUp` |
| `reader-select:h` | `extendTokenBackward` |
| `reader-select:l` | `extendTokenForward` |
| `reader-select:H` | `extendLeft` |
| `reader-select:L` | `extendRight` |
| `reader-select:)` | `extendSentenceForward` |
| `reader-select:(` | `extendSentenceBackward` |
| `reader-select:}` | `extendParagraphForward` |
| `reader-select:{` | `extendParagraphBackward` |
| `reader-select:w` | `extendWordForward` |
| `reader-select:b` | `extendWordBackward` |
| `reader-select:0` | `extendLineStart` |
| `reader-select:$` | `extendLineEnd` |
| `reader-select:zy` | `highlightYellow` |
| `reader-select:zr` | `highlightRed` |
| `reader-select:zg` | `highlightGreen` |
| `reader-select:zb` | `highlightBlue` |
| `reader-select:zp` | `highlightPurple` |
| `reader-select:za` | `addNote` |
| `reader-select:i` | `addNote` |
| `reader-select:y` | `copySelection` |
| `reader-select:#` | `searchSelection` |
| `reader-select:o` | `swapVisualEnds` |
| `reader-select:v` | `exitMode` |
| `reader-select:<Esc>` | `exitMode` |
| `main-normal:<C-o>` | `navigateBack` |
| `main-normal:<C-i>` | `navigateForward` |
| `main-normal:<Space>ff` | `findAllItems` |
| `main-normal:<Space>fq` | `mainQuickSearch` |
| `main-normal:<Space>fa` | `mainAdvancedSearch` |
| `main-normal:/` | `openSearch` |
| `main-normal:n` | `findNext` |
| `main-normal:N` | `findPrevious` |
| `main-normal::` | `openCommandPalette` |
| `main-normal:<Space>fc` | `findCollectionItems` |
| `main-normal:<Space>,` | `switchTab` |
| `main-normal:<Space>ta` | `addTag` |
| `main-normal:<Space>tr` | `removeTag` |
| `main-normal:<Space>ca` | `addToCollection` |
| `main-normal:<Space>cr` | `removeFromCollection` |
| `main-normal:<Space>tf` | `toggleTagFilter` |
| `main-normal:<Space>tc` | `clearTagFilters` |
| `main-normal:<Space>q` | `closeCurrentTab` |
| `main-normal:<Space>fn` | `findNotes` |
| `main-normal:<Space>pp` | `managePlugins` |
| `main-normal:<Space>ps` | `openNeoSettings` |
| `main-normal:<Space>ss` | `manageSelection` |
| `main-normal:<Space>sc` | `mainClearSelection` |
| `main-normal:e` | `mainFocusTree` |
| `main-normal:<Space>yy` | `mainYankCitekey` |
| `main-normal:<Space>ai` | `mainAddByIdentifier` |
| `main-normal:o` | `mainOpenPDF` |
| `main-normal:wh` | `mainFocusLeft` |
| `main-normal:wl` | `mainFocusRight` |
| `main-normal:ww` | `mainFocusItems` |
| `main-normal:<C-h>` | `focusReaderSplitLeft` |
| `main-normal:<C-j>` | `focusReaderSplitDown` |
| `main-normal:<C-k>` | `focusReaderSplitUp` |
| `main-normal:<C-l>` | `focusReaderSplitRight` |
| `main-normal:dd` | `mainTrashItems` |
| `main-normal:x` | `mainTrashItems` |
| `main-normal:u` | `mainRestoreTrashedItems` |
| `main-normal:h` | `mainTreeCollapse` |
| `main-normal:l` | `mainTreeExpand` |
| `main-normal:j` | `mainNavDown` |
| `main-normal:k` | `mainNavUp` |
| `main-normal:za` | `mainTreeToggle` |
| `main-normal:zo` | `mainTreeOpenOnly` |
| `main-normal:zc` | `mainTreeCloseOnly` |
| `main-normal:R` | `mainTreeExpandAll` |
| `main-normal:M` | `mainTreeCollapseAll` |
| `main-normal:<BS>` | `mainTreeParent` |
| `main-normal:gg` | `mainNavFirst` |
| `main-normal:G` | `mainNavLast` |
| `main-normal:H` | `previousTab` |
| `main-normal:L` | `nextTab` |
| `main-normal:<Enter>` | `mainActivate` |
| `main-normal:<Return>` | `mainActivate` |
| `main-normal:s` | `mainToggleSelection` |
| `main-normal:<Esc>` | `mainCancelTarget` |
| `main-normal:v` | `mainEnterSelect` |
| `main-select:s` | `mainSelectFinish` |
| `main-select:j` | `mainSelectDown` |
| `main-select:k` | `mainSelectUp` |
| `main-select:gg` | `mainSelectFirst` |
| `main-select:G` | `mainSelectLast` |
| `main-select:o` | `mainSelectSwapEnds` |
| `main-select:v` | `mainSelectCancel` |
| `main-select:<Esc>` | `mainSelectCancel` |
| `note-normal:h` | `noteMoveLeft` |
| `note-normal:j` | `noteMoveDown` |
| `note-normal:k` | `noteMoveUp` |
| `note-normal:l` | `noteMoveRight` |
| `note-normal:w` | `noteMoveWordForward` |
| `note-normal:b` | `noteMoveWordBackward` |
| `note-normal:0` | `noteMoveLineStart` |
| `note-normal:$` | `noteMoveLineEnd` |
| `note-normal:gg` | `noteMoveDocumentStart` |
| `note-normal:G` | `noteMoveDocumentEnd` |
| `note-normal:x` | `noteDeleteChar` |
| `note-normal:a` | `noteAppendAfter` |
| `note-normal:A` | `noteAppendLineEnd` |
| `note-normal:I` | `noteInsertLineStart` |
| `note-normal:o` | `noteOpenLineBelow` |
| `note-normal:O` | `noteOpenLineAbove` |
| `note-normal:u` | `noteUndo` |
| `note-normal:<C-r>` | `noteRedo` |
| `note-normal:p` | `notePutAfter` |
| `note-normal:P` | `notePutBefore` |
| `note-normal:dd` | `noteDeleteLine` |
| `note-normal:yy` | `noteYankLine` |
| `note-normal:dh` | `noteDeleteLeft` |
| `note-normal:dj` | `noteDeleteDown` |
| `note-normal:dk` | `noteDeleteUp` |
| `note-normal:dl` | `noteDeleteRight` |
| `note-normal:dw` | `noteDeleteWordForward` |
| `note-normal:db` | `noteDeleteWordBackward` |
| `note-normal:d0` | `noteDeleteToLineStart` |
| `note-normal:d$` | `noteDeleteToLineEnd` |
| `note-normal:diw` | `noteDeleteInnerWord` |
| `note-normal:yh` | `noteYankLeft` |
| `note-normal:yj` | `noteYankDown` |
| `note-normal:yk` | `noteYankUp` |
| `note-normal:yl` | `noteYankRight` |
| `note-normal:yw` | `noteYankWordForward` |
| `note-normal:yb` | `noteYankWordBackward` |
| `note-normal:y0` | `noteYankToLineStart` |
| `note-normal:y$` | `noteYankToLineEnd` |
| `note-normal:yiw` | `noteYankInnerWord` |
| `note-normal:ch` | `noteChangeLeft` |
| `note-normal:cj` | `noteChangeDown` |
| `note-normal:ck` | `noteChangeUp` |
| `note-normal:cl` | `noteChangeRight` |
| `note-normal:cw` | `noteChangeWordForward` |
| `note-normal:cb` | `noteChangeWordBackward` |
| `note-normal:c0` | `noteChangeToLineStart` |
| `note-normal:c$` | `noteChangeToLineEnd` |
| `note-normal:ciw` | `noteChangeInnerWord` |
| `note-normal:<C-o>` | `navigateBack` |
| `note-normal:<C-i>` | `navigateForward` |
| `note-normal:i` | `enterInsert` |
| `note-normal:<Esc>` | `exitMode` |
| `note-normal::` | `openCommandPalette` |
| `note-normal:<Space>ff` | `findAllItems` |
| `note-normal:<Space>fc` | `findCollectionItems` |
| `note-normal:<Space>,` | `switchTab` |
| `note-normal:<Space>ta` | `addTag` |
| `note-normal:<Space>tr` | `removeTag` |
| `note-normal:<Space>q` | `closeCurrentTab` |
| `note-normal:<Space>fn` | `findNotes` |
| `note-normal:<Space>pp` | `managePlugins` |
| `note-normal:<Space>ps` | `openNeoSettings` |
| `note-normal:<Space>e` | `mainFocusTree` |
| `note-normal:<Space>yy` | `mainYankCitekey` |
| `note-normal:<Space>o` | `mainOpenPDF` |
| `note-normal:H` | `previousTab` |
| `note-normal:L` | `nextTab` |
| `note-normal:<C-h>` | `focusReaderSplitLeft` |
| `note-normal:<C-j>` | `focusReaderSplitDown` |
| `note-normal:<C-k>` | `focusReaderSplitUp` |
| `note-normal:<C-l>` | `focusReaderSplitRight` |
| `note-insert:<Esc>` | `exitMode` |
| `note-insert:<C-h>` | `focusReaderSplitLeft` |
| `note-insert:<C-j>` | `focusReaderSplitDown` |
| `note-insert:<C-k>` | `focusReaderSplitUp` |
| `note-insert:<C-l>` | `focusReaderSplitRight` |
| `reader-outline:[s` | `prevHeading` |
| `reader-outline:]s` | `nextHeading` |
| `reader-outline:<Space>ro` | `focusReaderOutline` |
| `reader-outline:<Space>rm` | `focusReaderMarks` |
| `reader-outline:<Space>ra` | `focusReaderAnnotations` |
| `reader-outline:<Space>rt` | `focusReaderThumbnails` |
| `reader-outline:j` | `uiNext` |
| `reader-outline:k` | `uiPrevious` |
| `reader-outline:h` | `uiParent` |
| `reader-outline:l` | `uiChild` |
| `reader-outline:<Esc>` | `uiCancel` |
| `reader-marks:[s` | `prevHeading` |
| `reader-marks:]s` | `nextHeading` |
| `reader-marks:<Space>ro` | `focusReaderOutline` |
| `reader-marks:<Space>rm` | `focusReaderMarks` |
| `reader-marks:<Space>ra` | `focusReaderAnnotations` |
| `reader-marks:<Space>rt` | `focusReaderThumbnails` |
| `reader-marks:j` | `uiNext` |
| `reader-marks:k` | `uiPrevious` |
| `reader-marks:gg` | `uiFirst` |
| `reader-marks:G` | `uiLast` |
| `reader-marks:<Enter>` | `uiConfirm` |
| `reader-marks:<Esc>` | `uiCancel` |
| `reader-marks:d` | `uiDelete` |
| `reader-marks:x` | `uiClear` |
| `reader-annotations:[s` | `prevHeading` |
| `reader-annotations:]s` | `nextHeading` |
| `reader-annotations:<Space>ro` | `focusReaderOutline` |
| `reader-annotations:<Space>rm` | `focusReaderMarks` |
| `reader-annotations:<Space>ra` | `focusReaderAnnotations` |
| `reader-annotations:<Space>rt` | `focusReaderThumbnails` |
| `reader-annotations:j` | `uiNext` |
| `reader-annotations:k` | `uiPrevious` |
| `reader-annotations:<Esc>` | `uiCancel` |
| `reader-thumbnails:[s` | `prevHeading` |
| `reader-thumbnails:]s` | `nextHeading` |
| `reader-thumbnails:<Space>ro` | `focusReaderOutline` |
| `reader-thumbnails:<Space>rm` | `focusReaderMarks` |
| `reader-thumbnails:<Space>ra` | `focusReaderAnnotations` |
| `reader-thumbnails:<Space>rt` | `focusReaderThumbnails` |
| `reader-thumbnails:j` | `uiNext` |
| `reader-thumbnails:k` | `uiPrevious` |
| `reader-thumbnails:<Esc>` | `uiCancel` |
| `picker-input:<C-j>` | `uiNext` |
| `picker-input:<C-n>` | `uiNext` |
| `picker-input:<Down>` | `uiNext` |
| `picker-input:<C-k>` | `uiPrevious` |
| `picker-input:<C-p>` | `uiPrevious` |
| `picker-input:<Up>` | `uiPrevious` |
| `picker-input:<C-d>` | `uiPreviewDown` |
| `picker-input:<C-u>` | `uiPreviewUp` |
| `picker-input:<Enter>` | `uiConfirm` |
| `picker-input:<S-Enter>` | `uiConfirm` |
| `picker-input:<Esc>` | `uiCancel` |
| `picker-list:<C-j>` | `uiNext` |
| `picker-list:<C-n>` | `uiNext` |
| `picker-list:<Down>` | `uiNext` |
| `picker-list:<C-k>` | `uiPrevious` |
| `picker-list:<C-p>` | `uiPrevious` |
| `picker-list:<Up>` | `uiPrevious` |
| `picker-list:<C-d>` | `uiPreviewDown` |
| `picker-list:<C-u>` | `uiPreviewUp` |
| `picker-list:<Enter>` | `uiConfirm` |
| `picker-list:<S-Enter>` | `uiConfirm` |
| `picker-list:<Esc>` | `uiCancel` |
| `picker-list:j` | `uiNext` |
| `picker-list:k` | `uiPrevious` |
| `picker-list:/` | `uiSearch` |
| `plugins-input:<Esc>` | `uiFocusList` |
| `plugins-list:<Esc>` | `uiCancel` |
| `plugins-list:q` | `uiCancel` |
| `plugins-list:/` | `uiSearch` |
| `plugins-list:j` | `uiNext` |
| `plugins-list:<Down>` | `uiNext` |
| `plugins-list:k` | `uiPrevious` |
| `plugins-list:<Up>` | `uiPrevious` |
| `plugins-list:gg` | `uiFirst` |
| `plugins-list:<Home>` | `uiFirst` |
| `plugins-list:G` | `uiLast` |
| `plugins-list:<End>` | `uiLast` |
| `plugins-list:<C-d>` | `uiPageDown` |
| `plugins-list:<C-u>` | `uiPageUp` |
| `plugins-list:r` | `pluginsRefresh` |
| `plugins-list:e` | `pluginsEnable` |
| `plugins-list:d` | `pluginsDisable` |
| `plugins-list:p` | `pluginsPreferences` |
| `plugins-list:o` | `pluginsHomepage` |
| `plugins-list:R` | `pluginsReadme` |
| `plugins-list:L` | `pluginsGitLog` |

## 计数示例

- Reader `3j` 按设置的滚动步长移动三次；`3l` 请求连续向后翻三页。
- Zotero 支持数字页码导航时，Reader `3gg` / `3G` 转到第 3 页。单独按 `gg` / `G` 会分别转到第一页起点/文档末尾；不支持页码导航时，两者改为滚动到文档边界。
- Main `3j` 将条目游标向下移动三行。`gg` / `G` 移到首行/末行；`G` 前的正数计数会选择从 1 开始计数的对应行。
- Note `3j` 向下移动三行，`3x` 删除三个字符。`3dw` 这样的操作符命令只执行一次；计数不会重复 Note 操作符。
- Reader `2<C-o>` 遍历两处历史位置。`2:` 打开命令面板；选中的操作只执行一次。
- Reader 中按 `L` 切换标签页，再跳到一个标记，随后按 `<C-o>`，会先后退到标记跳转前的位置，再回到此前的标签页切换。

如果按键没有执行命令，请检查焦点所在的上下文和模式、相关功能设置及设置中保存的绑定。操作还需要有效目标，例如选中的批注或当前条目。
