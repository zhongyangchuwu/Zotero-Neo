# 录屏与键盘操作拍摄指南

> **拍摄脚本，不是现成录屏证据。** 本文件不提供影片、海报／字幕或已部署的网站；包安装、升级及程序键路由的实际观察另在验收 Issue 记录，不代替真实硬件输入。当前公开版本仍为 v0.1.0。v0.2.0 候选属于 draft [PR #143](https://github.com/zhongyangchuwu/Zotero-Neo/pull/143)，不在本 main-derived 树中，也尚未发布。每条影片必须拍到当时实机使用的包、数据、输入和结果，不能把未执行场景写成已发布或人工已通过。
>
> 该候选包的原生持久安装、公开 v0.1.0 升级及受信任 Gecko per-view 路由观察已记入 [Issue #137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137)；物理 OS-IME 候选确认/组合态 Escape 与 Backspace、人工剪贴板及 Outline Enter/Return 仍 **NOT PERFORMED**。这些程序化和 native/UI 观察不是人体输入 PASS。网站首页见[首页](../index.md)，公开版安装/首次使用见[开始使用](GETTING_STARTED.md)；验收状态与未完成证据见 [V0_2_ACCEPTANCE.md](./V0_2_ACCEPTANCE.md)。录屏只有在实际展示对应验收场景、物理输入/原生交互及可见结果时，才可作为 issue #137 的支持材料；宣传式演示、设置草稿、模拟键位或剪辑拼接都不自动构成 PASS。

## 共同拍摄规则

### 数据、版本与安全

- 每个场景使用**本轮新建、未登录/未同步的 Zotero 一次性 profile**和独立的全新空数据目录；仅新建 profile 不能保证数据目录独立。按 [V0_2_ACCEPTANCE.md](./V0_2_ACCEPTANCE.md) 的隔离流程，用 Zotero Profile Manager 新建带本轮唯一后缀的 profile，在 Settings → Advanced → Files and Folders 选择新空目录，并用 Show Data Directory 核实。只导入有授权/公有领域的真实 PDF；不打开或展示用户私人资料库、同步数据、个人路径、身份信息或真实剪贴板内容。
- 不复用以前任务的临时 profile、旧临时根目录或开发 RDP 加载。复拍/重置时再新建一个唯一 profile 与数据目录，导入干净 fixture；仅通过配置文件管理器处理确认属于本轮拍摄的 profile，不触碰日常 profile 或其数据目录。
- 会写 Zotero 数据的操作（删除/移入废纸篓、注释、笔记、标签、集合、插件启停）只在专用一次性 fixture 中拍。需有产品本身要求的明确确认时，要把确认目标与数量拍清楚；目标、数量、所有者不符就取消，不录成成功。拍后销毁本次一次性 profile 或从已确认的干净副本重建，不靠“撤销”来保护原始数据。
- 核心产品场景 S0–S7 和可选集成只能使用发布负责人实际批准的 v0.2.0 候选 XPI、持久安装，并按屏幕记录包中实际版本；不要用 v0.1.0、开发热加载或过去包的演示冒充候选版行为。当前公开版本为 v0.1.0；最终 v0.2.0 尚未发布。无获批候选包时，本指南仍只是脚本，不能录成 v0.2.0 结果；官方 v0.1.0 → v0.2.0 的升级另按验收 U2 执行，尚未实际升级不得称为通过。
- S0 安装镜头只使用获批候选和 Zotero 原生插件管理器。安装来源、对话框、版本号不得用后期字卡代替。
- 正式发布/验收状态以 [V0_2_ACCEPTANCE.md](./V0_2_ACCEPTANCE.md) 为准。这里列的是未来拍摄步骤，不代表产品验收或任何 #137 的实体硬件/IME 场景已全部通过。

### 真实键位、画面与无障碍

- 一条视频只完成一个完整工作；从明确的起始焦点录到可见结果。不要用空状态假装失败、剪去目标选择/确认步骤、拼接另一轮的成功结果，或添加未在实机发生的鼠标、候选词、按键、状态、计时、安装版本、插件、内容与缩略图。
- 按键序列与同时按下的修饰键必须区分：`<C-o>` 表示按住 Ctrl 再按 o；`<Space>ro` 表示依次按 Space、r、o；`gg` 是两次独立的 g；`5gg` 是 5、g、g 依次输入，不是同时按。大写字母按实际物理组合输入。可在后期制作与真实事件逐帧/逐段校准的键位字幕、HUD 或章节，但只显示录像中实际发生的键和真实时间；不能添加脚本生成的假动作、假键、假候选或猜测时间码。IME 候选输入、原生文本编辑、鼠标焦点切换要如实保留，不能改写成 Neo 快捷键。
- 开场/旁白在每次焦点切换时说明当前 Surface、模式/功能输入拥有者和焦点，例如“Main Normal，项目列表拥有焦点”“Reader Select，PDF 视图拥有焦点”“COMMENT，原生注释文本框拥有输入”“Note Insert，原生笔记编辑器输入”。Reader 只有 Normal/Select 两种 Surface mode；COMMENT/NATIVE 是功能输入拥有者，不是 Reader Insert。不要把 Native Outline 的 Enter、IME 按键或笔记原生输入说成 Neo 命令。
- 保留读者看清的真实 PDF、焦点、模式/状态、目标与确认结果；不要裁掉候选窗、注释归属、确认数量或成功回执。字幕逐字转录真实旁白和键位，并写出序列/组合差异；不以颜色单独区分状态，保证文字对比度和可读字号。避免把长时间输入或私人候选内容放大展示。
- 一般使用现有、获准的屏幕录制能力即可；不安装新的按键记录器或为本指南新增录制工具/依赖。不预定视频时长、暂停秒数或时间码。需要章节、海报帧或字幕时间码时，先完成真实拍摄，再按最终文件实测标注；无真实同步事件/时间码时，使用不带时间断言的文字序列，而不是假装有同步时间线。

### 媒体命名

每条素材用同一真实版本与场景标识作为 basename，例如 `zotero-neo-v<屏幕实际显示的版本>-S1-main-library-triage`：主视频保存为 `.webm`；若网站交付需要兼容副本，可从同一真实录屏导出同 basename 的 `.mp4`。海报使用同 basename 加 `.poster.webp`，简体中文字幕使用同 basename 加 `.zh-Hans.vtt`。这些是**命名约定，不是已存在的录屏、海报或字幕**；poster 必须取自成片真实帧，VTT 时间码按最终成片实测。

## S0 — 安装与第一次交互

**单一任务：** 在隔离 profile 中安装真实获批包，并从 Main 打开一份真实 fixture PDF，看到 Reader 接管后的实际界面。

- **拍前准备：** 新建本轮专用的 profile 和全新数据目录；导入至少一份可读的公有领域/授权 PDF 及对应真实书目记录。确认手中安装包是发布负责人批准的 v0.2.0 候选 XPI，使用持久安装而非开发热加载；无获批包或无法核实实际包版本时，不录成候选安装。
- **起始 Surface / mode / focus：** Zotero 原生插件管理器的真实安装界面。通过 Tools → Plugins/Add-ons → gear → Install Plugin From File 选择该候选 XPI，并遵循现场重启提示。安装后回到 Main Normal，焦点落在包含该 fixture 的项目列表，Cursor 对准该条目；等待 Neo Reader 交互实际就绪，不把加载中的按键当成已处理。
- **操作：** 录下真实安装确认；返回 Main 后旁白说明 Main Normal 与项目列表焦点，按 `<Enter>` 打开 Cursor 项目。不得用多选/Selection 推导这是批量打开。
- **可见结果：** 实际 Zotero 窗口中出现对应 Reader/PDF，显示真实软件版本与 PDF 内容；旁白指出 Reader 的 Normal 模式（其指示器可隐藏），等待 Reader 交互已装载后再继续。只把屏幕显示的安装/版本状态写进字幕。
- **持久变化 / 重置：** 安装只发生在本次一次性 profile；关闭后用新 profile 重做。PDF 只用本次 fixture，不打开个人资料库。
- **镜头 / 不录条件：** 保留安装包实际界面与首个打开的真实 PDF，不要用虚构安装进度、下载完成提示或版本角标。如安装失败、版本不明、Reader 尚未就绪或目标无法解析，取消该 take；不能剪到另一 profile 的成功画面。
- **依据：** [Main Open 与 Cursor 目标](COMMAND_REFERENCE.md#main-window)、[Reader 加载就绪边界](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)、[v0.2.0 干净安装步骤](./V0_2_ACCEPTANCE.md)。不得把公开 v0.1.0 安装或临时开发加载当作 S0 候选安装。

## S1 — Main：Selection 批处理与 Cursor-only Open

**单一任务：** 真实展示 Selection 与 Cursor 是不同目标：普通 Main 项目操作优先使用非空 Selection；`o` 仍只打开 Cursor。

- **拍前准备：** 用新的一次性 profile 准备至少 3 个可见的真实公有领域/授权条目，Reader 可读；Selection 为空，项目列表中没有隐藏成员。把项目排列到可明确区分的第 1、第 2、第 3 条。只在这个 disposable library 中拍废纸篓/恢复操作。
- **起始 Surface / mode / focus：** Main Normal，项目列表已聚焦，Cursor 在第 1 条；旁白点明 Selection 为空。
- **操作：** `s`、`s` 依次按下；`s` 将当前目标加入 Selection 并前移 Cursor，因此现在 Selection 是第 1、2 条，Cursor 是第 3 条。拍清 Selection 总数和第 3 条 Cursor。按 `o`，确认 Reader 打开的确实是第 3 条；按 `<C-o>` 返回同一 Main window。回到项目列表按 `dd`；只在确认界面明确写出 Neo Selection 与 2 项时，由操作者点击实际确认按钮。完成后按 `u` 恢复 Neo 最近一次废纸篓批次。
+- **可见结果：** 第一次 Reader 打开的是 Cursor 第 3 条，而不是批量打开前两条；确认框显示 Neo Selection 的 2 项目标；废纸篓中仅该 Selection 批次变化，`u` 后三条 fixture 均可见。不得口述 UI 未显示的内部状态。
+- **持久变化 / 重置：** `dd` 会更改 Zotero 废纸篓/Selection 状态；`u` 是 Neo 最近一次批次恢复，并非私人数据保护机制。整条只在 disposable profile 执行，结束销毁该 profile；不在个人资料库试拍。
+- **镜头 / 不录条件：** 维持三条名称、Selection badge、Cursor 行、打开后的 Reader 标题和确认目标可读。Selection 数不是 2、Cursor 不是第 3 条、出现隐藏 Selection 成员、确认框目标不明或任何目标不符时立即取消；不可按确认后用字幕解释成目标正确。
+- **依据：** [Main Normal/Select 默认键位](COMMAND_REFERENCE.md#main-window)、[Main Cursor、Selection 与 EffectiveSelection](INTERACTION_MODEL.md#effectiveselection)、[Main Open 是 Cursor-only 例外](INTERACTION_MODEL.md#action-target-contracts)、[废纸篓确认与目标可见性](INTERACTION_MODEL.md#hidden-selection-safety)。`s` 前移 Cursor、`dd` 确认、`u` 恢复及 `o` 不批量打开，均按这些当前契约拍摄。

## S2 — Reader：原生面板、类别导航与历史

**单一任务：** 在有真实 Outline/缩略图/注释的 PDF 中浏览原生面板及类别，再通过一个真实书签跳转验证 Back/Forward。

- **拍前准备：** 新 profile、一份具备可用原生 Outline、多页缩略图和至少一条真实 Reader annotation 的公有领域/授权 PDF；Annotation 可以在本次 disposable fixture 中预先真实创建。确认文档有至少两个可导航的原生 heading。Reader mark 持久化关闭，避免写回父条目 Extra。
- **起始 Surface / mode / focus：** 该 PDF 的 Reader Normal，PDF pane 聚焦在可重复的起始位置；所有待演示的行/目标确实存在。
- **操作：** 在起始位置依次按 `m`、`a` 设一个真实 mark，再按 `l` 到另一页。按 `<Space>ro` 聚焦 Outline，使用 Outline 的 `j`/`k` 移动；按物理原生 `Enter` 让 Zotero 执行当前 Outline 行的原生导航。用鼠标实际点击 PDF pane 转移焦点，然后依次用 `[s`、`]s` 展示上一/下一原生 heading。再用 `<Space>ra`、`<Space>rt`、`<Space>rm` 分别聚焦 Annotations、Thumbnails、Bookmarks，镜头中保留原生侧栏/缩略图/注释内容；在 Bookmarks 中用 `j`/`k` 移动并以 `Enter` 跳到刚才设置的 mark。点击 PDF pane 把焦点交回 Reader Normal 后，按 `<C-o>` 回到 mark 跳转前的位置，再按 `<C-i>` 前进回 mark。
+- **历史闭环：** `<C-o>` / `<C-i>` 两次都必须看到真实页/视口位置发生变化；不将普通 `j`/`k`/滚动说成历史条目。
+- **可见结果：** 能看到四种 Reader 原生面板/内容以及类别命令实际落到的 PDF 位置；`<C-o>` / `<C-i>` 在 mark 跳转前后切回两个真实位置。Marks 是 Neo Reader marks，与 PDF 注释分开说明。
+- **持久变化 / 重置：** 本场景的 mark 在 Reader session 内；面板与页面状态按 Zotero 运行。所有预置注释及文档都属于 disposable profile，拍后重建，不写用户条目 Extra。
+- **镜头 / 不录条件：** 将 PDF、当前焦点 pane 和侧栏同时纳入画面。无真实 Outline heading、Annotation、Bookmark 或历史位置变化时，不用空面板、假目标或跳页字幕补足；缺少真实原生目标则换一份已授权 fixture 后重新准备。
+- **依据：** [Reader Normal 类别、页导航及面板快捷键](COMMAND_REFERENCE.md#reader-normal)、[Reader marks 与 Reader sidebar 局部控制](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)、[History 记录边界/恢复限制](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)、[原生 Outline/Bookmarks 与注释面板](USER_GUIDE.md#native-reader-outline-and-bookmarks)。Reader `gg/G` 是否产生历史受 host API 与原生 hard receipt 限制，本片用 managed-final mark 跳转验证历史，不把普通滚动伪装成跳转。

## S3 — Reader：Flash、范围修整与注释评论

**单一任务：** 用 Flash 建立文本范围、修整选区，为该范围创建注释并用真实的评论输入控件保存。

- **拍前准备：** 新的独立 profile/data directory；PDF 可真实选中文字、可识别内容，起始时不含既有 annotation；Reader Select 与 Annotation comment editing 均启用。若证明 per-live-view ownership，准备 Reader 分屏及两个可区分真实 PDF view。只在有真实系统 IME 的实际机器上拍 IME 支持；不能后期合成候选窗。
- **起始 Surface / mode / focus：** Reader Normal，目标 PDF pane 聚焦；画面中有一个可查找且不含私人内容的真实短语。
- **操作：** 按 `v` 进入 Flash start；在真实输入框中输入屏幕上实际出现的文字查询，按当前画面显示的目标 label 选取（label 每次可能不同，不预填）。确认进入 Reader Select 后按 `s` 开 Flash endpoint，输入实际查询并选择实际显示的 label。用 `l` 或其他适当的 Reader Select 运动键做可见范围修整；以 `SELECT` 状态和选中文字确认当前目标。按 `za` 创建 annotation 并打开评论输入。
- **评论 / 原生输入：** COMMENT 拥有者打开后，用原生文本输入真实写入两行内容，中间实际按一次 Enter 换行；如用 IME，候选、组合、提交与 Backspace/Escape 都按现场原生行为保留，组合中的 Escape 不得剪成关闭编辑器。最后一次编辑后可保留真实空闲间隔；实现合同为 2 秒 autosave，但仅看到 textarea 草稿、等待 2 秒或随后按 Escape 都不能证明自动保存已持久化。按 Escape 保存并关闭 COMMENT，回到 Reader Normal；再按 `]a`（该 disposable PDF 此时仅有刚创建的一条 annotation）选中它，按 `<Enter>` 重开并核对评论仍在，再按 Escape 关闭。这一闭环证明 Escape 保存，不单独宣称证明 autosave。
- **Autosave 证据边界：** 只有在 COMMENT 仍打开、未 blur/关闭/按 Escape 时，从真实 Zotero native annotation sidebar 读回已持久化内容，或使用明确标注为 read-only technical proof 的实测持久化读取，才能把自动保存作为该 take 的证据。若无这种实际可见/明确标注的读回，记录为未验证 autosave；不得以关闭 Reader 后重开或可见草稿替代，因为关闭/失焦的保存路径无法区分 autosave。
- **per-live-view ownership（仅在实际分屏上录）：** 左侧 PDF view 打开该 annotation 的 COMMENT 后，用真实鼠标把焦点移到右侧 PDF view，按 `j`。预期只有右侧 PDF 的 Reader 位置移动，左侧 COMMENT 草稿/编辑器仍属于原 PDF view；回到左侧评论输入，再用 Escape 保存关闭。两 pane、焦点交接和各自结果必须同框可见；不能只用讲解声称事件所有权。
- **可见结果 / 持久变化：** Flash 全匹配 query 作为初始 range；endpoint Flash 保留原 anchor；修整后为有实际目标的 Reader Select。`za` 创建真实 annotation；COMMENT 的换行真实显示，Escape 后通过重新打开可见已保存评论。该 take 只证明 Escape 保存；若没有 autosave 的独立真实读回，不宣称证明 2 秒自动保存。数据修改只落在 disposable PDF。
- **重置 / 不录条件：** 丢弃 disposable profile。无 Select/COMMENT 指示、label 不在画面、目标不匹配、注释未创建或评论重开不一致时，不录“成功”。翻译、OCR 或虚拟评论内容不属于该场景。
- **依据：** [Reader Select/Flash、范围动作和 Add note](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)、[评论输入的 Enter/Escape/2 秒 autosave](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)、[原生 IME 所有权](INPUT_METHODS.md#rule)、[Reader 注释输入与视图范围](USER_GUIDE.md#annotation-comment-input)。Reader 只有 Normal/Select 两种 Surface mode；COMMENT 是 view-scoped feature input owner，不是 Reader Insert。

## S4 — Reader Selection → 现有 Note：真实空状态、显式扩展与命名回执

**单一任务：** 从真实 Reader 选区捕获文字；先看到 Current item 确实为空，再明确切到同一 Library 并写入一个已有 Note。

- **拍前准备：** disposable profile 中准备一份有真实可选文字的 PDF，其当前 Item **没有 Note**；同一 Library 内另有一个已存在、属于另一个真实条目的 Note。该 Note 有可识别的标题、父条目及基线正文，便于检查追加而非覆盖。关闭同步。记录真实目标标题与实际 owner，绝不准备“自动创建”的空 Note 假象。
- **起始 Surface / mode / focus：** Reader Normal，PDF pane 聚焦于源 PDF；Main Selection 不参与这个目标解析。
- **操作：** `v` + 实际文本 query + 画面上真实 label 建立 Reader Select；按 `a`（或 `<Enter>`）打开 Selection Actions，在实际菜单中用 `j`/`k` 移到 **Capture to note**，用 `Enter` 确认。Notes chooser 初始处于 Current item scope。拍到无 Note 的诚实空状态；不能先打开 Library 后伪称这是当前项空状态。
- **明确切换及写入：** 用原生 `Tab` / `Shift+Tab` 移动，直到可见焦点落在 **Browse library** source 按钮；按原生 `Enter` 或 Space 激活。chooser 切至同一 Library，保留本次 query/capture。选一个现有 Note；结果行显示真实 Note title，Preview 显示该 Note 的实际 parent 与正文（不要假定 Preview 再显示一次标题）；按 `Enter` 确认一次。等真实保存完成，拍到实际成功回执命名了刚才选中的 Note。为核对最终正文，从 Reader Normal 再按 `<Space>fn`，在新的 Notes chooser 中再次显式 **Browse library**，搜索/确认同一结果行标题与实际 parent，打开它，检查原正文保留且追加 quote 与可用 PDF page label。
- **可见结果 / 持久变化：** 空的 Current item 结果不偷偷扩展；只有明确激活 Browse library 后，其他 owner 的真实 Note 才出现。写入的是 Preview/确认时锁定的现有 Note ID；回执与实际 Note 内容 owner 一致。不会自动新建 Note 或添加 Reader backlink。
- **重置 / 不录条件：** 只用 disposable profile。source 按钮/焦点、真实 owner、锁定目标、回执标题或正文追加结果任何一项无法辨认就取消；重复按 Enter、双击确认、按 Escape 取消已 admitted 的 save 或把另一轮写入剪进来都不能作为成功证据。
- **依据：** [Reader Selection 与 Capture to note](USER_GUIDE.md#knowledge-capture-workflow)、[Notes Current item、Browse library、标题与 Preview](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)、[目标锁定、owner 检查及单次原生保存](INTERACTION_MODEL.md#knowledge-capture)。Reader/Note 不借用 Main Selection；Note chooser 不创建 Note、不加自动 backlink。

## S5 — Settings：暂存 remap 与原生输入所有权

**单一任务：** 录制一个安全的 Main remap 从草稿到 Apply 的完整过程，并在真实 picker/Outline 中看见 Neo 不夺取原生文本、IME、剪贴板和 Outline Enter。

- **拍前准备：** 新 profile/data directory 与至少 3 条可见 disposable fixture；其中一条有可用的非敏感真实中文标题，可由当前 OS IME 查询。准备实际装有系统 IME 的机器。Main 项目列表可操作，Cursor 在第 1 条。确认 `]j` 在当前 `main-normal` context 可录且不与实际保留键冲突；Settings 若拒绝，就停止并选一个经界面接受的可用序列，不把失败试验演成通过。
- **起始 Surface / mode / focus：** Main Normal，项目列表已聚焦。先按 `j` 观察 Cursor 到第 2 条，再按 `gg` 回第 1 条，建立实际旧绑定基线；旁白点明 focus owner。
- **Settings 搜索与原生 IME：** 按 `<Space>ps`，选择 Keybindings。Settings 搜索输入框获得焦点后，使用本机系统 IME 输入 fixture 上真实可见的中文标题片段。保留真实候选与组合；组合期间分别在两轮实际 composition 中按 OS IME 的 Escape、Backspace，让画面显示该 OS/IME 对候选/组合的实际响应，而 Settings 仍未误关闭/误执行命令。按该机器实际的候选确认键提交文字，画面确认查询字段得到已提交文本。Recorder 不是中文编辑器，不要求在 Recorder 里录入汉字。
- **剪贴板源：** 在同一 Settings 搜索字段选中刚才的已提交 fixture 标题，按 `<C-Insert>` 复制；随后用原生文本编辑清空查询，再搜索 canonical ActionId `mainNavDown`，选择 `main-normal` 对应动作。复制源必须是本场 disposable fixture 的公开内容，不展示剪贴板读取工具或私人数据。
- **Record 与暂存：** 点击真实 **Add/Record** 后，让同一真实系统 IME 在 Recorder 期间出现一次实际 composition/candidate；提交候选后检查 Recorder 仍在录制且没有多余的错误键 token，也没有提前 Done/Apply。然后物理依次按 `]`、`j`，实际预览应为 `]j`。按可见 **Done** 保留该序列；不要把 Enter/Escape 当作 Recorder 完成/取消。画面显示改变仍为 staged、**Apply** 尚未执行。
- **旧绑定与 Apply：** 用鼠标点击 Settings 上可见的 **Close**，且不按 Apply；回到 Main 后按 `j` 再次确认默认移动有效，按 `gg` 回到首行。重开 Settings 并检查当前实际 draft：若尚保留 `]j`，不要重复添加；若未保留，则重新录制同一序列并按 Done。确认 `]j` 显示为 staged 后明确按 **Apply**。可拍 **All groups** 中与 context 对应、read-only 的 native shortcut 区域。再点实际 **Close** 返回原 Main item-list focus；按 `]`、`j` 两个连续键验证 custom `mainNavDown`，按 `gg` 回首行，再按 `j` 验证默认键也仍有效。
- **剪贴板接收与原生 Outline Enter：** 按 `<Space>ff` 打开真实 picker，query input 获得焦点后按 `<S-Insert>`，检查此前从 Settings 字段实际复制的同一公开标题原生粘贴并产生真实匹配行；按 `Enter` 打开这条真实 PDF。Reader Normal 下按 `<Space>ro` 聚焦 Outline，在真实 row 上按物理 `Enter`，观察 Zotero 原生 Outline 跳到实际目标。不要把该 Enter 标成 Neo `uiConfirm`。
- **可见结果 / 持久变化：** 同一实际设备拍出 Settings search 的 IME composition/提交、Recorder 不误收 composition/候选键、显式 Done、未 Apply 前旧 `j` 有效、Apply 后 `]j` 与 `j` 都有效；`<C-Insert>` 从 Settings 字段复制到 `<S-Insert>` 在 picker 字段真实粘贴；Outline Enter 仍由 Zotero 操作。remap 仅持久保存在本次 profile。
- **重置 / 不录条件：** 拍后销毁 profile。若没有真实 IME 候选/组合/提交、composition 被 Recorder 记成错 token、Done/Cancel 不是实际按钮、草稿未 Apply 却宣称已生效、旧/新绑定结果不符、剪贴板跨原生字段核对失败或 Outline 没有真实原生跳转，不将本片作为 #137 硬件/native PASS；不得用伪造字幕或脚本输入补足。
- **依据：** [Settings 录制、Done/Cancel/Apply](USER_GUIDE.md#customising-keybindings)、[picker 与 IME/原生剪贴板所有权](INPUT_METHODS.md#shortcut-controls-and-native-text-ownership)、[Outline Enter 原生所有权](INPUT_METHODS.md#shortcut-controls-and-native-text-ownership)、[v0.2.0 U6/U7 实体输入与原生键验收](./V0_2_ACCEPTANCE.md)。Settings 未 Apply 前的结果、每个按键及 native event 均须现场观察；录屏只是支持证据，不自动等于验收 PASS。

## S6 — Note：Vim gate 与 Normal/Insert（两条独立短片）

**单一任务：** 展示同一 Note identity 的基础编辑，并清楚区分 Note editor Vim mode 开启与关闭。**各拍一条完整片；不可剪接两个 profile 或把关闭状态伪装成 Insert。**

### S6-on — Note Vim mode 开启

- **拍前准备：** 新 profile；Neo Settings 中 **Note editor Vim mode** 已启用。Main 当前 Item 有一条真实存在的 disposable Note。展示前确认 Note 标题与实际 owner。
- **起始 Surface / mode / focus：** Main Normal，项目列表焦点在含该 Note 的 fixture Item。
- **操作：** 按 `<Space>fn`，在真实 chooser 中选该 Note；以结果行上的真实标题辨认目标，Preview 核对实际 owner 与正文，再按 Enter 打开。焦点转到 Note editor，旁白说明 `note-normal`。按 `gg` 到文首，按 `w` 做一次 Note Normal motion，按 `i` 进入 Note Insert，输入一小段真实无敏感内容，按 `<Esc>` 回 Note Normal。
- **可见结果 / 持久变化：** 实际 Note 正文显示新文字，当前 Note tab/editor 的真实标题与 owner 始终对应；Insert 文字来自原生编辑器，不作为 Neo 命令。修改只在 disposable Note。
- **重置 / 不录条件：** 销毁 profile。若 Note editor Vim mode 未启用、编辑器焦点不明、Note identity 与结果行标题/Preview owner 不符、或 `i` 未进入该路径，取消，不讲成 Vim mode 成功。
- **依据：** [Note editor 开启 gate、Insert/Normal 与默认 motions](COMMAND_REFERENCE.md#note-editor)、[Current Item Notes chooser](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)、[设置页 gate 名称](USER_GUIDE.md#settings)。

### S6-off — Note Vim mode 关闭

- **拍前准备：** 另建全新 profile 和独立 disposable Note，**Note editor Vim mode 已关闭**；与 S6-on 不共用 profile。确认目标 Note 标题和 owner。
- **起始 Surface / mode / focus：** Zotero 中同类型实际 Note editor 获得原生编辑焦点；旁白明确“Note Vim mode 已关闭，原生编辑器输入拥有键盘”，不称其为 Note Insert mode。
- **操作：** 在正文中物理输入一个包含字母 `i` 的真实测试短语（按键和文字如实保留），不要先进入 Neo 模式或用 `i` 后接指令序列；让这些字符实际写进该 Note。
- **可见结果 / 持久变化：** 普通字符确实进入原生 Note 正文，不执行 `noteInsert`/其他 Neo Normal 操作；画面可辨认仍为同一 Note identity。文字仅写入 disposable Note。
- **重置 / 不录条件：** 销毁本 profile。若实际 gate 未关、按 `i` 触发 Neo command/模式，或输入没有落到真实 Note，停止并修复拍摄配置，不用字幕代替。
- **依据：** [Note editor gate](COMMAND_REFERENCE.md#note-editor)、[Note editor Vim mode 设置](USER_GUIDE.md#settings)。开启/关闭是 preference gate；本片不声称在同一个编辑器中切换设置一定会热更新。

## S7 — Plugin Manager：真实 AddonManager 状态与自我保护

**单一任务：** 从真实已安装列表检查插件信息/状态，核对 Neo 自身不能从 Neo Manager 禁用，然后安全退出。

- **拍前准备：** 新 disposable profile，确保当前安装的 Zotero Neo 确实出现在 Zotero AddonManager。只使用实际已安装插件，不安装伪造 provider、不编造设置 pane、首页、README 或 GitHub repo。不要为演示而切换不熟悉插件的 enable/disable 状态。
- **起始 Surface / mode / focus：** Main Normal，项目列表焦点明确。
- **操作：** 按 `<Space>pp` 打开 persistent Plugin Manager；拍清列表给出的真实名称、版本、ID、enabled 状态及该行实际允许的 lifecycle actions。按 `/` 聚焦 filter，以原生文本输入 `Neo`；在实际结果中定位 Zotero Neo，按 Escape 回到结果列表。检查 Neo 行确实没有可用的 Manager 内 disable 操作；不要向其发送 `d`。按 `r` 从 Zotero AddonManager 重载当前状态，确认显示真实重读后的状态。若列表有其他插件，只展示其当行真实可执行的 `e/d/p/o/R/L`，不打开外部链接、不执行未获授权的 lifecycle 操作。最后在 results context 按 Escape 或 `q` 关闭 panel。
- **可见结果：** Plugin Manager 仍是面板而不是 chooser；真实 AddonManager 状态重新加载；Neo 不可在自身 Manager 内禁用，须用 Zotero 原生 Plugins surface 管理。插件信息、可用 actions 与当前列表逐字相符。
- **持久变化 / 重置：** 本流程只读取/重载真实状态，不切换其他插件；关闭后 disposable profile 按共同规则处理。如另行获准演示 `e/d`，必须另用专用 disposable profile、确认目标插件/依赖和预期恢复方法，拍实际操作前后的 AddonManager 状态；不得在本 S7 take 中混入未经授权的停用。
- **镜头 / 不录条件：** 若 Zotero Neo 不在当前真实列表、状态/版本无法读取、disable action 仍显示为可用，或无法确定 focus 是 filter 还是 list，不录“自我保护成功”。不补演“插件商店/在线安装/更新/卸载”；这些不属于 Neo Plugin Manager 已实现能力。
- **依据：** [Plugin Manager 生命周期和自我保护](USER_GUIDE.md#plugin-manager-panel)、[plugins-list 与 plugins-input 的准确边界](COMMAND_REFERENCE.md#modes-focus-and-capabilities)、[Manager 操作及非 installer 能力范围](COMMAND_REFERENCE.md#selection-actions-plugin-manager-settings-and-selection-panel)。Zotero AddonManager 是 lifecycle 状态权威；此面板不提供任意软件包安装、更新、卸载或远端插件发现。

## 可选第三方集成（与 S0–S7 核心片分开）

这些是**仅在实际集成存在时才拍的独立可选片**，不得混入核心片或说成 Zotero Neo 内置 provider。当前机器未安装/未开放相应集成时，直接不拍，不造空菜单截图或成功结果。

- **Better BibTeX：** 仅当当前 Zotero 实际安装并启用了 Better BibTeX，且 disposable 公有领域条目确有 citekey 时，单独拍 Main Normal 的 `<Space>yy` 对真实有效目标复制 citekey。按目标名确认是 Main 当前目标/Selection，不暴露用户剪贴板或私人 citekey；若任一目标无可用 key，应拍成拒绝/不录成功，不填造 key。不要把 BBT 说成 Neo 自带。
- **Translate for Zotero：** 仅当当前实际安装的 Translate 集成使 Selection Actions 中出现 **Translate** 时，单独从真实 Reader Select 文本打开该项并拍真实翻译结果。标注实际插件/集成名称；不虚构 provider、语言支持、API 输出或离线能力。可用性的依据见 [Selection Actions 与可选 Translate](USER_GUIDE.md#selection-workflow)。

## 参考边界

本指南只引用拍摄所需的选定流程与限制。[COMMAND_REFERENCE.md](COMMAND_REFERENCE.md) 仍是唯一完整 ActionId/默认键位索引；本指南不复制完整键位表或另立 registry。核心依据还包括 [USER_GUIDE.md](USER_GUIDE.md)、[INPUT_METHODS.md](INPUT_METHODS.md)、[TAGS.md](TAGS.md) 和 [INTERACTION_MODEL.md](INTERACTION_MODEL.md)。所有视频都是日后的真实演示素材，不取代 [V0_2_ACCEPTANCE.md](./V0_2_ACCEPTANCE.md) 中逐项验收证据。
