# 录屏与键盘操作拍摄指南

> 本指南按 S0–S6 说明如何准备并拍摄完整工作流。候选包身份见 [#142 发布跟踪](https://github.com/zhongyangchuwu/Zotero-Neo/issues/142)，实际验收结果记在 [#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137) 与 [#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98)；录屏只支持其实际显示的操作与结果，不替代验收记录。按[候选验收协议](V0_2_ACCEPTANCE.md)准备安装与输入条件；产品工作流见[用户指南](USER_GUIDE.md)和[命令参考](COMMAND_REFERENCE.md)。

## 共同拍摄规则

### 数据、版本与隐私

- 每条素材均使用新建、未登录、未同步的 Zotero 用户配置文件和独立空数据目录；在 Settings → Advanced → Files and Folders 选择目录，再用 Show Data Directory 核实。若启动后显示真实资料库，立即关闭并重新隔离。只导入公有领域／获准 PDF 或自制测试文档，不录私人资料、个人路径、身份信息或私人剪贴板内容。
- 删除（包括永久删除）、批注、笔记、标签、集合和插件状态变更，只在一次性测试数据中操作。确认前核对目标、所属条目和数量；拍后销毁本轮配置文件或从干净副本重建，不依赖 Undo 保护数据。
- v0.2.0 场景使用 #142 记录的获准候选 XPI 并持久安装，按屏幕核实版本；不以 v0.1.0 或开发 RDP 加载替代候选行为。安装／升级镜头分别按 S0 和验收 U1/U2 准备。

### 实际输入、清晰画面与无障碍

- 从明确的界面、模式、功能输入处理方和焦点开始，连续记录完整任务直至出现可见结果。区分修饰键组合与按键序列：`<C-o>` 是 Ctrl+o，`<Space>ro` 是 Space、r、o 依次按，`gg` 是两次 g，`5gg` 是 5、g、g。字幕、屏幕提示或章节只标示实录动作和实测时间，不重构按键、候选项或结果。
- 每次焦点切换时说明当前由谁接收输入。阅读器只有 Normal、Select 两种界面模式；`COMMENT`、`NATIVE` 表示功能输入处理方，`Insert` 属于笔记编辑器。原生 Outline 的 Enter、系统输入法和原生文本输入均按实际输入处理方描述。
- 画面、旁白、字幕、数据、界面选项、操作结果和插件信息均以本次实拍为准；不拼造数据、候选项、回执、页面或功能，也不把第三方集成说成 Neo 内置功能。缺少真实材料、插件或功能时跳过相应镜头；失败操作不剪成成功。
- 画面保留判断任务所需的 PDF、焦点、候选窗、目标、确认数量和保存回执。字幕逐字对应真实旁白和按键；字号、对比度足够，状态不只用颜色区分。避免展示私人候选项或长时间输入内容。
- 使用现有获准的屏幕录制方式，不新增录制器或依赖。拍摄完成后，才按最终文件实测章节、海报帧和 VTT 时间码；有意义的语音需配字幕。

### 媒体命名

每条素材的文件名同时标明画面显示的版本和场景，例如 `zotero-neo-v<实际版本>-S1-main-library-triage`；主视频用 `.webm`，兼容副本可从同一录屏导出 `.mp4`，海报用 `.poster.webp`，简体中文字幕用 `.zh-Hans.vtt`。海报取自成片画面，VTT 时间码按最终成片测量。

## S0 — 安装与第一次交互

**单一任务：** 在隔离的用户配置文件中安装获准候选包，并从主窗口打开一份测试 PDF，确认阅读器接管后的界面。

- **拍前准备：** 在本次测试数据中准备一份公有领域／获准 PDF 及对应书目记录；使用 #142 所列候选 XPI，安装后按屏幕核实版本。
- **起始界面／模式／焦点：** Zotero 原生插件管理器的安装界面。通过 Tools → Plugins/Add-ons → gear → Install Plugin From File 选择该候选 XPI，并遵循现场重启提示。安装后回到主窗口 Normal 模式，焦点落在包含该测试条目的项目列表，条目游标对准该条目；等待 Neo 阅读器交互就绪后再继续。
- **操作：** 录下安装确认；返回主窗口后旁白说明 Normal 模式与项目列表焦点，按 `<Enter>` 打开条目游标当前条目。不要据此声称打开了 Neo 选择集中的多个条目。
- **可见结果：** Zotero 窗口中出现对应阅读器/PDF，显示软件版本与 PDF 内容；旁白指出阅读器 Normal 模式（其指示器可隐藏），等待阅读器交互就绪后再继续。字幕只写入屏幕显示的安装和版本状态。
- **持久变化／重置：** 安装仅发生在本次一次性用户配置文件中；关闭后用新配置文件重做。PDF 仅用本次测试数据，不打开个人资料库。
- **镜头／不录条件：** 保留安装界面、PDF 与版本；安装失败、版本不明、阅读器未就绪或目标无法解析时，修正条件后重拍。
- **依据：** [主窗口打开与条目游标目标](COMMAND_REFERENCE.md#main-window)、[阅读器加载就绪边界](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)、[v0.2.0 干净安装步骤](V0_2_ACCEPTANCE.md)。

## S1 — Main：Neo 选择集批处理与条目游标打开

**单一任务：** 清楚展示 Neo 选择集与条目游标是不同目标：主窗口的一般条目操作优先使用非空 Neo 选择集；`o` 仍只打开条目游标当前条目。

- **拍前准备：** 准备至少 3 个可见、可读的公有领域／授权条目；Neo 选择集为空，项目列表中没有隐藏成员。将条目排列为可区分的第 1、第 2、第 3 条。只在本次测试文库中拍摄废纸篓／恢复操作。
- **起始界面／模式／焦点：** 主窗口 Normal 模式，项目列表已聚焦，条目游标在第 1 条；旁白说明 Neo 选择集为空。
- **操作：** 依次按 `s`、`s`；`s` 将当前目标加入 Neo 选择集并前移条目游标，因此现在 Neo 选择集包含第 1、2 条，条目游标在第 3 条。拍清选择集数量和第 3 条游标。按 `o`，确认阅读器打开的是第 3 条；按 `<C-o>` 返回同一主窗口。回到项目列表按 `dd`；只有确认框明确显示 **Neo Selection** 和 2 个目标时，操作者才点击一次实际确认按钮。完成后按 `u` 恢复 Neo 最近一次废纸篓批次。
- **可见结果：** 阅读器首先打开条目游标所在的第 3 条，而不是前两条；确认框显示 **Neo Selection** 的 2 个目标；废纸篓只发生该批次对应的变化，按 `u` 后三条测试数据均可见。不要口述界面未显示的内部状态。
- **持久变化／重置：** `dd` 会更改 Zotero 废纸篓和 Neo 选择集状态；`u` 只恢复 Neo 最近一次废纸篓批次，不是私人数据保护机制。仅在本次一次性配置中执行，结束后销毁该配置。
- **镜头／不录条件：** 保持三条名称、画面中的 **Selection** 标记、条目游标行、打开后的阅读器标题和确认目标清晰可读。选择集数量不是 2、条目游标不在第 3 条、出现隐藏成员、确认目标不明或目标不符时，立即取消；不能按下确认后再用字幕解释目标正确。
- **依据：** [主窗口 Normal/Select 默认键位](COMMAND_REFERENCE.md#main-window)、[主窗口条目游标、Neo 选择集与 EffectiveSelection](INTERACTION_MODEL.md#effectiveselection)、[主窗口 Open 仅以条目游标为目标](INTERACTION_MODEL.md#action-target-contracts)、[废纸篓确认与目标可见性](INTERACTION_MODEL.md#hidden-selection-safety)。`s` 前移条目游标、`dd` 确认、`u` 恢复及 `o` 不批量打开，均按这些当前契约拍摄。

## S2 — Reader：原生面板、类别导航与历史

**单一任务：** 在包含原生 Outline、缩略图和批注的 PDF 中浏览侧栏及类别导航，再通过真实书签跳转验证后退／前进。

- **拍前准备：** 准备一份含可用原生 Outline、多页缩略图和至少一条批注的公有领域／授权 PDF；批注可在本次测试数据中预先创建。确认文档至少有两个可导航的原生标题。关闭阅读器标记持久化，避免写入 Zotero 条目的 Extra。
- **起始界面／模式／焦点：** 该 PDF 处于阅读器 Normal 模式，PDF 面板聚焦在可重复的起始位置；预演所需的行和目标均存在。
- **操作：** 在起始位置依次按 `m`、`a` 设置一个标记，再按 `l` 到另一页。按 `<Space>ro` 聚焦 Outline，使用 Outline 的 `j`／`k` 移动；按物理原生 `Enter` 让 Zotero 执行当前 Outline 行的导航。用鼠标点击 PDF 面板转移焦点，再依次按 `[s`、`]s` 展示上一／下一原生标题。然后按 `<Space>ra`、`<Space>rt`、`<Space>rm`，分别聚焦 Annotations、Thumbnails、Bookmarks；画面保留原生侧栏、缩略图和批注内容。在 Bookmarks 中用 `j`／`k` 移动并按 `Enter` 跳到刚才设置的标记。点击 PDF 面板，将焦点交回阅读器 Normal 模式；按 `<C-o>` 回到标记跳转前的位置，再按 `<C-i>` 返回标记。
- **历史闭环：** 按 `<C-o>`／`<C-i>` 时都须看到页面或视图位置实际变化；不要把普通 `j`／`k` 或滚动说成历史记录。
- **可见结果：** 画面显示四种阅读器原生面板及其内容、类别命令实际到达的 PDF 位置，以及标记跳转前后的两个位置。Neo 阅读器标记与 PDF 批注应明确区分。
- **持久变化／重置：** 标记保存在阅读器会话内；面板与页面状态由 Zotero 管理。预置批注及文档均属于一次性测试数据，拍后重建；不写入用户条目的 Extra。
- **镜头／不录条件：** 画面同时包含 PDF、当前焦点面板和侧栏；若 Outline、批注、书签或历史目标缺失，改用具备这些原生内容的授权测试文档。
- **依据：** [阅读器 Normal 模式、类别、页导航与面板快捷键](COMMAND_REFERENCE.md#reader-normal)、[阅读器标记与侧栏局部控制](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)、[历史记录边界与恢复限制](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)、[原生 Outline、Bookmarks 与批注面板](READER_GUIDE.md#find-a-passage-and-inspect-document-structure)。

## S3 — Reader：Flash、范围修整与批注评论

**单一任务：** 使用 Flash 建立文本选区并修整范围，为该范围创建批注，再通过批注评论输入框保存批注评论。

- **拍前准备：** PDF 有可选文本且起始时没有批注；启用阅读器 Select 模式与 **Annotation comment editing**（中文界面：**批注评论编辑**）。分屏用例准备两个可区分的 PDF 视图；使用系统输入法的用例在装有该输入法的设备上拍摄。
- **起始界面／模式／焦点：** 阅读器 Normal 模式，目标 PDF 面板已聚焦；画面中有一段可查找且不含私人内容的文本。
- **操作：** 按 `v` 开始 Flash；在输入框中输入画面上实际出现的查询，并选择屏幕显示的字母提示。确认进入阅读器 Select 模式后按 `s` 设置 Flash 的另一端，输入查询并选择屏幕显示的提示。用 `l` 或其他适当的 Select 运动键修整范围；通过 `SELECT` 状态和选中文字确认目标。按 `za` 创建批注并打开批注评论输入框。
- **评论／原生输入：** 打开 `COMMENT` 后，用原生文本输入写入两行，并按 `Enter` 换行。使用系统输入法时，录下候选确认和文字提交；另发起一轮组合，按 `Escape` 取消预编辑；再发起新一轮组合，按 `Backspace` 删除预编辑字符。
- **保存与核对：** 非组合状态下按 `Escape` 保存并关闭；Neo 停用阅读器交互或交接输入时也保存最终草稿。视图或阅读器销毁不补存草稿，因此关闭前先按 `Escape`。保存并关闭后，回到阅读器 Normal 模式，按 `]a` 选中本场唯一批注，再按 `<Enter>` 重开核对批注评论并按 `Escape` 关闭。
- **自动保存：** 最后一次输入后约两秒保存，编辑器保持打开。拍摄时不按 `Escape`、不发生输入交接；从 Zotero 原生批注侧栏或卡片读回已保存内容。只等待两秒、只看文本框草稿或关闭后重开，均不能单独证明自动保存。
- **每个活动视图的输入归属（仅在实际分屏上录）：** 左侧 PDF 视图打开批注评论后，用鼠标将焦点移到右侧 PDF 视图，按 `j`。预期只有右侧 PDF 位置移动，左侧批注评论草稿／编辑器仍属于原 PDF 视图；回到左侧批注评论输入框，再按 `Escape` 保存并关闭。两侧视图、焦点交接和各自结果须同框可见。
- **可见结果／持久变化：** Flash 文本范围与端点可见，`za` 创建真实批注；`COMMENT` 显示换行内容，按 `Escape` 后重开可见已保存批注评论。只修改本次测试 PDF。
- **重置／不录条件：** 丢弃本次一次性配置。若 Select／`COMMENT` 指示、提示、目标或批注缺失，或批注评论重开后的内容不一致，不录成成功。翻译或 OCR 内容不属于本场操作结果。
- **依据：** [阅读器 Select/Flash、范围操作与添加批注评论](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)、[评论输入的 Enter/Escape/两秒自动保存](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)、[原生输入法所有权](INPUT_METHODS.md#text-entry-controls)、[批注评论输入与视图范围](SELECTION_GUIDE.md#edit-an-annotation-comment)。


## S4 — Settings：暂存快捷键修改与原生输入

**单一任务：** 录制一次主窗口快捷键重映射从暂存到 Apply 的完整流程，并展示 Neo 在真实选择器和 Outline 中不接管原生文本输入、系统输入法、剪贴板和 Outline Enter。

- **拍前准备：** 准备至少 3 条可见的一次性测试条目，其中一条有可由当前系统输入法查询的非敏感中文标题。准备装有实际使用的系统输入法的设备。主窗口项目列表可操作，条目游标在第 1 条。确认 `]j` 在当前 `main-normal` 上可录制且不与实际保留键冲突；若 Settings 拒绝该序列，停止并选用界面接受的序列，不把失败试验录成成功。
- **起始界面／模式／焦点：** 主窗口 Normal 模式，项目列表已聚焦。先按 `j` 观察条目游标移到第 2 条，再按 `gg` 回到第 1 条，确认当前默认绑定；旁白说明当前接收输入的对象。
- **设置搜索与系统输入法：** 按 `<Space>ps`，选择 **Keybindings**。设置搜索框获得焦点后，使用本机系统输入法输入测试条目上可见的中文标题片段。保留实际候选项和组合输入；在两轮组合输入中分别按系统输入法的 `Escape`、`Backspace`，让画面显示该输入法对候选项／组合文本的实际响应，同时确认 Settings 未误关闭或误执行命令。按本机输入法实际的候选确认键提交文字，并确认查询框显示已提交内容。按键录制器不是中文编辑器，无需在其中输入汉字。
- **剪贴板来源：** 在同一 Settings 搜索框中选中刚提交的测试条目标题，按 `<C-Insert>` 复制；随后用原生文本编辑清空查询，再搜索规范 `ActionId` `mainNavDown`，选择 `main-normal` 对应动作。复制来源须为本场测试数据中的公开内容，不展示读取剪贴板的工具。
- **录制与暂存：** 点击实际 **Add/Record** 后，让同一系统输入法在录制期间出现一次真实组合输入和候选项；提交候选后，确认录制仍在进行，且没有错误按键标记或提前出现 **Done**／**Apply**。然后依次物理按下 `]`、`j`，预览应为 `]j`。按可见 **Done** 保留该序列；不要把 `Enter`／`Escape` 当作录制完成或取消。确认变更仍处于暂存状态，尚未执行 **Apply**。
- **旧绑定与 Apply：** 用鼠标点击 Settings 上可见的 **Close**，不按 **Apply**；回到主窗口后按 `j` 确认默认移动仍有效，再按 `gg` 回到首行。重开 Settings 并检查当前草稿：若仍保留 `]j`，不要重复添加；若未保留，则重新录制同一序列并按 **Done**。确认 `]j` 已暂存后，明确按 **Apply**。可拍 **All groups** 中与上下文对应的只读原生快捷键区域。再点 **Close** 返回原项目列表焦点，依次按 `]`、`j` 验证自定义 `mainNavDown`，按 `gg` 回首行，再按 `j` 验证默认键仍有效。
- **剪贴板接收与原生 Outline Enter：** 按 `<Space>ff` 打开选择器；查询框获得焦点后按 `<S-Insert>`，确认此前从 Settings 字段复制的同一公开标题通过原生粘贴进入查询框并显示匹配行。按 `Enter` 打开对应 PDF。阅读器 Normal 模式下按 `<Space>ro` 聚焦 Outline，在一条真实行上物理按 `Enter`，观察 Zotero 原生 Outline 跳到目标；不要把此 `Enter` 标成 Neo `uiConfirm`。
- **可见结果／持久变化：** 同一设备拍到 Settings 搜索中的输入法组合与提交、录制器不误收组合／候选按键、显式 **Done**、未按 **Apply** 前旧 `j` 有效、应用后 `]j` 与 `j` 都有效；`<C-Insert>` 复制的标题通过 `<S-Insert>` 原生粘贴到选择器，Outline Enter 仍由 Zotero 处理。重映射只保存在本次配置文件中。
- **重置／不录条件：** 拍后销毁本次配置文件。若输入法组合／提交、录制器按键标记、Done、Apply 前后绑定、原生剪贴板往返或 Outline 结果不符，先修正条件再重拍。
- **依据：** [Settings 键位录制、Done/Cancel/Apply](SETTINGS_GUIDE.md#try-it)、[选择器与输入法／原生剪贴板所有权](INPUT_METHODS.md#native-and-local-shortcut-ownership)、[Outline Enter 原生所有权](INPUT_METHODS.md#native-and-local-shortcut-ownership)、[U6/U7 验收步骤](V0_2_ACCEPTANCE.md)。

## S5 — Note：Vim 开关与 Normal/Insert（两条独立短片）

**单一任务：** 展示同一笔记身份的基础编辑，并比较 **Vim-style note editing** 开启与关闭时的行为；两种状态分开拍。

### S5-on — Vim 风格笔记编辑开启

- **拍前准备：** 在 Neo Settings 中启用 **Vim-style note editing**（中文界面：**Vim 风格笔记编辑**）。主窗口当前条目有一条现存的一次性测试笔记，并能辨认其标题和所属条目。
- **起始界面／模式／焦点：** 主窗口 Normal 模式，项目列表焦点在包含该笔记的测试条目上。
- **操作：** 按 `<Space>fn`，在笔记选择器中选该笔记；根据结果行标题确认目标，Preview 核对所属条目和正文，再按 `Enter` 打开。焦点转到笔记编辑器，旁白说明 `note-normal`。按 `gg` 到文首，按 `w` 执行一次笔记 Normal 移动，按 `i` 进入笔记 Insert 模式，输入一小段无敏感内容，再按 `<Esc>` 返回笔记 Normal 模式。
- **可见结果／持久变化：** 笔记正文显示新文字；当前笔记标签页／编辑器显示的标题和所属条目始终对应。Insert 中的文字由原生编辑器接收，不作为 Neo 命令；修改只写入一次性测试笔记。
- **重置／不录条件：** 销毁本次配置文件。若设置未启用、焦点或笔记身份不明，或 `i` 未进入笔记编辑器 Insert 模式，修正配置后重拍。
- **依据：** [笔记编辑器开启条件、Insert/Normal 与默认移动](COMMAND_REFERENCE.md#note-editor)、[Current Item 笔记选择器](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)、[设置页开关名称](SETTINGS_REFERENCE.md)。

### S5-off — Vim 风格笔记编辑关闭

- **拍前准备：** 本片使用与 S5-on 独立的配置文件和测试笔记；在 Neo Settings 中关闭 **Vim-style note editing**（中文界面：**Vim 风格笔记编辑**）。
- **起始界面／模式／焦点：** Zotero 中同类型的笔记编辑器获得原生编辑焦点；旁白明确说明“Vim 风格笔记编辑已关闭，原生编辑器接收键盘输入”，不称其为笔记 Insert 模式。
- **操作：** 在正文中物理输入一个包含字母 `i` 的测试短语，并如实保留按键和文字；不要先进入 Neo 模式，也不要在 `i` 后接指令序列，让这些字符写入笔记。
- **可见结果／持久变化：** 普通字符进入原生笔记正文，不执行 `noteInsert` 或其他 Neo Normal 操作；画面可辨认仍是同一笔记。文字只写入一次性测试笔记。
- **重置／不录条件：** 销毁本次配置文件。若设置未关闭、按 `i` 触发 Neo 命令／模式，或输入没有落到笔记正文，停止并修正拍摄配置，不用字幕代替。
- **依据：** [笔记编辑器开关](COMMAND_REFERENCE.md#note-editor)、[Vim-style note editing 设置](SETTINGS_REFERENCE.md)。开启和关闭是设置开关；本片不假定同一编辑器中的设置变更会即时生效。

## S6 — Plugin Manager：真实 AddonManager 状态与自我保护

**单一任务：** 从 Zotero AddonManager 的已安装列表检查插件信息和状态，核对 Neo 不能从自身的 Plugin Manager 禁用，然后安全退出。

- **拍前准备：** 确保当前安装的 Zotero Neo 出现在 Zotero AddonManager。不要为演示而切换不熟悉插件的启用／禁用状态。
- **起始界面／模式／焦点：** 主窗口 Normal 模式，项目列表焦点明确。
- **操作：** 按 `<Space>pp` 打开持久的 Plugin Manager 面板；拍清列表显示的名称、版本、ID、启用状态及各行实际允许的生命周期操作。按 `/` 聚焦筛选框，以原生文本输入 `Neo`；在结果中定位 Zotero Neo，按 `Escape` 回到结果列表。确认 Neo 行没有可用的面板内禁用操作；不要向它发送 `d`。按 `r` 从 Zotero AddonManager 重载当前状态，确认显示重读后的状态。若列表中有其他插件，只展示该行实际可用的 `e/d/p/o/R/L`，不打开外部链接或执行未获授权的生命周期操作。最后在结果列表中按 `Escape` 或 `q` 关闭面板。
- **可见结果：** Plugin Manager 保持面板形态而非选择器；重载后显示 AddonManager 状态。Neo 不能在自身面板内禁用，须通过 Zotero 原生 Plugins 界面管理。插件信息和可用操作与当前列表一致。
- **持久变化／重置：** 本流程只读取或重载状态，不切换其他插件；关闭后按共同规则处理本次配置文件。如另行获准演示 `e/d`，须使用专用的一次性配置文件，确认目标插件、依赖和预期恢复方法，并拍下操作前后的 AddonManager 状态；不得在本场混入未经授权的停用。
- **镜头／不录条件：** 若 Zotero Neo 不在当前列表、状态或版本无法读取、禁用操作仍可用，或无法判断焦点在筛选框还是结果列表，不录成“自我保护成功”。
- **依据：** [Plugin Manager 生命周期和自我保护](SETTINGS_GUIDE.md#manage-installed-plugins-and-integrations)、[plugins-list 与 plugins-input 的准确边界](COMMAND_REFERENCE.md#modes-focus-and-capabilities)、[管理器操作与安装能力边界](COMMAND_REFERENCE.md#selection-actions-plugin-manager-settings-and-selection-panel)。Zotero AddonManager 是生命周期状态权威；此面板不提供任意软件包安装、更新、卸载或远端插件发现。

## 可选第三方集成（与 S0–S6 核心片分开）

第三方集成只录独立的可选片，不并入核心 S0–S6；只有当前已安装、启用的集成在界面提供相应操作时才拍，条件不符便跳过。

- **Better BibTeX：** 仅当当前 Zotero 已安装并启用 Better BibTeX，且一次性测试条目确有 citekey（引文键）时，才单独拍主窗口 Normal 模式下按 `<Space>yy` 为有效目标复制 citekey。按目标名称确认目标是主窗口当前条目或 Neo 选择集；若目标没有可用 citekey，不录成成功。
- **Translate for Zotero：** 仅当已安装的 Translate 集成使 Selection Actions 中出现 **Translate** 时，才从阅读器 Select 模式的文本选区打开该项并录下实际翻译结果。字幕标明实际插件／集成名称。可用性的依据见 [Selection Actions 与可选 Translate](SELECTION_GUIDE.md#use-the-selected-text)。

## 参考边界

本指南仅链接拍摄所需的产品说明：[用户指南](USER_GUIDE.md)、[命令参考](COMMAND_REFERENCE.md)、[输入法](INPUT_METHODS.md)、[标签](TAGS.md)和[交互模型](INTERACTION_MODEL.md)。完整 `ActionId`、默认按键和上下文只在命令参考中维护；每条素材仍按验收协议记录实测结果。
