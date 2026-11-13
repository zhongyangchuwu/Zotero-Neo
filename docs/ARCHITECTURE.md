# 架构

Zotero Neo 在 Zotero 之上增加交互能力，不维护另一套文档、选择或数据模型。通常的调用路径为：

```text
上下文 -> 目标 / 目标集 -> 语义动作 -> Zotero 宿主操作
```

每一层只有一个负责方。只有多个具体工作流使用相同契约时，才提取共享抽象。

共享导航栈及其记录/恢复策略见[导航历史设计](NAVIGATION_HISTORY_DESIGN.md)。本文描述当前运行时所有权；[交互模型](INTERACTION_MODEL.md)定义 Main 交互语义，[命令参考](COMMAND_REFERENCE.md)维护准确的按键说明。

[模块拆分与基座能力设计](MODULE_DESIGN.md)记录内部模块及其组合约束：当前共有 21 个内置模块，其中 15 个核心分区固定启用；`reader-hints`、`extensions`、`references`、`translation`、`ai-qa` 和 `tab-enhancements` 是六个可选增强，前三项默认开启，后三项对新配置默认关闭。用户操作见[模块设置](SETTINGS_GUIDE.md#开关可选功能)和[Reader 指南](READER_GUIDE.md)，下文维护运行时所有权。

## 分层

### 1. 输入与交互作用域

`src/input/` 负责按键归一化、语义 token、序列/count 匹配、已解析绑定，以及 `src/input/engine.ts` 中的纯 reducer。`src/input/runtime.ts` 为每个输入处理方维护待完成序列、count 和定时器。`src/ui/key-guide-runtime.ts` 单独负责按键指引展示；局部控件使用 `src/input/local-binding-runtime.ts`。

宿主判定原生输入、可编辑输入和输入法组合状态，并负责焦点、动作执行与生命周期。`BindingContext` 表示精确的输入处理方/能力契约，不是 Surface mode；上下文不继承其他模式的绑定，也不使用全局后备绑定。Main 和 Reader 具有 Normal/Visual 交互，Note 具有 Normal/Insert。Main Visual 的 `main-select` 上下文只在临时范围存在时适用，不取决于 Persistent Selection。批注评论输入和引用增强的局部控件由各自功能持有，Reader controller 通过共享 `featureInputFocused` / `_textAnnotationFocused` seam 让 Zotero 原生处理在精确视图获得焦点时让出按键；这不是额外 Reader mode。输入法与文本输入见[输入说明](INPUT_METHODS.md)；完整上下文和按键清单由命令参考维护。

持久化绑定迁移位于 `src/core/preferences.ts`，不创建运行时别名或继承 keymap。

### 2. 语义动作与能力

`src/input/actions.ts` 是唯一的 `ActionId` 目录。功能能力模块定义可执行动作；controller 分发已解析的语义动作，不模拟键盘事件。Settings、Key Guide、快捷键提示和按键匹配都由同一动作目录、处理方能力与已解析绑定生成。

`src/modules/index.ts` 定义精确上下文/动作归属与依赖，`src/core/module-runtime.ts` 按已应用图和实际宿主实例过滤能力，再交给按键匹配、count/前缀、Guide 和 Palette。核心分区固定启用；只有 `reader-hints`、`extensions`、`references`、`ai-qa` 与 `tab-enhancements` 可按已应用请求关闭。`ai-qa` 依赖核心 `reader-selection`，`references` 无 AI 或选择模块依赖，`tab-enhancements` 依赖核心 `workspace`。不可用贡献的元数据及用户绑定保留；不能按全局 ActionId 删除其他上下文的同名贡献，例如 Library 的 Main Select Trash。独立 Reader 的标识符动作使用实际 Main opener，其余跨窗口委托继续使用各自真实接收方，不借用任意健康 Main。

条目目标由发起操作的 Surface 解析。`src/core/item-target.ts` 定义共享结果形状；`src/platform/zotero-items.ts` 负责 Zotero 查找、归一化与身份去重。`src/main/main-item-target.ts` 在 Main 中优先解析 Selection，再解析 CurrentTarget；`src/reader/item-target.ts` 解析当前 Reader 条目；`src/main/note-item-target.ts` 解析当前 Note。Reader 和 Note 不借用 Main Selection。

具体领域操作位于 `src/operations/`，接收显式条目或 ID。Surface 负责目标选择、基数、确认、导航与状态反馈。跨 Surface 协作使用命名能力或共享 Operation，不重新分发另一 Surface 的 `ActionId`。

### 3. 功能所有权

#### Main

`src/main/window-runtime.ts` 为一个物理 Zotero MainWindow 提供服务。`src/main/session.ts` 将宿主 runtime 与 Main、各功能状态组合；`src/main/active-surface.ts` 根据 Zotero 焦点、标签页和编辑器状态推导当前 Main、Reader 或 Note 交互。

Note 是由 MainWindow 承载的独立 Surface。`src/main/note-editor.ts` 通过 editor Window、Document 和 Note 条目 ID 识别附着身份，保留输入、IME、共享焦点及 Guide；任一身份被替换时，先退休旧输入，再清理监听器。`src/modules/notes/` 按窗口拥有 Note 候选、打开编排、可选 Vim 编辑模式、寄存器及 caret UI，不取得整个 Main session。`noteEditor.enabled` 仅控制 Vim 编辑，不控制 Note 查找；Note 内容仍以 Zotero 为准。

Toolkit 仅从实际 Main document 中已连接、可见且有布局的 Note iframe 发现编辑器。打开 Picker 后普通焦点转移不改绑到隐藏的 Library Note 编辑器；旧事件、计时器及 Palette 回调仍受精确身份保护。

`src/main/controller.ts` 协调 Main 输入、目标和模块装配；`src/main/navigation.ts` 保留共享状态反馈、面板焦点及标签页宿主委托。`src/modules/library/` 拥有树移动、Local Find、Quick/Advanced Search、条目候选、打开、标识符录入、citekey 和最近回收批次，不持有整个 Main session。Reader 的 citekey 贡献按 ReaderSession 登记，仍使用 Reader 目标，不要求借用 Main 窗口。

`src/modules/worksets/` 按窗口拥有 Persistent Selection、临时 Visual 范围及 Selection Panel，状态独立于原生行选择，不再预建在 Main session 中。`src/main/picker/` 负责共享候选交互，Library 显式提供条目来源；纯条目行展示由 Library 和 Collections 共用。确认及宿主写入由动作负责。共享写操作位于 `src/operations/`，Main 宿主能力位于 `src/toolkit/main/`。

设置中心、Picker 和引用详情使用 `src/ui/react/` 的静态 React 视图；`src/platform/native-ui.ts` 按确切 Window／Document 加载共享运行时、克隆展示模型并退休挂载。领域状态、键盘与组合输入、设置提交、Picker 确认以及引用来源／缓存仍由各自控制器负责。设置中心管理模态 Tab 边界，原生 disclosure 和普通控件均可进入键盘顺序；已保存的凭据不进入共享展示模型。

Neo 自有 React 界面的素材集中在 `src/ui/react/`：`components.tsx` 提供通用控件，`styles.ts` 定义共享基础样式，`surfaces/` 按面板分别保存布局、专属样式及展示组件，`shells/` 保存需同步创建的宿主外壳和 PDF 标记样式；主题变量由 `src/ui/theme.ts` 提供。按键指南以及 Main／Reader 状态提示使用 React 视图，计时和模式仍归各控制器。PDF 目标提示需要同步测量，Flash 输入需要立即取得焦点并维持 IME，二者仍由精确 PDF 文档中的宿主管理 DOM，坐标由交互代码计算。领域数据和命令模型仍归各业务模块，原生 Zotero 控件与宿主生命周期不并入素材库。

每个 MainWindow 仍只有一份导航历史和协调器。Library 通过具名端口请求现有操作；历史恢复直接取得原生 View 能力，不依赖 Library 的业务动作。Local Find 的查询和精确界面、最近回收批次归 Library 实例，旧恢复完成不能清空后来记录的回收批次。Local Find 的输入提示由静态打包的 React 呈现；搜索提交、IME、焦点和界面寿命仍由 Library 控制器负责。

`src/modules/workspace/` 按 MainWindow 拥有 Main/Reader/Note Normal 的标签页候选、确认、切换、循环和关闭，以及 Reader/Note 的 Show in Library。候选来源显式注入 Picker，不负责导航；Surface 传入明确条目目标。模块只持有本次 Picker 的释放句柄，旧确认与晚到状态不能操作替换界面；实际切换和定位沿用基座导航端口，不依赖 Library，不另建历史。原生标签页委托及历史恢复重扫仍在基座。

##### 标签页增强

`src/modules/tab-enhancements/` 按 MainWindow 拥有标签页增强界面、标题展示与窗口级交互，支持左／右垂直栏和上方横向模式；默认位置为左侧。上方标签栏由 Neo 绘制，Zotero 原生工具栏保留，原生标签操作按宿主能力逐项适配。位置只控制显示，不引入按文库分类自动分组，也不改变阅读分组模型。应用共享的分组管理器协调已登记的 Main 宿主，但不接管 Reader 生命周期。它依赖核心 `workspace`：跨窗口激活先转到拥有该原生标签页的窗口，再沿用 `workspace.activateTab`；标签页切换及导航仍复用基座唯一历史。

Zotero 原生标签页清单是已打开 Reader/Note 视图的唯一事实来源。Toolkit 将版本化 `viewID` 存入原生 `tab.data`，区分同一 PDF 的多个视图，并在原生会话恢复后关联仍打开的分组成员；`nativeID` 仅是当前会话的操作句柄。关闭视图会立即移除成员，空组保留；组关闭和排序只作用于发起窗口，跨窗口激活由所属宿主执行，不在当前窗口伪造其他窗口的原生标签页。

当前唯一分组状态保存在 profile-local 的 `tabEnhancements.groups.v2`；旧 `tabEnhancements.groups.v1` 原样保留为备份。分组独立于显示位置和标题偏好，停用功能或重置显示偏好不会清除分组。Main 创建／追加动作固定发起时的目标，明确选择 PDF 并确认后打开标签页，只将成功打开的视图分组；操作不修改 Zotero 标签、分类或元数据。

`src/toolkit/main/tab-enhancements/` 独占私有原生 Tab 接口、外层布局和原生工具栏的可逆租约。左／右模式管理外侧垂直栏；上方模式由 Neo 绘制横向标签栏，原生工具栏保留，逐项适配所需的原生标签操作。Neo 自有 UI 使用共享 React UI；Toolkit 隔离私有原生 DOM、标签栏接缝和布局恢复，不把宿主对象交给 React。上方模式以鼠标操作为主，保留原生键盘输入，不新增快捷键。模式切换或挂载失败必须可逆：失败时恢复原生标签栏和工具栏；不重挂原生内容 deck、Reader/PDF iframe 或 Note editor，也不重载 Reader、PDF 或 Note。


`src/core/module-host.ts` 为每个 MainWindow 或 ReaderSession 的模块提供独立子作用域、同步激活回滚和 `(BindingContext, ActionId)` 贡献所有权。调用返回有类型的业务入口，不新增命令 ID 或跨 Surface 分发器。宿主退出先退休全部贡献，再尝试释放所有资源；原始激活或清理失败仍可观测。

`BuiltinModuleRuntime` 对六个可选增强分别保存已应用值与偏好请求；核心分区固定启用。已有 `extensions.zotero-neo.modules.<core>.enabled=false` 值不会关闭核心功能。`src/platform/module-startup.ts` 在原生 Zotero 应用对象上仅保存请求的不可变布尔图 JSON，不保存窗口、模块或 SDK 对象；Neo 重载沿用本进程快照，只有真正重启 Zotero 进程后才应用新请求。旧快照缺少可选字段时，该进程按关闭处理。Settings 显示请求、已应用值、当前宿主状态与待重启状态；恢复默认恢复六项规范值，并显式写入 `translation=false`，避免迁移重新启用已关闭的请求。

`src/modules/tags/` 是首条完整接入路径：`index.ts` 组合模块与作用域，`actions.ts` 拥有标签候选/确认与过滤策略，`capabilities.ts` 向现有三个 Surface 能力目录提供动作集合。Main controller 只在各自 Surface 解析目标后调用模块入口，并注入 Picker、状态反馈和 Main 过滤端口。标签事务仍由 `src/operations/item-tags.ts` 执行，候选 provider 仍只处理数据和展示。

标签模块不持有 Main session、原生 pane 或 Reader 对象。Picker 端口返回仅能关闭本次调用的释放句柄；视图或窗口退休后不能确认旧选择、重画状态或关闭后来替换的界面。已接纳的保存继续按原生事务结果完成，不因模块退休而伪装成取消。

`src/modules/extensions/` 拥有 Zotero 扩展的 Plugin Manager，列表包括已安装扩展及固定官方 Translate 安装条目。`index.ts` 为每个 MainWindow 创建模块作用域、面板和状态；Main session 不再持有插件面板状态。Main/Reader/Note 的 `managePlugins` 进入实际所属窗口的同一面板，局部输入继续使用 `plugins-input` / `plugins-list` 和既有重绑定。

Plugin Manager 的列表和详情由静态打包的 React 视图呈现；搜索输入、IME、焦点与原生扩展操作仍由面板控制器负责。视图只接收展示模型和选择／链接命令，不持有原生 AddonManager 对象。

面板关闭先退休交互，再分别释放局部绑定、输入监听、主题与 DOM；某项释放失败仍尝试其余资源，并保留原始错误。异步原生操作完成后同时核对模块作用域与本次界面身份，不更新退休界面或恢复其焦点。安装取消遵守 AddonManager 状态，已完成安装不伪装成可撤销；原生接缝仍在 Toolkit，目录、确认及反馈归功能负责方。该模块不管理 Neo 内部模块，不提供通用商店或卸载。

`src/modules/translation/` 按 ReaderSession 拥有手动选择动作、自动译文保存和侧栏角色，不新增 Reader mode。Toolkit 将原生 popup 的 annotation 对象绑定到精确视图、Document 与加载 PDF；2.4.8 适配器读取当前 popup 对应的已完成任务和可编辑结果。上游可复用同一附件、同一原文的任务；Neo 保存当前显示内容，不声称请求最初来自当前分屏。保存 Operation 重新校验完整 PDF 来源后创建原生便签，服务与凭据仍由上游管理。

`src/modules/collections/` 拥有分类成员操作、查找、连续添加条目、分类结构操作、候选展示及每个窗口的重命名草稿。Main/Reader 传入各自的目标解析器和显示标签，确认时重验证来源、库与目标签名；模块不持有整个 Main session、共享 Picker 或 MainNavigation。Main 保留现有九个分类命令，Reader 保留 Add/Remove，Note 不新增命令。

组合根为分类工作流提供精确 Picker 代次、确认时的已提交查询和本次释放句柄。多步骤创建保留返回原查询与取消语义；原生命名对话框的嵌套事件循环返回后，先检查当前性，不能让退休工作流继续弹出确认框。作用域退出只释放自有 Picker，不关闭替换交互。现有分类 Operations 在事务内继续验证当前性，失效时按原有规则回滚未提交写入并恢复缓存；模块不改变 Toolkit 的提交回执或回滚屏障。

工作集模块提供受作用域约束的 Selection 读取/成员移除端口和 Selection/Visual 行投影。Main 保留 Cursor 初始化、原生多目标取消、共享行渲染及视图生命周期；没有工作集投影时，Cursor 仍独立渲染。行渲染登记由确切的 Main session 持有，先退休登记身份，再释放捕获的资源；旧窗口装卸或获取失败不能清理重入创建的新实例。Main 目标解析器消费明确的可选 Selection 来源，不读取整个 session；成功 Trash 只从发起时捕获的来源移除原目标。`src/core/item-ref.ts` 为实际共享此身份的 Toolkit、导航和工作集提供稳定条目引用。

Selection Panel 使用绑定确切 Window／Document 的静态 React 视图显示工作集；成员操作、按键、焦点与界面寿命仍归工作集控制器。面板通过具名端口请求现有导航协调器执行 Reveal，不拥有第二份历史。关闭先退休精确界面身份，再释放计时器、React 视图、主题和 DOM；旧确认、计时器及导航完成不能修改替换界面。主题和外观订阅返回时若模块已退休，立即释放新取得的句柄，清理失败仍尝试其余释放。

#### Reader

`src/reader/controller.ts` 按 Zotero `instanceID` 管理 Reader session。主、次 PDF 视图共享一个 Reader Surface，但输入、几何与导航始终保留精确视图身份。

`src/modules/reader-navigation/` 按 ReaderSession 拥有页面、滚动/平移、缩放、PDF 搜索、批注位置遍历、语义 Outline、按需 captions、marks 及原生侧栏增强。Normal 与四个侧栏上下文的真实动作均通过模块作用域登记；命名 marks 沿用特殊输入语法与持久化格式，不伪造 ActionId。异步 marks 保存保留实际结果，但只有发起交互仍有效时才显示状态；连续滚动跨重复输入保持有效，销毁视图时先退休 RAF 与完成回调，再释放原生资源。

书签和按需图表目录的 Neo 自有内容由 `src/ui/react/surfaces/reader-sidebar.tsx` 呈现；原生 Outline、侧栏布局与装饰仍由 Toolkit 管理。控制器保留按键、提取、目标和焦点策略，并在渲染器异步加载后重新核对所属文档及焦点请求。

Reader Base 先建立视图和外层输入监听，再在 Navigation 激活事务内加载 marks、启动原生侧栏；失败时退休该模块全部贡献，不关闭独立 Select、批注、hints 或 Workspace。Base 启动失败则释放未完成的 Reader session，原生对象在本次运行中不循环重试，新原生对象可重新附着。正常退出由显式清理收集器继续释放所有负责方，并向调用方保留首个清理失败。

章节查找、图表浏览和解析对照分别由 `src/modules/reader-chapters/`、`reader-figures/` 和 `document-comparison/` 拥有。图表浏览只在 Navigation 成功激活后组合，通过具名端口借用已有 caption 来源与定位，不新建目标引擎或导航历史。章节与图表模块各自持有缓存／服务失效订阅，对照模块管理自己的界面和迟到结果；原有的互斥打开策略仍由 Reader Surface 协调。

章节查找、对象摘录和章节笔记共用 `src/ui/search-dialog.ts` 管理查询、IME、焦点、预览取消与确认寿命；其列表和预览由静态 React 视图呈现，数据来源、匹配和写入仍由调用模块负责。视图绑定精确 Window／Document，旧结果不能接管替换的对话框。

图表选择器以静态 React 视图呈现筛选、列表和裁图预览；目标解析、筛选、IME、异步预览取消、精确 PDF 视图寿命及确认导航仍由 Reader 控制器负责。关闭或替换视图不会让旧预览和导航完成接管新界面。

解析对照的配置、结果和明确操作由静态 React 视图呈现；PDF 来源校验、服务请求、凭据及迟到结果仍由对照控制器管理，凭据不进入展示模型。

Reader Surface 保留输入/IME/count/前缀、模式、CurrentTarget、精确视图及共享历史策略，并直接持有 Toolkit 导航宿主。Workspace 的 Reader 实例通过同一宿主处理分屏创建/关闭与方向焦点，普通按键、延迟绑定和 Palette 使用相同实现；原始方向键只在实际成功时消费。Main/Note 通用面板焦点（含 Note Insert）、共享滚动与 `src/reader/native-input.ts` 仍属基座，不依赖 Reader 导航或 Workspace 的业务实现。评论编辑器由批注模块持有，引用上下文控件由 `references` 模块持有；Surface 将两者的精确输入焦点纳入现有原生键盘让出，不新增 Reader mode。`i` 保留评论偏好与 NativeInput 分支，Normal `zb` 按当前批注决定改色或页面底部回退。

`src/modules/reader-selection/` 按 ReaderSession 拥有 Select 范围/垂直 motions、Flash、选择文本复制/搜索和 Selection Actions。每次交互捕获确切 ReaderView、Window 与 Document；旧可用性回调、输入或异步结果不能作用于替换视图。Surface 在接纳新动作或原生选择前先同步旧视图退休，避免较晚扫描清理新取得的资源。范围退出释放 anchor/preferred-X 与样式租约；忙碌面板自己忽略的重复/IME 按键不使其结果失效。

选区动作面板使用静态 React 视图呈现候选和结果；选择来源、快捷键、异步动作及关闭策略继续由选择模块管理。

`registry.ts` 保存应用级、无 DOM 的外部动作定义；单个 Reader 模块退出不清空它。公共选择 API 门面和类型不变，选择模块退休后返回 `null`、不执行旧回调。批注相关选择动作由组合根具名注入；可选 PDFTranslate 接口保持原义，选择模块不写 Note 或批注。从选择发起的 Find 通过 Toolkit 捕获精确 pane 和本次原生 Find 状态，不覆盖新的查询或关闭重开后的界面。

`src/modules/reader-excerpts/` 独立拥有图表／公式候选、裁图预览、复制与显式保存，不属于 Select 的构造或退出流程。Reader Surface 固定 `SourceNoteTarget`，共享 `source-note` Operation 保留来源哈希、嵌图及保存语义。`src/modules/chapter-notes/` 独立拥有章节整理、筛选、预览和生成身份；Main 的 `notes` 只负责 Note 候选、打开及编辑。已接纳保存可以完成，过期界面不能恢复焦点或重画替换界面。

`src/modules/reader-annotations/` 按 ReaderSession 拥有创建、删除、改色、颜色过滤、批注文本/评论复制及评论保存。CurrentTarget 的原生优先与最后目标后备留在 Surface；模块自己的过滤后备通过具名端口供导航读取，不把批注写入下沉到选择模块。创建仍要求完整 PDF 几何，删除仍由所属窗口确认并调用明确 Operation。

评论编辑器在退休旧交互前捕获精确视图与 Document，再获取系统按键、输入/IME 监听、主题、popup guard、原生删除保护及定时器。关闭先清空所有权，再逐项释放；旧解析、输入和计时器不能作用于后继编辑器，部分获取失败仍排空已有句柄。最终草稿的保存接纳只要求原 ReaderView / Document 与模块仍存活，切换标签页或分屏不应丢弃 handoff 草稿；输入、计时器和 Escape 展示继续要求原视图激活。已接纳保存可以完成，但不恢复旧状态和焦点。

评论输入外观由绑定精确 PDF Window／Document 的静态 React 视图呈现；输入、IME、自动保存与最终草稿接纳继续由批注控制器拥有。

`src/modules/reader-hints/` 按 ReaderSession 拥有可见复制/跟随目标、临时标签、原生链接激活和目的地 cue。模块只接收精确视图、复制、反馈与导航端口；Surface 保留输入优先级、模式、共享滚动机制和历史策略。父作用域退休后，旧确认、异步导航完成和 RAF 不能写入或重画；清理仍释放各自的标签、cue 与计时器，并保留原始失败。`src/reader/hint-labels.ts` 继续作为 Flash 与 hints 共用的纯标签辅助。

#### 引用增强

`src/modules/references/` 按 ReaderSession 拥有引用增强与 `openReferences`；`src/references/controller.ts` 拥有原生预览中的逐文献操作、右键动作、搜索清单及单项任务浮层。Toolkit 提供原生预览挂载、同步菜单追加与工具栏入口，并返回参考文献、识别到的提及及来源守卫。悬停不激活窗格或查询服务；明确操作先捕获锚点，再激活并固定精确 PDF presentation/Window/Document，在异步操作前后验证 PDF 字节来源。引用跳转复用已有 NavigationPort 与共享历史，不建立第二套栈。用户交互见[Reader 指南](READER_GUIDE.md)，宿主细节见[开发指南](DEVELOPMENT.md#宿主能力-toolkit)。

原生引文预览内的 Neo 操作按钮使用 `src/ui/react/surfaces/references.tsx`，不替换原生预览、链接或右键菜单；关闭预览时先退休渲染器及其回调。

本地分析和文库查找不访问网络。元数据只在显式搜索未命中缓存或显式刷新时从 Semantic Scholar 或 arXiv 获取；展示来源原始字段、原始摘要和检索时间，未提供的摘要不生成。本模块不依赖或调用 AI 问答，不对论文或引用作 AI 生成、质量判断或分类。`src/operations/references.ts` 只在明确确认后添加条目；已存在条目不覆盖，精确 DOI/arXiv 身份用于去重。

论文元数据缓存由 `src/references/cache.ts` 在进程内跨 Reader／服务实例共享并串行管理，`src/platform/reference-cache.ts` 负责配置目录中的持久化。打开论文详情只读缓存；显式搜索按规范化查询键命中缓存（包括已过期结果）时不联网，未命中时才请求来源；刷新跳过缓存并请求网络。成功取得的原始元数据保存在当前 Zotero 配置目录的有界 JSON 中，标记来源、原始检索时间与过期状态；缓存不读取或保存 PDF 文本、笔记、坐标或凭据。刷新失败保留既有内容并报告错误。用户清除时只清除该缓存，代次保护使已清除的在途请求不能重新写回；不影响文库条目、已采纳记录或凭据。

#### 文档准备

`src/modules/document-preparation/` 的 controller 由 Addon 持有，复用 `src/document-analysis/` 的应用级队列与任务记录。MainWindow 和 ReaderSession 分别激活局部模块，传入发起 Surface 已解析的 PDF；Reader 不借用 Main Selection。局部作用域只借用本次 presentation，释放同时核对精确界面身份，旧作用域退出不能关闭同窗口的替换界面。

关闭面板或 Reader 只退休相应展示，不停止或销毁共享队列；停止仍需明确操作。队列、缓存和记录的身份及恢复语义不随模块拆分变化。

文档准备的队列、进度和凭据控件由静态 React 视图呈现；队列寿命和凭据操作仍归应用 controller，密码不进入展示模型。

#### AI 问答（实验）

`src/modules/ai-qa/` 为 Reader 提供可选入口和 `neo.ai-qa.explain` 选区动作，依赖固定启用的 `reader-selection`。启用并在 Zotero 完全重启后，Normal 中 `<Space>aa` 打开 AI 问答（实验）面板；`<Space>ai` 仍是 Add By Identifier。配置在该面板中，不在 Zotero 原生偏好 pane。

| 负责方 | 拥有 | 不拥有 |
| --- | --- | --- |
| `src/ai/` 与通用平台适配器 | 域无关的单次结构化生成契约、模型配置与凭据、安全请求及取消 | Reader 证据、任务、来源策略、Agent 工具调用或 MCP |
| `src/modules/ai-qa/` | Reader 入口、选区动作与会话注册 | 模型调用、界面挂载、成果写入实现 |
| `src/ai-qa/reader-application.ts` 与领域服务 | 解释／提问／导引、Reader 上下文与证据编排、任务取消、成果校验与修订、预览／跳转及明确采纳；`reader-contracts.ts` 定义命令、快照与通知 | 面板、主题、React 挂载、通用模型请求实现、密钥读回、私有 PDF/SDT DOM |
| `src/ai-qa/presentation.ts` | 原生面板与工具窗的精确 lease、异步视图挂载、主题、重开入口和窗口界面 runtime 的释放 | 证据准备、模型请求、成果仓库、Zotero Note 写入 |
| `src/ai-qa/ui/` | 静态打包的 React 视图与用户交互 | 原生 Reader 句柄、保存密钥的读回、领域数据写入 |
| `src/platform/ai-qa-ui.ts` | 按需注册 AI 问答工具窗的 chrome URI，并加载/释放界面 runtime | Reader 身份与每 Reader 窗口生命周期 |
| `src/platform/ai-qa-storage.ts` | 保存与读取附件成果及修订 | 用户确认之外的 Zotero Note 写入 |
| `src/toolkit/reader/ai-qa-panel.ts` | 原生 section、每 Reader 工具窗、精确 Reader lease；退休时先关闭窗口再释放共享宿主 | 提示词、模型请求、任务／成果策略 |

当前证据仅来自用户在 Reader 中选中的文字，或明确选择的有限章节；用户可明确允许附带相关图表／表格裁图。没有对批注、笔记或其他论文的检索，也没有整篇 PDF 自动上传。AI 问答的固定领域任务不构成通用 Agent 平台。

`AIService` 保存非秘密配置，并通过 `Services.logins` 按 endpoint 保存密钥；只向视图投影 `hasCredential`，不把密钥暴露到 view model、普通偏好、成果或日志。端点限 HTTPS 或 loopback HTTP；协议由 `api` 显式选择 Chat Completions 或 Responses，后者设置 `store: false`，不续接远端会话。请求禁止重定向，不自动重试或静默切换协议／服务。`sendImages` 默认关闭；只有显式启用才发送最多四张短暂的原始 PNG 图表裁剪。

`AIQAController` 在 `ai-qa` 模块启用时由 Addon 持有，组合唯一的通用 AI 服务、任务管理器和成果仓库，并将它们借给 Reader 应用层；应用层和呈现层不各自销毁这些共享资源。领域通知不包含界面文案，由 controller 在 view model 边界映射本地化消息。`AIQAPresentation` 按精确 lease 退休异步挂载，只有同一 Window 的最后一个挂载释放后才卸载该窗口的界面 runtime。

`src/platform/ai-runtime.ts` 按首次生成请求惰性建立无窗口 runtime；关闭的模块不注册入口／动作，不挂载面板或界面 runtime，也不读取凭据或发送请求。打开面板前先从发起的 Reader 捕获选区与视图，打开本身只读取缓存和已存成果；用户明确发起任务后才准备证据并请求模型。输入最多 40 条证据、32,000 字符；模型仅收到明确证据 ID，不返回可执行 HTML 或位置坐标；有效 ID 不证明语义正确。

主窗口标签页 Reader 使用原生 ItemPaneManager section；Toolkit 通过窄的私有 `item-details.tabID` seam 解析精确 Reader。独立 Reader 使用单独工具窗，绑定发起它的 Reader，不挤压 PDF 布局，并复用同一 controller、React 视图和成果仓库。关闭工具窗只释放界面，不取消已接纳任务；Reader 退出时关闭其工具窗并退休视图，但已接纳任务仍可完成。显式取消不保存部分结果。校验通过的成果按附件与 PDF 指纹在本机 JSON 持久保存，生成原稿与人工修改版本分开；这不是 Zotero 同步。来源跳转先预览再明确确认，只有用户明确采纳时才通过既有 Operation 写入带来源的 Zotero Note，不自动创建 PDF 批注。

静态宿主文档 `assets/package/content/ai-qa-window.xhtml` 打包为 `content/ai-qa-window.xhtml`，由 `src/platform/ai-qa-ui.ts` 按需注册到 `chrome://zotero-neo-ai-qa/content/ai-qa-window.xhtml`；窗口类型为 `zotero-neo:ai-qa`。AI 问答 UI bundle 为 `content/ai-qa-ui.js`。关闭所有归 Toolkit 所有的工具窗后才释放共享注册；关闭 Reader 会退休其窗口，但不会单独移除仍供其他 Reader 使用的共享注册。

更名不会更改既有持久化身份：配置 `ai.configuration`、端点凭据身份、附件成果文件 `.zotero-neo-reader-ai.json` 及 Note provenance／幂等标记继续沿用。关闭模块也不会清除配置、凭据、成果或人工修订。

宿主能力位于 `src/toolkit/reader/`；具体路径和私有接缝见[开发指南](DEVELOPMENT.md#宿主能力-toolkit)。Reader 生命周期工作仅对活跃 session 及精确 PDF 视图有效。同 Window 的 ReaderView 或 Document 替换也会退休旧注册；部分监听获取失败或获取期间重入退出时，先封住回调，再排空已取得的句柄。原生事件回调在注销前先按身份退休；只有权威 Reader 清单才能据此退休缺失 session。退出时防护已销毁的 Gecko wrapper，同时保持活对象上的失败可观测。

#### 共享导航历史

`src/navigation/history.ts` 维护每个 MainWindow 唯一的历史栈；`src/navigation/history-policy.ts` 定义记录资格与证据；`src/navigation/coordinator.ts` 负责接纳、当前性、完成与提交。`NavigationPort` 是记录入口，Main 与 Reader 宿主适配器提供原生操作。记录、恢复与传输细节由[导航历史设计](NAVIGATION_HISTORY_DESIGN.md)维护。

### 4. 宿主能力 Toolkit

Zotero 拥有领域数据和原生视图。Neo 只在宿主无法表达对应契约时维护交互状态：Main Persistent Selection 保存稳定条目身份而非渲染行号；Reader 键盘 Select 使用临时 DOM range，因为目前没有受支持的宿主 API 能更新 Zotero 私有 PDF 选择模型。

`src/toolkit/index.ts`、`src/toolkit/main/index.ts`、`src/toolkit/reader/index.ts` 是宿主能力入口。Main 包含 Note-pane 能力，没有独立 Note Toolkit。Toolkit 负责原生结构类型、宿主查找、回调 patch、DOM 集成与资源退休。跨 chrome/content compartment 的载荷通过 `Components.utils.cloneInto` 克隆到接收窗口，统一由 `src/platform/cross-compartment.ts` 处理。目标、模式、绑定、历史记录资格、确认与反馈由功能负责，不由 Toolkit 决定。公开条目 API 和 `src/platform/zotero-items.ts` 满足契约时可以直接使用。

文档化 API 无法提供相同行为时，保留必要的私有能力，并放在命名契约后；包装私有调用不代表依赖已变成公开 API。[开发指南](DEVELOPMENT.md#宿主能力-toolkit)列出当前负责方，以及单数/复数 Scope 的前置条件。

## 共享原语，而非通用框架

共享原语应已被具体功能使用：输入 reducer 与各处理方 runtime、语义 `ActionId`/能力投影、输入法组合防护、类型化条目目标及 Zotero 归一化辅助、`fuzzyMatchScore()` 适配器、主题管理器和具体 Operations。Picker、Plugin Manager、Reader overlay 与各 Surface 目标解析器保留自己的生命周期和领域策略；共享原语不意味着合并它们的契约。
