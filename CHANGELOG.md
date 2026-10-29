# 更新记录 {#changelog}

## [0.2.0] - 候选版本（未发布） {#_0-2-0-release-candidate-unreleased}

### 新增 {#added}

- 在现有 Neo 设置中开放十二个内置模块的启动配置，默认全部开启。草稿依赖预览、已保存请求与已应用值分开展示，标明启用、停用、阻止、失败、等待宿主及等待重启；保存不自动切换依赖，只有真正重启 Zotero 才应用，Neo 重载沿用本进程启用图。原生偏好页与公共设置入口始终保留。
- 增加模块基座和标签模块接入：按 MainWindow 隔离作用域，登记唯一上下文/动作贡献，退休回调后清理资源，激活失败时回滚部分资源并保留原始错误。Main、Reader、Note 的标签目标、原生事务与默认绑定不变。
- 增加七个默认无绑定的 Main 分类命令，支持查找分类、连续添加已有条目、移动条目/分类，以及通过原生对话框创建、重命名、删除。复用现有 Palette 和 Picker，不新增控件；保留原生分类编辑、拖放、`<Space>fc` 与 Persistent Selection。
- 在 Main 和 Reader Normal 增加 **Add Item by Identifier**，默认 `<Space>ai`，支持重绑定和 Command Palette 发现。复用 Zotero 原生输入、批量查找、保存与错误处理，保留草稿和原生 IME/Enter/Escape 所有权。Reader 标签页与独立窗口返回实际关联 Library，不借用条目 Selection；拒绝歧义或只读库 Scope。
- Reader Normal `y` 绑定 `copyTarget`，分别提示批注 Excerpt/Comment、DOI、arXiv、HTTP(S) 与原生外链复制目标；`followLink`（`f`）同时支持识别出的文本标识符和原生链接。Select `y` 与 Normal `Y` 不变，直接 `yankAnnotation` 默认无绑定。schema 19 将 `copyIdentifier` / `followIdentifier` 迁移为新 ID，保留自定义位置、显式 null 和自定义 `reader-normal:y` → `yankAnnotation`，不新增 `<Space>ya`。
- 增加具有本地搜索、响应式导航及浅色/深色主题的 VitePress 文档站。
- 增加截图与视频编写规范，提供原生播放控件和文字替代。
- Reader 和 Note Command Palette 提供默认无绑定的 Show in Library，作用于当前 Surface 条目；它与 Back/Forward 是不同动作。
- 增加每个 MainWindow 独立的栈式导航历史，最多 100 个位置，新分支截断前进尾部。Main、Reader、Note Normal 的 `navigateBack` / `navigateForward` 默认 `<C-o>` / `<C-i>`；按键 count 支持连续遍历，Palette 动作不计数。
- 增加 Main、Reader、Note 与局部界面的帮助式命令参考，覆盖发布绑定、动作 ID、count、目标、功能依赖，以及共享 jumplist 的记录、恢复和失败边界。
- 在全部 14 个绑定上下文提供按动作发现快捷键及暂存编辑。搜索包含本地化标签、ActionId、当前/默认按键、分组与上下文；标明 Default、Custom、Unbound，原生快捷键另以只读方式说明。
- 增加 Reader 标题、Figure、Table、批注、Bookmark 导航，以及直接聚焦 Outline、Bookmarks、Annotations、Thumbnails。标题使用完整原生 Outline；图表按需复用具有 PDF 锚点的真实 Zotero 结构化 captions，不编造目标。冷缓存可能需要本地处理整个 PDF，不增加上传或 OCR 依赖。Bookmark 按文档位置导航并循环。

### 调整 {#changed}

- 用户总览、功能与日常工作流指南、命令参考及输入法说明统一为中文，保留原 URL、标题锚点和技术标识。补齐模块状态排错，明确公开发行版与当前开发构建的区别；使用说明与项目验收协议分开维护。
- 按静态清单、精确上下文及实际宿主实例过滤模块能力，在按键匹配、count/前缀、Guide 与 Palette 前排除不可用贡献，保留动作元数据和用户绑定。Capture 等待实际 Notes/Selection 依赖，不要求 Main 启动时先有 Reader；停用 Worksets 后标签/分类仍使用当前目标。Reader Select、原生批注、hints 与 Workspace 按独立能力退化，旧行为开关保持原义。
- 将标签页候选、切换/循环/关闭、Reader/Note 的 Show in Library 与 Reader 分屏/方向焦点接入 `workspace`。Picker 取得显式标签页来源，Surface 传入自己的目标；普通按键与 Palette 共用真实实现，方向焦点实际成功才消费按键。唯一历史、原生标签页重扫、NativeInput 及 Main/Note 通用面板焦点仍由基座负责，不依赖 Library 或 Reader 导航模块；不新增动作或绑定。
- 将批注创建、删除、改色、过滤、复制及评论编辑接入 `reader-annotations`。Select 下划线与 Add note 使用模块的具名贡献；Surface 保留 CurrentTarget、NativeInput、`i` 和 `zb` 的混合路由。评论交互绑定精确视图与 Document，部分获取和重入退出释放自有资源；已接纳保存继续完成，但旧状态和焦点不复活。不新增动作、绑定或运行时依赖。
- 将 Reader Select、DOM 范围与 motions、Flash、复制/搜索所选文本和 Selection Actions 接入 `reader-selection`。公共选择 API 与注册 disposer 保持原签名；应用级动作定义不随单个 Reader 释放。Capture、下划线和 Add note 仍由具名贡献提供，选择模块不拥有批注或 Note 写入，不依赖导航模块。
- 将 Reader 页面、滚动/平移、缩放、搜索、Outline/图表/批注位置遍历、marks 和原生侧栏增强接入 `reader-navigation`。保留特殊 marks 语法、数据格式、按需结构分析和共享历史；分屏/焦点由 Workspace 复用基座宿主能力。四个侧栏上下文使用真实唯一贡献；已接纳 mark 保存继续完成，但不覆盖后续交互状态。平滑滚动保留重复输入与减速，销毁视图的取消失败不再保留旧 RAF 或阻塞后续滚动。
- 将 Reader 摘录到已有 Note 的快照、目的地确认、原生追加/保存和回执接入 `capture`，MainWindow 与 ReaderSession 各自拥有真实贡献。保留公共选择 API、现有选择动作及 Notes 候选；不借用 Main Selection，不依赖 Vim Note 编辑开关。旧确认不能写入，界面退休不撤销已接纳保存，晚到结果不恢复旧状态或焦点。
- 将 Note 候选、打开编排及可选 Vim 编辑接入按窗口隔离的 `notes`。模式、寄存器和 caret UI 归模块；Surface 保留精确编辑器身份、原生/IME 输入、count、前缀和共享焦点。Main/Reader/Note 查找与 Capture 显式使用同一候选能力，Vim 开关不控制 Note 查找或 Capture 目的地。
- 将树导航、Local Find、搜索入口、条目选择器、打开、标识符录入、citekey 与最近回收批次接入 `library`。Main session 不再持有 Local Find 或回收历史；共享焦点、原生 View 能力与唯一 Back/Forward 仍独立于 Library。Reader citekey 使用本地目标；保留原按键、显式 Select 重绑定、候选范围和目标拒绝策略。
- 将 Main Persistent Selection、Visual 与 Selection Panel 接入按窗口隔离的 `worksets` 模块，Main session 不再预建工作集状态。Cursor、原生多目标取消和共享行渲染仍由 Main 持有；目标与 Trash 只消费明确 Selection 端口，Reveal 使用既有导航历史。保留原有按键、隐藏成员拒绝和目标优先级；旧面板、计时器与导航完成不能影响替换实例，重入退休时晚到的主题/外观句柄也会释放。每次面板关闭即释放自身主题，不再由模块寿命的清理闭包持有已分离 DOM。

- 将 Reader copy/link hints 接入按 ReaderSession 隔离的 `reader-hints` 模块，拥有可见目标、临时标签、链接激活与目的地 cue。保留 Normal `y` / `f`、精确分屏视图、IME/原生输入优先级及唯一导航历史；父作用域退休后旧确认、异步完成和 RAF 不再写入或重画，清理失败仍释放其他自有资源。原始业务错误与清理异常分别诊断，不再产生未处理的导航 Promise rejection。共享标签辅助继续供 Flash 使用。

- 将分类工作流接入按窗口隔离的 `collections` 模块，拥有候选来源、重命名草稿和精确 Picker 释放句柄；移除 controller 的共享业务实例。保留 Main/Reader 目标、原有九个 Main 命令、查询/取消与事务回滚语义，不新增 Note 命令。修复命名对话框期间模块退休后仍弹出下一确认框的问题，旧交互不能写入或关闭替换 Picker。

- 将已安装扩展管理接入 `extensions` 模块，按 MainWindow 拥有面板状态与清理，Main session 不再预建该功能状态。保留 Main/Reader/Note 的 `<Space>pp`、筛选、权限与自保护、重绑定/IME、设置及链接；模块退休后旧 DOM 和异步完成不再改变 UI。主题清理失败仍释放剩余资源，界面获取失败时回滚并保留原始错误。不新增扩展安装、更新或卸载功能。

- 项目文档默认只维护中文；现有英文按需原位翻译，保留 URL/必要锚点，不建立双语副本。文档站导航和搜索界面改为中文，技术标识与许可证原文不变。
- `<Space>ca` / `<Space>cr` 显示直接成员覆盖率，只添加缺失成员；创建并添加支持明确父分类/名称确认并原子执行。条目移动要求单一普通直接来源，并保留其他成员关系；删除分类保留全部条目。
- 插件源码、VitePress 和共享 Markdown 使用同一 checkout 与依赖锁，在根目录构建和预览文档站。
- 必需的 Main/Note/Reader 私有 SDK 与宿主 DOM 能力集中到内部 `src/toolkit/`。目标优先级、模式、工作流、marks 存储与历史策略保留在业务负责方；公共句柄不暴露原生 pane/tree/PDF/editor 内部对象。
- 单 Scope 选择优先使用文档化分类选择 API，保留零个/多个 ScopeSet 行为。Note 按键分发只缓存当前标签页不可变元数据，不复制整个标签页清单。
- 统一条目工作集、可视范围、文本选择与批注的中文 UI/文档术语，明确评论保存与释放边界。
- 删除未使用的跨 Surface 条目目标分发器和转发导出；Main/Reader/Note 解析器保留行为契约。仍在使用的持久化偏好迁移辅助不变。
- 删除历史源码文本、错误措辞、CSS 拼写及重复默认表断言，保留偏好迁移、原生输入边界、清理竞争和包字节契约。
- 不在每次按键中重新解析未变的序列化绑定与不可变模式投影；偏好编辑和可变编辑草稿仍立即生效。
- Picker 排名限制为显示的前 100 项，同分保留来源顺序；键盘移动选择不重建结果行。
- Notes 和 Reader Capture 默认显示当前条目的笔记，明确切换到 Library 来源时保留查询与确认语义。行只显示标题，以细小不可选分隔区分所属条目，Preview 显示真实所属条目或独立/不可用来源；包含引文工具术语的人工笔记不被过滤。
- Debug 与 profile 日志包含 Reader 失败阶段、异常栈和 cause；首次失败及恢复记录一次，不在空闲时重复输出。
- Reader 视图/session 与 Reader/Main 组合退休在活宿主清理抛错时仍尝试释放全部负责方，最后保留原始失败。Main UI/观察者先退休再清理，晚到回调不能重新附着。PDF 视图只恢复仍自有的按键桥；已退休 wrapper 委托原生 Reader。分屏监听和桥接无需二次释放；Bootstrap 在 shutdown 前丢弃旧 controller；profile 写入诊断保留首个和额外关闭错误。
- 批注评论输入绑定到捕获的 PDF 视图。Enter 换行，Escape 保存并关闭，两秒自动保存；旧回调不能改变新编辑器的焦点或草稿。
- 删除 Reader Insert mode 与绑定上下文。评论偏好迁移为 `annotationCommentEditor.enabled`，保留已有规范值，删除失效 Reader Insert 绑定；Note Insert 和无关自定义绑定不变。
- Reader `gg`、`G` 与计数页跳转共用一条原生导航路径，混用时仍保留正确全局历史位置和当前分屏。无 count 的 `G` 到文档底部，`nG` 仍到指定页，不改变缩放。
- Main、Reader、Note 通过已完成位置统一记录导航。原生没有可恢复位置时，Reader 搜索或批注移动可以完成而不新增历史。
- 原生 Outline 增加主题适配的颜色/图标、稳定全树序号（含无编号 Introduction 作为第一 Section）、直接子项计数，以及有界 Bookmarks/caption 分组。原生标题/编号与独立 Annotations/Thumbnails 不变。
- 旧 Reader `<Space>e` / `<Space>m` 和裸 `[` / `]` 默认改为直接聚焦 `<Space>ro/rm/ra/rt`，以及 `[s` / `]s`、`[f` / `]f`、`[t` / `]t`、`[a` / `]a`、`[m` / `]m` 分类导航。直接聚焦打开面板，不切换关闭。
- Neo Reader 面板、Picker 输入/列表、Plugin Manager 输入/列表通过共享动作/上下文目录配置。原生文本和 IME 保留宿主所有权，原生快捷键单独只读说明。
- schema 18 保留非 null 的自定义精确覆盖，仅在目的地缺失时迁移旧显式 null；将 `focusReaderSidebar` 迁移为 `focusReaderOutline`，不留运行时别名。先写覆盖，再写 schema，迁移幂等。
- Main `o` / Enter 打开 Cursor 条目；Note `<Space>o` 打开当前笔记所属条目。二者使用自身上下文，不使用 Main 标记 Selection。
- Main Trash 确认目标种类/数量，拒绝隐藏 Selection 成员，取消或失败时保留 Selection/历史。Reader 批注删除说明单个目标及永久后果，取消保留批注选择；确认与目标反馈跟随 UI 语言。
- 历史记录明确的 Main、Reader 与跨 Surface 跳转，不捕获 Persistent Selection。可恢复关闭的可读附件及可用 PDF 位置，不恢复缩放/布局或 Note caret；不可用或只恢复部分的目的地不推进历史指针。PDF 链接实际导航仍由 Zotero 管理。
- Show in Library 将原生选择失败视为失败，并按序处理重叠请求，不替换更新的上下文；异步 Trash/删除保留较新的 Visual/批注选择。Reader 批注清理使用克隆的原生数组，Note 失活重置 caret 和 Guide。
- Main 条目列表 `h` 聚焦当前已选分类，不折叠或跳到 My Library。Note Normal `u` / `Ctrl+r` 在原生无撤销/重做历史时不输入字面文本。

### 修复 {#fixed}

- Reader Navigation 的 marks/原生侧栏获取纳入模块激活事务，局部失败退休全部贡献但保留独立功能；Base 启动失败完整释放未完成 session，不由重扫循环重试。模块清理异常不再被通用清理层吞掉，剩余负责方继续释放。独立 Reader 的标识符可用性与实际 Main opener 一致，opener 关闭后缓存绑定及时失效。
- 评论交接区分原视图寿命与激活状态：切换标签页后仍保存活视图中的最终草稿，不等两秒自动保存；旧输入、视图替换及晚到保存的焦点保护不放宽。
- 选择交互绑定原 ReaderView 和 Document，同 Window 替换不能复用旧面板、范围或输入回调；新动作接纳前先释放旧视图，后续扫描不再关闭新面板。异步动作忽略忙碌阶段的重复/IME 按键，但取消、换视图或打开 Settings 后不重画旧 UI 或抢回焦点。退出释放 DOM anchor、选择样式、主题和输入监听；视图监听部分获取失败仍排空已注册资源。
- 从次分屏搜索所选文本时只更新对应的原生 Find；延迟写入绑定本次 Find 状态，后续输入、关闭重开或新搜索不会被旧查询覆盖。原生选择接纳后立即建立公共选择 API 的所属 Reader，隐藏或退休 Reader 不暴露旧选择。
- Note 编辑器发现跳过隐藏、折叠、零布局及其他 MainWindow 的 iframe，避免打开 Palette 后定时扫描误绑隐藏编辑器。编辑器替换前后的旧事件、计时器及 Palette 确认不能操作新 Note；普通 Picker 焦点转移不会使命令失效。
- 共享 Picker 关闭时先退休并清空 DOM/旧焦点引用，再分别释放绑定、输入监听、主题和界面。某项清理失败仍继续释放并诊断；旧异步完成、延迟聚焦及获取失败不能影响替换界面或已退休的 Main session。
- 分类树 Enter 与 Find collection 的确认目的地进入现有 Back/Forward，普通树移动不记录。展开分支时保留出发点，排队 Enter 固定接纳的 Scope ID，原生 Scope 完成与焦点恢复后才接受历史位置。
- 分类回调绑定实际 SQL 结果；外部提交后回调失败保留已保存回执，后续 Neo 写入等待回滚恢复。失败写入不污染后续逆向缓存或抹掉后来保存的成员关系；连续添加只完整加载已确认条目。
- Main 启动焦点声明保留到条目表就绪，再聚焦当前 View 第一项；后台窗口和空 View 不覆盖主动搜索、较晚 Reader 返回或扩展重载。
- Main View 状态和 Toggle Tag Filter 从完整原生渲染 Scope 读取，支持多分类及受支持的跨库混合选择，不调用单选择 API 或扩展候选到全库。
- Tag Filter 匹配数量只统计原生对象行，不计多选库标题和间隔行。
- XPI 包含完整项目 AGPL-3 与 fuzzysort MIT 声明，并验证实际归档字节。
- 候选兼容范围限制到已测试的 Zotero minor `10.0.*`，保留已发布 v0.1.0 更新条目。
- 发布绑定已接受 XPI SHA256、包元数据与源码/tag 身份；只发布验证过的 draft assets，相同重跑只读，冲突或不完整发布直接拒绝，不覆盖。
- Actions 依赖固定到已验证上游提交，保留触发方式与最小权限。
- Plugin Manager 异步刷新完成后保留当前查询/导航选择，避免下一启停操作误作用于刷新前的扩展。
- Main Cursor 在原生行 provider 稳定后按身份协调，包括无 refresh 的排序；新保存条目的明确原生选择保留。
- Main 视图观察者在注销前退休，异步原生分发已捕获的回调不能把旧 Cursor 带入替换 session。
- Note Document 替换时，即使 Window 和条目 ID 不变也重新附着输入；清除旧模式/chord，并在独立监听清理前封住旧回调。
- Main 行装饰初次观察者/监听安装失败时释放部分资源，使旧回调失效并保留原安装错误。
- 批注使用发起 Reader/PDF 视图的当前选择与几何。已接纳保存可以跨视图退休完成；旧继续执行不能清除/聚焦新选择或打开另一批注评论。
- 拒绝跨越两页以上或非相邻页的批注，不保存截断几何。不完整 PDF 坐标拒绝保存，同时保留 Select 和文本。
- 跨页批注矩形由选中的文本节点计算，排除中间 canvas/page box，保留部分文本端点。
- 只保留尚未完成的 Reader 定时器；完成/取消的回调不能重聚焦编辑器或保存更新草稿。
- 原生 Find 的 IME Enter 保持原生行为，延迟返回 PDF 的焦点只属于同一活输入/视图。
- 保留但隐藏的 PDF frame（包括 Reading Mode 底层视图）不能确认复制/跟随目标；确认前重新检查包含 frame 可见性，不关闭可见原生链接后备。
- Main Notes 使用聚焦 Cursor 条目，独立于原生多选和 Neo Persistent Selection。
- 只恢复明确的最近一批 Neo Trash，报告真实保存数量，保存失败恢复内存 deleted 标志；不调用无参数原生 Undo。
- 每个 Main session 替换旧反馈截止时间，较旧定时器不能擦除新消息。
- Picker 将确认固定到接纳候选，并在键盘/指针激活间 single-flight。异步加载保留已提交查询，来源/generation 隔离旧工作；保存失败保持可见，Escape 不能假装取消已接纳原生操作。
- Reader Note Capture 依据实际原生保存结算，即使界面被强制移除；保存失败保留未改的 Note 内容，成功反馈须通过原 Reader 调用/视图检查并指明目标。
- `[s` / `]s` 的书签若指向标题前一页结尾，匹配原页或下一页唯一真实标题并对齐其印刷起点，保留原生层级与真实后备。Heading/Figure/Table 共用显式、缓存 SDK 加载，打开 Reader 不触发额外处理。
- Figure 导航与 caption 选择对齐真实 caption 上方可信原生图像区域，包含图内文字并容忍锚点精度差异；有歧义时保留 caption。Table 位置、原生滚动、缩放及其他按键不变。
- `[s` / `]s` 在 PDF 与四种聚焦侧栏上下文均可用。全树遍历不受折叠/过滤/当前行影响，使用活精确视图几何并容忍取整/底部钳位，跨边界循环；延迟原生工作归当前输入/视图。原生编辑与 IME 保留所有权。
- 录制序列中每个 token 都检查原生保留键，包括查询编辑的 `<C-Insert>` / `<S-Insert>`，以及 Outline 带修饰键的 Enter/Return。Outline `uiConfirm` 仍支持但默认无绑定，可改为其他非保留键。
- 焦点/指针交给 Reader 侧栏或原生编辑器时，退休待执行 PDF 命令与 Guide，不让延迟动作越过输入处理方变化。
- 接受候选行单击/双击时退休延迟 chooser 命令，避免指针选择再触发旧确认。
- Settings 录制、取消、解绑或重置后恢复仍连接的焦点；原生行按上下文标注，Apply 保持可达，受限旧绑定只提供可用删除。
- Bookmark 遍历保留已删除批注结果，并将浏览器取整偏移视为相同目的地，避免重复跳到当前 mark。
- 尚未就绪的 Reader 在原生关闭后，先退休注入再访问 PDF wrapper，避免 dead-object 和幽灵 session；晚到 ready 回调不能复活旧身份，活对象注入错误仍可见。
- PDF 视图监听移除失败时，已退休回调不再吞原生键或发送晚到 blur/selection/viewport 事件。身份对应精确注册，同一 Window 重附着不会复活旧监听；保留原清理错误。
- 新 MainWindow 不在 Zotero 初始化内 pane 前读取上下文 Note getter，避免附着中止。Surface、Note 目标和编辑器身份统一通过一个宿主适配器读取已发布原生上下文，不吞活对象错误，也不改 Note 优先级、绑定或偏好。
- 链接提示保留原生 IME，只在捕获 PDF pane 拥有输入；失效 badge/cue/window 不遗留所有权，旧 RAF/定时器及晚到导航失败不影响新调用。Reader 失活清除临时 cue/激活，不改发现、标签、几何或原生导航。
- Flash 原生焦点进入查询输入时不再自取消，只在该 PDF pane 接管宿主键。失效输入/prompt/badge 不遗留所有权，旧输入/IME 回调不改新查询；匹配、标签、IME 编辑与 Select 端点不变。
- Reader 历史清理使用视图活跃时捕获的 PDF Window 身份；销毁 wrapper 不再中断 session 退休并让 Main 激活访问关闭 Reader，精确视图的待执行工作失效，不影响其他分屏。
- Selection Actions 的组合键保留原生行为，仅在所属 PDF pane 接管转发。关闭 dead Reader/分屏释放 palette/theme，不中断清理；Select marker 跳过销毁窗口，旧异步结果不重画或聚焦新 palette。
- Reader 退出按事件类型/回调身份注销原生监听，拒绝退休注册的排队回调。关闭的 indicator 与次 PDF dead-wrapper 不再阻止 Reader/Main 清理，避免 reload、替换、禁用/启用或 XPI 更新后残留旧输入/编辑器所有权。

## [0.1.0] - 2026-09-19 {#_0-1-0-2026-09-19}

### 新增 {#added-1}

- 为键盘 Reader 工作流提供当时的 Normal、Select、Insert 交互状态。
- Flash 可见 PDF 文本选择支持实时字面匹配、有界提示、范围微调、端点交换与直接选择动作。
- Flash 支持 Unicode/CJK；Flash、chooser/标签输入、Note 编辑的 IME 由浏览器管理，不通过 keydown 重建查询。
- 选择动作支持复制、搜索、彩色高亮、下划线、批注评论，以及通过公共 API 接入的可选 Translate for Zotero。
- 为外部工作流提供 `Zotero.Neo.reader.getSelection()` 与 `registerSelectionAction(...)` 小型公共入口。
- Vim 风格翻页、滚动、缩放、原生阅读历史、marks、批注遍历和横向平移。
- `f` 为可见内部、引文、外部 PDF 链接提供提示，内部跳转具有临时目的地 cue。
- 水平/垂直分屏与 `Ctrl+h/j/k/l` 方向焦点。
- 自定义 explorer 提供 PDF Outline 与持久化 marks 键盘导航；其后替换为上文的原生 Outline/Bookmarks 集成。
- 可配置 Space-leader Guide，由当前已解析 keymap 生成。
- Reader/Main/Note Normal 的 `:` Command Palette，包含无绑定但可执行动作。
- 共享模糊选择器支持全库、当前分类、Notes、标签页与动作专属标签候选，具有响应式预览和可选鼠标选择。
- 显式标签动作：`<Space>ta` 添加、`<Space>tr` 移除；Main 专属 `<Space>tf` 切换过滤、`<Space>tc` 清空过滤。
- Main Item Select 基于原生 `TreeSelection`，支持 `v`、带 count 的 `j/k`、`gg/G`、端点交换、完成保留和取消回聚焦项。
- Main/Reader/Note 分别解析标签目标，明确添加/移除、多目标覆盖、创建候选与虚拟分隔符路径细化；Zotero 仍存普通扁平标签。
- Note 通过规范化标题/正文搜索并由 chooser 打开；编辑使用共享 Normal/Insert 引擎，不使用 Picker 局部 CRUD 语法。
- Main 提供条目 Trash/恢复、PDF 打开、标签页切换/关闭、分类树导航，以及可用时 Better BibTeX citekey 复制。
- Neo 界面支持 Auto/Light/Dark，使用成对语义表面与文本色：浅色为浅底深字，深色为深底浅字。
- 快捷键编辑支持暂存 Apply、按模式动作过滤、重复阻止、前缀警告、一个动作多个绑定及持久解绑。
- Zotero 提供兼容 Reader 行为时，支持 Snapshot 和 EPUB 导航/搜索。

### 调整 {#changed-1}

- 0.1.0 Reader yank 默认避免前缀歧义：批注摘录保留 `y`，评论由 `yy` 移到 `Y`；删除失效 Select `yy` / `yankParagraph` 默认，不冻结无法兑现整段语义的动作。
- Picker 与 TagPath 的模糊匹配改用锁定的 `fuzzysort` 4.0.2 适配器，调用方仍只使用 `fuzzyMatchScore()`。
- 绑定 Scope 同时标明 Surface 与状态：`reader-normal`、`reader-select`、当时的 `reader-insert`、`main-normal`、`main-select`、`note-normal`、`note-insert`。开发覆盖迁移到规范 schema，保留 Note 全局自定义和上一预发布 schema 的显式解绑。
- Main Item Select 复用共享绑定/输入引擎和语义分发，只拥有原生 `TreeSelection` 操作和模式 UI。
- Note Normal/Insert 复用 sequence/count reducer、绑定、能力、Guide 和 Palette 来源；DOM 编辑仍由 `NoteEditor` 负责，无绑定 Insert 文本保持 Zotero/浏览器原生行为。
- Reader runtime 状态与持久绑定 Scope 分离，不复用混合 `Mode`。
- 稳定宿主接缝可用时，Reader/Main 导航使用原生选择、滚动、历史、分屏、Trash 等操作。
- Collections/Items 长按 `j/k` 的重复与 debounce 交给原生树选择，不由 Neo 节流。
- 每个语义标签批次只使用一个 DB 事务，只保存需要变化的条目。
- 标签写入与视图过滤是明确动作，不是标签操作控制台的模式：`ta/tr` 写条目，Main 专属 `tf/tc` 改视图。
- Picker/provider 不再维护创建/删除/yank/open 小语法，确认和宿主写入归发起的语义动作。
- Reader/Main/Note 的 Space 默认按语义组织：`ff/fc/fn` 查找、`,` 切换标签页、`q` 关闭当前标签页、`t*` 保留给标签。
- Main 持久集合使用 `s`：Normal 中切换/推进条目 Selection 与原生 ScopeSet，Visual 中提交 VisualTarget。
- PDF Select 管理 DOM range 和局部原生风格选择展示，不声称与 Reader 私有语义选择同步；原生语义选择集成另见 issue #20。
- Picker、Reader 侧栏、评论编辑、平滑滚动、Flash 等临时状态按窗口/视图明确持有和清理。
- 0.1.0 兼容约定只支持最新 Zotero 稳定版；manifest 面向 Zotero 10，不宣传未支持的旧主版本。

### 开发 {#development}

- 严格 TypeScript 经 esbuild 打包为确定性 JavaScript/XPI，不在运行时解析 npm/CDN/原生依赖。
- 已审计 `fuzzysort` 4.0.2 ESM 快照连同许可证/来源一起 vendored，并折入运行时 bundle。
- Vitest 覆盖输入匹配、Picker、Reader 状态、选择文本、宿主边界、偏好、标签目标批处理、虚拟路径与包行为。
- 当时的 GitHub Actions 验证 Ubuntu/Windows 原生构建入口、TypeScript/测试、确定性 XPI 与受保护发布元数据。
- 启动诊断有界并带版本重置，不随空闲 Reader 扫描持续增长。
- `docs/ARCHITECTURE.md` 维护架构所有权。0.1.0 前的 Reader 编排拆出私有按键 patch、PDF 视图生命周期、导航宿主和临时 Select DOM range；仅会以反向回调替换清晰局部所有权的进一步批注抽离未被采用。
- 默认 keymap 契约拒绝“一个完整默认命令同时是更长默认的严格前缀”，包含当时有效的 Main Select 后备映射。
