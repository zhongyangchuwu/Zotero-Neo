# 模块拆分与基座能力设计

本文说明 `main` 的当前模块边界。代码分为十一个内部功能区；`library`、`worksets`、`tags`、`collections`、`reader-navigation`、`reader-selection`、`reader-annotations`、`notes`、`workspace` 九个核心区固定启用，只有 `reader-hints`（链接与复制提示）与 `extensions`（扩展管理面板）是可选增强。运行时所有权见[架构](ARCHITECTURE.md)；可选项配置见[模块设置](SETTINGS_GUIDE.md#开关两项可选功能)。

## 范围与取舍

采用单 XPI、静态内置模块、统一版本和发布周期。模块表示内部功能所有权分区，不等同于可关闭插件；用户只能选择是否启用 `reader-hints` 与 `extensions` 两项增强。模块化用于隔离功能所有权与生命周期，不建设另一个插件平台。

当前实现不包含 AI 模块、Actions & Tags 运行时依赖或脚本执行机制。内部职责划分不改变已声明的按键、数据格式和 Zotero 兼容范围。

基座接口服务实际功能调用，不建立没有消费者的空框架。内部模块数量不决定可选项范围。

需要区分三种边界：

- **Surface** 决定输入和目标来自哪里：Main、Reader、Note。一个模块可以服务多个 Surface。
- **模块** 拥有完整的用户功能及其业务状态，而不是一个快捷键、一个面板或一个源码文件。
- **基座** 提供已有功能共同需要的机制与宿主能力，不接管各模块的目标选择、确认、写入策略和反馈。

## 当前已落地的接口

- `src/core/module-host.ts`：`ModuleHost.activate()` 同步组合真实模块，失败时释放部分资源并保留原始错误；`bind()` 为既有上下文/动作登记唯一贡献并返回类型化调用入口；`dispose()` 先退休所有回调，再完成各模块释放。
- `ModuleScope` 只表达模块 ID、当前性与自有 cleanup 注册。复用现有 `CleanupScope` / `CleanupFailure`，释放句柄只执行一次，失败记录到共享 logger。宿主当前性由实际 MainWindow 或 ReaderSession 生命周期提供，不新增全局 ActiveSurface。
- `src/modules/tags/`：在每个 MainWindow 中接入 Main/Reader/Note 的 Add/Remove Tag，以及 Main 的 Toggle/Clear Tag Filter。标签模块只取得明确目标与具名端口，不直接持有整个 Main session。
- Main controller 的 Picker 端口返回精确调用代次的释放句柄；模块在确认前检查作用域，已接纳保存完成后只在原作用域仍有效时显示反馈。旧输入不能触发新窗口或新模块的写入。
- `src/modules/extensions/`：第二条真实接入路径，拥有按窗口隔离的 Plugin Manager 状态与 UI 生命周期。复用现有基座和局部输入机制，不扩张 `ModuleHost` 接口；原生扩展适配仍由 Toolkit 提供。资源获取失败会释放部分界面，模块退休后旧 DOM 与异步完成不能重画或关闭替换界面。
- `src/modules/collections/`：按窗口拥有分类工作流、候选来源与重命名草稿，保留 Main/Reader 的原有贡献。多步骤 Picker 和原生对话框使用精确交互当前性；复用现有 Operations 的事务重验证、回滚和真实提交回执，不把分类写入改为通用“已接纳就不可取消”。
- `src/modules/reader-hints/`：按 ReaderSession 拥有 copy/link hints、候选与临时 UI，登记原有两个 Reader Normal 动作。精确视图路由、输入与模式策略仍由 Reader Surface 提供；异步导航意图同时检查模块作用域，不创建第二份历史。共享标签辅助保留给 Flash，读取原生批注不依赖 Neo 批注功能。
- `src/modules/worksets/`：按 MainWindow 拥有 Persistent Selection、Visual 和 Selection Panel，登记原有 Normal/Select 贡献。Main 保留 Cursor、原生多目标取消和共享行渲染；目标解析与成功操作后的成员移除只消费明确 Selection 端口，Reveal 沿用原导航协调器。模块退休后旧端口不读取存量 Selection，外观/主题的晚到句柄立即释放。
- `src/modules/library/`：按 MainWindow 拥有树导航、Local Find、搜索入口、条目候选、打开、标识符录入及最近回收批次；Reader citekey 贡献按 ReaderSession 登记。共享焦点、原生 View 端口、Picker 和唯一历史留在基座，Library 不成为工作集 Reveal、标签过滤或 Workspace 的硬依赖。
- `src/modules/notes/`：按 MainWindow 拥有 Note 候选、打开编排、可选 Vim 编辑模式/寄存器及 caret UI。Surface 保留精确编辑器身份、输入 runtime、原生/IME 仲裁及共享焦点；Palette 和计时器绑定实际编辑器身份。Vim 关闭不影响 Note 查找，候选 provider 不负责导航或写入。
- `src/modules/reader-navigation/`：按 ReaderSession 拥有导航动作、平滑滚动、marks、按需结构分析及原生侧栏增强；Normal 和四个侧栏上下文登记真实贡献。Surface 继续拥有精确视图、输入与唯一历史策略；分屏/焦点直接使用共享 Toolkit。已接纳 marks 保存继续完成，过期交互不再覆盖新状态；退出排空旧 RAF 与完成回调，不阻塞新视图。
- `src/modules/reader-selection/`：按 ReaderSession 拥有 Select/DOM 范围与 motions、Flash、复制/搜索和选择动作面板；外部注册定义保持应用级寿命。交互绑定原 ReaderView/Document，作用域与原生 Find 状态共同阻止旧输入或延迟查询覆盖后继界面。Surface 保留模式、输入、精确视图、共享滚动和历史；Note/批注写入仍由具名贡献负责。
- `src/modules/reader-annotations/`：按 ReaderSession 拥有批注创建、删除、改色、过滤、复制及精确视图的评论编辑器，并向 Select 注入下划线和 Add note。Surface 保留 CurrentTarget、NativeInput 与 `i` / `zb` 的混合仲裁；已接纳保存继续完成，旧交互不恢复状态、选择或焦点。
- `src/modules/workspace/`：MainWindow 拥有三个 Surface 的标签页候选、切换、循环、关闭及 Reader/Note 的 Show in Library；ReaderSession 拥有分屏切换与方向焦点。共享历史、原生标签页重扫、精确视图发现、NativeInput 及 Main/Note 通用面板焦点仍在基座；方向焦点实际成功才消费按键。

`src/modules/index.ts` 提供静态描述与依赖校验，`src/core/module-runtime.ts` 组合实际宿主实例、失败状态和结构能力过滤。十一项均为内部模块分区，其中九个核心区固定启用，旧核心偏好 `extensions.zotero-neo.modules.<core>.enabled=false` 不再关闭核心功能。只有 `reader-hints` 与 `extensions` 的模块偏好控制可选增强；保存请求后需真正重启 Zotero 才应用，Neo 重载沿用本进程已应用快照。现有绑定、行为偏好与公共插件接口保持原义。

## Actions & Tags 提供了什么

研究固定到 [Actions & Tags 提交 `8d87353`](https://github.com/windingwind/zotero-actions-tags/tree/8d8735331b994f629bd85977f19d2cdac94649c0)。其 README 的 Zotero 7 徽章与当前 [manifest 的 10.x 声明](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/addon/manifest.json#L11-L18) 不一致；下述结论依据实现，不把版本声明当作运行时验证。

| 接口或机制 | 实际来源与组合方式 | Neo 的取舍 |
| --- | --- | --- |
| `actionManager` | AT 自己提供 `dispatchActionByEvent`、`dispatchActionByKey`、`dispatchActionByShortcut`、`getActions`、`updateAction`、`deleteAction`，不是 Zotero API。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/api.ts#L1-L25) | 保留 Neo 已有的 `ActionId`、能力目录和绑定系统，不增加第二套动作或快捷键注册表。 |
| 菜单与 Reader 入口 | 使用 Zotero `MenuManager.registerMenu`、Reader 的 `renderToolbar` / `createAnnotationContextMenu` 事件，再交给 AT 分发。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/modules/menu.ts) | 将宿主入口与业务动作分开；有实际需求时接原生菜单，不因接口存在而额外添加菜单。 |
| 通知与业务事件 | 订阅 `Notifier` 的 `item`、`file`、`tab`，派生 `createAnnotation`、`appendNote`、`changeAnnotationColor`、`closeTab` 等 AT 事件。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/modules/notify.ts#L5-L135) | 基座只适配原生订阅；业务含义由功能模块解释。不将这些派生名称宣称为 Zotero 原生事件，也不预建全局业务事件总线。 |
| 显式动作参数 | 入口解析条目或分类，把 `item`、`items`、`collection` 等注入动作；AT 自身仍有全局活动 pane 与私有 Reader 查找。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/utils/items.ts) | 借鉴显式目标传递，但沿用 Neo 的 Surface 专属解析器，不能用 Main 当前选择代替 Reader / Note 目标。 |
| 标签与事务 | 通过原生 `hasTag`、`addTag`、`removeTag`、`DB.executeTransaction` 和 `item.save()` 修改数据。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/utils/actions.ts#L220-L350) | 复用 Zotero 数据模型；Neo 的具体 Operations 接收显式目标，不另建标签数据库或通用 ORM。 |
| 工具与脚本环境 | `ClipboardHelper`、`ExtraFieldTool`、键盘/UI 工具来自 `zotero-plugin-toolkit`；脚本由 `AsyncFunction` 执行，`require` 指向 toolkit 全局查找，并非 Node 包加载。[API](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/api.ts#L1-L25)、[执行实现](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/utils/actions.ts#L220-L350) | 这些不是 Zotero 官方底层接口。Neo 不引入该 toolkit、任意全局服务查找或特权脚本引擎。 |
| 生命周期 | 在启动、窗口装卸时注册功能，并借助 toolkit 清理；部分清理依赖宿主或后续回调。[源码](https://github.com/windingwind/zotero-actions-tags/blob/8d8735331b994f629bd85977f19d2cdac94649c0/src/hooks.ts#L15-L132) | 每个内部模块必须拥有自己的释放句柄；不能用整个插件的 `unregisterAll()` 代替模块清理，也不延迟到下一次通知才注销。 |

AT 的菜单/快捷键分发会先对整批目标执行一次，再逐项执行。Neo 不采用这种调用约定：一次用户确认对应一次明确的 TargetSet 调用，批处理由具体 Operation 决定，避免重复写入。

## 模块目录与所有权

当前包含以下 11 个内置模块。它们是内部所有权边界，不等于 11 个可选开关：`library`、`worksets`、`tags`、`collections`、`reader-navigation`、`reader-selection`、`reader-annotations`、`notes`、`workspace` 是固定启用的核心模块；只有 `reader-hints`（链接与复制提示）与 `extensions`（扩展管理面板）可由用户关闭。表中的路径是实际实现来源；每个模块引用现有命令标识，不重新命名动作。

| 模块 ID | 用户功能与业务状态 | 当前实现来源 | 实例范围及依赖 |
| --- | --- | --- | --- |
| `library` | Main 树导航、可见行查找、Quick/Advanced Search、条目选择器、打开条目、原生标识符录入、citekey、移入回收站及最近一批恢复。最近回收批次归本模块。 | `src/modules/library/`；`src/operations/trash-items.ts`、`citekeys.ts` | 已按 MainWindow 接入；ReaderSession 另持有独立 citekey 贡献，Reader/Note 通过具名能力调用所属 Main 的交互。Better BibTeX 只作为现有可选 citekey 适配。无其他模块的硬依赖。 |
| `worksets` | Main Persistent Selection、Visual 行范围、Selection Panel、选择增删清空及范围投影。它是核心模块，Main Visual 由此分区提供。 | `src/modules/worksets/` | 已按 MainWindow 接入，维持会话内状态。提供受作用域约束的 Selection 读取和成功操作后的成员移除能力；不依赖 `library` 的动作处理器，Cursor 与共享渲染仍由 Main 持有。 |
| `tags` | 标签选择、添加/移除、标签命名空间展示、Main 标签过滤。 | `src/modules/tags/`、`src/main/picker/providers/tags.ts`、`src/operations/item-tags.ts` | 已按 MainWindow 接入；处理三个 Surface 传入的目标。无 `worksets` 硬依赖。标签过滤归本模块，不与 `library` 重复注册。 |
| `collections` | 分类选择、成员添加/移除/移动、分类创建/重命名/删除、连续添加条目等现有工作流。 | `src/modules/collections/`、`src/operations/item-collections.ts`、`collections.ts` | 已按 MainWindow 接入，现有 Main/Reader 入口保留，不新增 Note 命令。无 `worksets` 硬依赖；目标由发起 Surface 明确提供。 |
| `reader-navigation` | 页面、滚动、缩放、平移、PDF 搜索、批注位置遍历、Outline、标题/图表导航、原生侧栏增强和命名 marks。marks 数据及持久化策略归本模块。 | `src/modules/reader-navigation/` | 已按 ReaderSession 接入，调用与异步结果绑定精确 ReaderView。结构分析仍按需进行，不在启动时分析全部 PDF；输入、CurrentTarget 与共享历史留在 Surface/基座，分屏与方向焦点归 Workspace。 |
| `reader-selection` | Reader Select、DOM 范围与 motions、Flash、复制/搜索所选文本、Selection Actions 展示及现有公共选择接口的领域实现。 | `src/modules/reader-selection/` | 已按 ReaderSession 接入；范围和界面绑定精确 ReaderView/Document，外部定义由应用级注册表保留。可选 PDFTranslate 对接不变，复制/搜索不依赖导航或批注模块。 |
| `reader-annotations` | 原生批注创建、删除、改色、颜色过滤、选中批注评论编辑；向 Select 提供高亮、下划线、Add note 等动作。 | `src/modules/reader-annotations/`、`src/operations/delete-annotation.ts` | 已按 ReaderSession 接入，评论交互绑定精确 ReaderView / Document；Select 贡献具名注入，原生批注操作本身不依赖选择模块。CurrentTarget 与 NativeInput 始终由 Surface 提供。 |
| `reader-hints` | 可选增强“链接与复制提示”：批注 Excerpt/Comment、DOI/arXiv/URL 等可见目标的复制，以及 PDF 链接/标识符跟随。 | `src/modules/reader-hints/` | 已按 ReaderSession 接入，保留精确 ReaderView 与单次提示交互。不依赖 `reader-annotations`：仍可读取 Zotero 已有批注。 |
| `notes` | Note 选择器、Note 上下文打开/定位，以及现有可选 Vim Note 编辑。编辑模式和寄存器归本模块。 | `src/modules/notes/`；Surface 输入与身份保留在 `src/main/note-editor.ts`、`note-runtime.ts` | 已按 MainWindow 接入，附着到精确 NoteEditor 身份；`noteEditor.enabled` 只控制 Vim 编辑，不控制 Note 查找。 |
| `workspace` | 标签页查找/切换/关闭、Reader 分屏创建与关闭、分屏焦点切换、Show in Library 等跨 Surface 定位。 | `src/modules/workspace/` | 已按 MainWindow / ReaderSession 接入，使用基座导航端口与唯一 Back/Forward 历史；不依赖 Library 或 Reader 导航模块。Main/Note 通用面板焦点含 Note Insert 仍由基座负责。 |
| `extensions` | 可选增强“扩展管理面板”：已安装 Zotero 扩展的 Plugin Manager，包括筛选、详情、刷新、允许的启停、设置及链接。 | `src/modules/extensions/`；`src/toolkit/main/plugins.ts` | 已按 MainWindow 接入，Main/Reader/Note 进入实际所属窗口的独立面板。不负责 Neo 内部模块管理，也不新增安装、更新或卸载功能。 |

### 跨模块协作规则

模块之间只注入确有调用者的命名能力，不通过字符串查找任意服务，也不调用另一个 Surface 的 `ActionId` 来绕过其上下文。

- Main EffectiveSelection 仍由 Main Surface 解析器决定：核心 `worksets` 始终负责 Main Visual 与 Persistent Selection；当前目标规则仍由 Surface 决定。`tags`、`collections`、`library` 的目标解析不依赖工作集动作处理器。Reader/Note 始终使用自己的目标解析器。
- `reader-annotations` 与 `reader-selection` 都是核心模块，用户不能关闭其中之一来停用另一项；两者的具名贡献和失败隔离仍保持独立，批注或选择实例故障不会改变其他能力的配置。
- 一个动作的处理器按 **`(BindingContext, ActionId)`** 唯一归属。相同 `ActionId` 在 Main 与 Reader 可以有不同实现；不能按全局 ActionId 强行合并，也不能由两个模块抢同一上下文的处理器。
- Note/Reader 的某些命令需要关联 MainWindow 的 Picker。无法确定实际所属窗口时返回不可用，不借用任意其他 MainWindow 的 Selection、历史或面板。

## 基座提供的能力

基座是职责边界，不是把所有共享代码搬进 `src/core/`。宿主能力保留在 Toolkit，领域写操作保留在 Operations。

| 能力 | 契约与所有权 | 不包含什么 |
| --- | --- | --- |
| 模块组合与生命周期 | 静态清单描述 ID、作用域、硬依赖和贡献；启动时验证依赖环及重复动作归属。组合根注入具名能力，创建各级子 scope，记录启用结果与失败原因。复用现有 `CleanupScope` 等机制。 | 动态包加载、版本求解、远程代码、模块市场、任意 `require(serviceName)`。 |
| 输入与焦点仲裁 | 复用 `src/input/` 的归一化、count/sequence、精确 BindingContext 与本地绑定 runtime。Surface 输入宿主统一决定 IME、原生输入、Note Normal、局部交互的所有权；模块贡献动作而非各自监听全局快捷键。 | 用统一的“所有 editable 一律透传”破坏 Note Normal，或把评论编辑/原生输入新增为 Reader mode。 |
| 命令、绑定与可用性 | `src/input/actions.ts` 与现有默认绑定保持唯一。核心贡献固定参与结构能力过滤；只有可选增强可以按已应用请求关闭，再按上下文过滤后提供给匹配器、Prefix Guide、Palette 和提示。 | 新的动作 ID 体系、跨上下文继承、无实现的可执行菜单项、关闭增强后仍吞键。 |
| 上下文与目标 | Main/Reader/Note 解析器产生显式目标；保留 `ItemTargetSet` 及原生 `Zotero.Item`，携带来源和当前性证据。跨异步边界的交互快照使用稳定身份，写入前重新验证。 | 全局可变 ActiveSurface、全局 Selection、把原生条目再包装成另一套数据模型。 |
| 宿主能力与订阅 | Toolkit 提供具名的 Main、Note、Reader 能力，管理私有接缝、原生订阅、窗口/视图发现及释放。共享桥接由一个所有者按实际消费者安装。 | 每个模块单独 patch 同一个 PdfView，或把 `_tabs`、原生 tree、PDF/editor 私有对象交给业务代码。 |
| Picker 与共享 UI 原语 | 共享现有 Picker 的搜索、排序、渲染、预览、IME、焦点、取消及 stale-work 隔离；模块注入候选和确认语义。主题、局部绑定和必要的纯展示辅助按现有模式复用。 | 把 Selection Panel、Plugin Manager、Reader overlay 合并为一个通用面板框架；给候选 provider 增加领域写入。 |
| 导航与历史 | 保留每个 MainWindow 唯一的历史栈、协调器和 `NavigationPort`。模块请求具体导航并提供完成证据，录制/恢复策略仍由现有导航所有者维护。 | 每个模块各存一份 Back/Forward，或把 marks 数据并入全局导航历史。 |
| 配置与管理入口 | 同一偏好存储、迁移、Settings、i18n、主题和 logger。Settings 只为 `reader-hints` 与 `extensions` 提供可选开关；核心分区固定启用。 | 第二套设置应用、把行为/存储偏好误当模块开关、把内部模块放进 Plugin Manager，或给共享 Picker 增加开关。 |
| 明确的领域写操作 | `src/operations/` 中的具体操作消费显式条目或 ID；动作所有者负责目标、基数、确认、反馈。公共原生模型/API 可以直接使用。 | 自动扫描全库、通用 CRUD/ORM、统一“尽力成功”的错误吞噬，或用 `saveTx()` 嵌套现有事务。 |
| 现有公共入口 | 保留 `Zotero.Neo.openSettings` 和 Reader selection API。Selection API 门面稳定，注册定义由领域注册表保留并返回原有 disposer；当前选择无效或实例不可用时 `getSelection()` 返回 `null`，不执行其回调。 | 新的通用第三方模块 SDK；不能因内部目录迁移删除现有选择动作扩展接口。 |

基座允许模块使用公开 `Window` / `Document` 创建 Neo 自己的 DOM，以及公开 Zotero 条目 API。只有私有宿主结构和跨 compartment 操作必须经命名适配器，不要求把每个 `getField()` 包一层。

### 内部模块接入接口

这里的“插件接入”首先指单 XPI 内的功能模块接入，不要求单独安装。它与其他 Zotero 插件使用的公共 API 分开设计；二者不能共享一个能访问所有内部服务的总对象。

下表记录各现有类型、静态描述、具名端口和模块作用域共同实现的约束，不是一个统一的公共 SDK 导出。只有真实调用需要新契约时才增加类型。

| 接口组成 | 必须表达的内容 | 约束 |
| --- | --- | --- |
| 静态描述 | `id`、本地化名称、支持的 scope、硬依赖 `requires`、可选组合关系、贡献清单 | 不包含窗口实例，不执行查询或构造功能。依赖只引用静态内置模块，不增加版本范围或动态加载地址。 |
| 作用域入口 | 对该模块实际支持的 scope 提供同步激活回调，接收该次附着上下文与具名依赖 | 不要求所有模块实现所有 scope；不提供默认空实现。窗口/视图不存在时不伪造实例。 |
| 附着上下文 | 精确 scope 身份、`isCurrent()`、自己的 cleanup 注册入口，以及必要的偏好/logger | 模块只取得自己的子 scope，不能退休父 scope 或清理其他模块。异步任务在更新 UI 或接纳写入前检查当前性。 |
| 动作贡献 | 现有 `BindingContext`、`ActionId`、可用性判定、执行函数 | 每个精确上下文/动作对只有一个处理器；不允许任意字符串命令或第二套 keymap。 |
| UI 贡献 | 实际入口、所属 scope、动作引用或该领域已有的候选/选择动作契约 | 使用现有 Picker、Selection Actions 或原生菜单接入方式，不设计能承载所有界面的通用组件协议。 |
| 提供能力 | 由调用双方定义的具体端口及返回结果 | 只向组合根声明依赖，组合根通过普通 TypeScript 参数注入；模块不能运行时查找任意其他模块实例。 |
| 释放句柄 | 获取资源后立即登记的清理函数 | 原生注册返回的句柄应可重复释放且不误删后来的注册；基座负责退休顺序，模块负责释放自己获取的资源。 |

基座等待原生宿主就绪后才调用激活入口。激活本身同步完成资源登记；按需查询、预览和业务操作仍可异步执行，归对应交互 scope 管理。不引入异步模块激活或等待任意 Promise 的退出协议，避免把宿主装卸和数据加载混为一个阶段。

依赖分两次验证：启动时验证静态图、依赖环与贡献冲突；附着时验证当前宿主中的依赖实例。一个 MainWindow 的模块能力失败，只影响该窗口的相应实例，不会将另一个健康窗口的模块全局标为失败。模块不得因为自己需要依赖，就修改用户的启用配置。

### 基座调用契约

基座机制沿用当前负责方，不通过一个庞大的 `context.services` 暴露全部能力。

| 调用边界 | 输入与输出 | 谁保留决定权 |
| --- | --- | --- |
| Surface → 动作 | 现有绑定上下文、ActionId、归一化 count，以及发起窗口/session/view 身份 | 输入宿主先判定输入所有权；动作不能自行补读另一个 Surface 的上下文。 |
| Surface → 目标解析 | 复用 `ItemTargetSet`，包含来源、明确条目与缺失情况 | Main/Reader/Note 解析器保留目标优先级；动作保留是否允许多目标、隐藏目标和缺失目标的策略。 |
| 动作 → Picker | 候选来源、展示所需数据、单次确认/取消处理及当前性检查 | Picker 负责候选交互；动作在确认接纳时冻结身份，再决定导航或写入。 |
| 模块 → Toolkit | 精确宿主作用域、原生操作参数；返回事实、结果或自有释放句柄 | Toolkit 只适配宿主，不决定操作哪个条目、是否确认或怎样记录历史。 |
| 模块 → 导航 | 现有 `NavigationPort` 请求与完成证据 | 导航协调器维护唯一历史和录制/恢复策略；模块不能自行追加另一个历史栈。 |
| 动作 → Operation | 明确条目/ID、已确认参数及该操作需要的验证条件；返回该领域的真实结果 | 具体 Operation 保留事务与恢复语义；动作决定反馈。领域操作返回真实结果，不归一成通用成功布尔值。 |

可用性分为两层，避免为了模块化改变当前输入行为：

- **结构可用性**：已应用启用图、作用域实例、上下文及必需宿主能力。结构不可用的贡献在按键匹配、count/前缀等待和 Guide 之前移除，元数据和用户绑定仍保留。
- **调用可用性**：本次是否有目标、是否可写、身份是否仍有效。执行时检查，按现有语义反馈；不能把这些条件一概变成新的全局吞键/透传规则。Palette 可以说明当前不可执行的原因，但不能以一次 UI 检查代替写入前重验证。

现有 `ReaderMainOperations` 是整理具名端口的起点，不整体导出给所有模块，也不一次性改成通用 `dispatch()`。先按实际调用关系确定哪些方法属于基座、哪些属于业务能力，再随对应功能迁移缩小依赖。

### 对其他 Zotero 插件的公共接口

内部模块接口可以随单 XPI 的一次干净迁移同步更新；公共插件接口不能因内部重组被移除或改签名。当前公开入口来自 `src/addon.ts` 的 `ZoteroNeoPublicApi` 和 `src/core/contracts.ts` 的 `ReaderSelectionApi`。

| 现有入口 | 保留的契约 | 生命周期与能力边界 |
| --- | --- | --- |
| `Zotero.Neo.openSettings(owner?: Window \| null): boolean` | 打开现有 Settings，返回原有成功结果 | 与可选模块开关无关；不把进入设置的能力放进可停用模块。 |
| `Zotero.Neo.reader.getSelection(): ReaderSelectionContext \| null` | 返回无 DOM 的选择快照；无可用选择时为 `null` | 模块未运行或视图不再适用时不能返回旧选择；外部调用方不能由快照取得 PDF 私有对象。 |
| `Zotero.Neo.reader.registerSelectionAction(definition): () => void` | 保留 `id`、`label`、可选 `isAvailable(context)` 与 `run(context)`，以及原有返回值类型 | 注册属于当前 Neo 实例；外部插件持有 disposer，并在自己卸载时释放。停用选择功能不执行已注册回调，但不把静态注册误当活跃视图资源。 |

`ReaderSelectionContext` 继续只有 `text`、`itemID`、`pageLabel`、`position`；选择动作继续使用现有 `ReaderSelectionActionOutcome`。不加入 Main Selection、私有 editor/PDF 对象或能访问任意宿主服务的 `require`。外部动作 ID 不需要迁移成内部 `ActionId`，已有领域注册表与内部命令目录是两个不同用途的接口。

现有注册约束保留：空 ID/label 或无效 `run` 被拒绝；重复 ID 不覆盖现有动作；旧 disposer 不能移除后来同 ID 的另一条注册。可用性判定失败只隔离该条动作，不破坏其他选择动作。内部重组不得为所有调用方新增必填 pluginID、版本握手或其他参数。

外部插件应在 Neo 存在时获取当前公共入口，不缓存跨 Neo 重启的旧对象；Neo 退出时清理该实例的注册。接口只提供受约束的数据与调用约定，不是安全沙箱，也不授予外部插件内部模块的所有权。当前没有通用第三方模块加载 SDK，内部组合根不是公共插件接口。

### 与 Zotero 接口的结合

| 接口层次 | Neo 如何使用 | 风险与释放要求 |
| --- | --- | --- |
| Bootstrap 生命周期、MainWindow 装卸 | 驱动 app/window 根 scope，等待宿主就绪后组合功能。 | 关闭窗口时释放引用、定时器、监听器及 UI；不依赖进程退出回收。 |
| `MenuManager.registerMenu` / `unregisterMenu` | 有业务入口需求时，由 Toolkit 统一登记并把具名上下文传给动作。 | 保存返回 ID，检查注册失败。原生菜单上下文包含 getter，不能整体展开；按入口读取必要字段，单数 scope 不满足时用对应复数能力。 |
| `Reader.registerEventListener` / `unregisterEventListener` | 按实际需要接 Reader toolbar、选择弹窗或上下文菜单事件。 | 保存同一个回调身份并主动注销。pluginID 的宿主自动清理只覆盖整个扩展，不等于内部模块释放。 |
| `Notifier.registerObserver` / `unregisterObserver` | 订阅所需原生对象类型，将通知交给当前模块的语义解释器。 | 保存 observer ID；模块退出时立即注销，已排队回调先检查 scope 当前性。Notifier 不保证某个 AT 派生业务事件存在。 |
| `Items`、条目/分类 API、`Search`、事务 | 使用原生模型和现有 Operations；事务内部用原生 `save()`，事务外按操作需求使用 `saveTx()`。 | 公共能力也可能文档不完整，按支持版本验证。源/目标仍存在不等于可见、可写或仍属于原父项。 |
| 偏好与 Gecko 边界 | 保留 Neo 现有 `Services.prefs` 存储；跨 chrome/content 的值经 `src/platform/cross-compartment.ts` 克隆。 | 观察者归 scope；不把宿主窗口对象作为长期、跨 Surface 的数据快照。 |
| 私有 Main tree、PDF、Note editor 与事务观测 | 继续放在 `src/toolkit/main/`、`src/toolkit/reader/` 的明确能力下，保留必需行为。 | 包装不代表 API 已公开；必须保留前置条件、支持版本验证、精确身份和可逆清理，不能照搬 AT 的私有字段访问。 |

官方依据：[客户端 JavaScript API](https://www.zotero.org/support/dev/client_coding/javascript_api)、[Bootstrap 与 Reader 接入](https://www.zotero.org/support/dev/zotero_7_for_developers)、[原生 MenuManager](https://www.zotero.org/support/dev/zotero_8_for_developers)。MenuManager 也已对照 Zotero [10.0.6 对应源码](https://github.com/zotero/zotero/blob/10.0.6/chrome/content/zotero/xpcom/pluginAPI/menuManager.js) 确认存在；旧版本开发指南仅用于对应接口说明，不扩大 Neo 的兼容承诺。

## 作用域、启动与退出

模块描述是静态的，运行实例按实际宿主创建，不能用一个全局模块对象保存所有窗口状态。

| scope | 身份和资源边界 |
| --- | --- |
| App | 启用图、偏好、公共 API 门面、必要的原生全局订阅。 |
| MainWindow | 一个物理窗口的 Settings、Picker、历史，以及各模块的窗口状态。 |
| ReaderSession | Zotero `instanceID`；共享 Reader Surface 输入状态，但不混淆主/次 PDF 视图。 |
| ReaderView | 精确视图及 Window/Document；拥有几何、提示、视图监听器和 patch 关联。 |
| NoteEditor | editor Window、Document、Note ID；任一替换即退休旧输入所有者。 |
| Interaction | 一次 Picker、Select、提示或编辑交互的子 scope；替换或取消后旧异步工作不能再更新新 UI。 |

启动按硬依赖顺序进行；九个核心分区固定加入应用图，可选增强只在用户请求及实际宿主依赖允许时挂接。构造只描述依赖，激活才获取监听器、patch、UI 和后台工作。关闭可选增强可保留静态元数据、配置及公共 API 的外部注册定义，但不创建其功能会话。

激活失败时立即退休该实例的回调、释放已获取资源并记录失败；实际硬依赖未就绪时，相关实例可显示 blocked，不自动更改设置或反复重试。核心分区固定启用不代表忽略宿主故障：核心实例失败仍按实际宿主隔离和报告，但没有用户关闭核心模块的配置。

退出顺序为：先退休 scope / generation，再移除动作入口、取消未接纳交互、注销原生回调与恢复自己拥有的 patch，最后释放其余资源。单个释放失败不能阻止其他资源释放；意外错误记录到共享 logger，不能把失败状态报告为已成功清理。

共享原生桥接由基座按活跃消费者集合保有。关闭一项可选增强只释放它的消费关系，不能注销其他功能仍使用的桥接。基座自身也是消费者，因此关闭 `reader-hints` 与 `extensions` 不等于整个插件不再有任何宿主监听器。

## 可选增强与设置语义

模块偏好沿用 `extensions.zotero-neo.modules.<id>.enabled` 键形，但只有 `extensions.zotero-neo.modules.reader-hints.enabled`（链接与复制提示）与 `extensions.zotero-neo.modules.extensions.enabled`（扩展管理面板）是用户可配置的模块开关，默认均为 `true`。九个核心分区固定启用；已有 `extensions.zotero-neo.modules.<core>.enabled=false` 值被忽略，不会关闭对应功能。

可选模块请求只在**真正重启 Zotero** 后应用；关闭设置、重新打开 Reader 或 Neo 热重载都不切换当前运行时图。保存与恢复默认只改动这两个可选增强的请求，不改核心配置、快捷键、行为偏好、marks 或 Zotero 数据。`noteEditor.enabled` 仍只控制 Vim 风格笔记编辑，关闭它不关闭笔记查找；`annotationCommentEditor.enabled`、`marks.persist`、`mode.visual.enabled`、`keyGuide.enabled` 与 `picker.mouse.enabled` 等也继续保留各自原义。

| 状态 | Settings 展示 | 当前会话行为 |
| --- | --- | --- |
| 已开启且激活成功 | Enabled | 安装该可选模块在当前 scope 支持的贡献。 |
| 已关闭且未运行 | Disabled | 仅适用于 `reader-hints` 或 `extensions`；不创建增强实例，其绑定不参与匹配或前缀等待。 |
| 用户修改可选开关，尚未重启 | 当前状态 + Pending restart；分别显示请求值与已应用值 | 继续使用当前启动时的应用图，不提前删除处理器或假装已经停止。 |
| 依赖或实际宿主未就绪 | Blocked 或 Pending host，并说明原因 | 不运行受影响的可选贡献；不自动修改其他设置。 |
| 激活失败 | Failed，显示可读原因并记录详细日志 | 退休该宿主实例的入口并清理已获取资源；该实例不循环重试，新宿主实例或重启 Zotero 可重新激活。 |

Settings 的模块区域只管理这两个可选增强。恢复默认仅清除它们的模块偏好并恢复默认启用请求；核心分区始终开启，原生偏好页中的 **Open Neo Settings** 与 `Zotero.Neo.openSettings` 始终可用。共享 Picker 属于核心交互基座，没有独立开关。

### 异步写入与可用性

- 动作是否可执行，取决于实际启用图、精确上下文、目标、权限及来源当前性，不能只检查一个 enabled 布尔值。Settings/Palette 应区分模块停用、依赖失败、宿主不支持与当前无目标；执行时仍重新验证。
- 取消尚未确认的交互不写入。Enter 接纳时冻结所选身份及来源，不能在队列执行时改用新的候选或当前选择。
- 已接纳的原生保存可能继续完成。关闭/替换 UI 只能退休其反馈与焦点权，不能声称撤销已提交数据；保存回执与当前 UI 是否存在分开处理。
- 分类操作的事务回调结果、恢复串行化及已提交结果判定仍由现有操作和 Toolkit 接缝保证；模块化不能用一个通用的“异常即未写入”规则替代它们。
- Bootstrap 使用同步退出契约。插件关闭或应用退出时遇到在途原生写入，应按[验收规范](ACCEPTANCE.md)验证其实际结果，不能仅凭模块作用域承诺宿主会等待任意 Promise。

## 源码组织

当前代码按以下职责组织。目录表示所有权，不要求每个分区拥有相同的一组文件，也不直接对应用户开关：

```text
src/
  addon.ts                 组合根与现有公共 API
  modules/
    index.ts               静态职责/可选清单与动作贡献索引
    <module-id>/           业务动作、状态、候选编排和专用 UI
  core/                    生命周期、偏好、少量共享契约
  input/                   唯一动作目录、默认绑定、输入引擎与运行时
  main/                    MainWindow / Main / Note 宿主与输入协调
  reader/                  ReaderSession / ReaderView 宿主与输入协调
  navigation/              唯一共享导航协调与历史
  ui/                      已有跨功能 UI 原语与主题
  toolkit/main/            Main 与 Note 的宿主能力
  toolkit/reader/          Reader 的宿主能力
  platform/                Gecko / Zotero 窄边界适配
  operations/              接收明确目标的领域写操作
  i18n/                    共享本地化目录
```

共享 Picker 实现位于 `src/main/picker/`，负责候选搜索、排序、展示、预览与输入；候选来源提供数据和展示，发起交互的功能负责确认语义与领域操作。它位于 MainWindow 不代表其机制属于 `library`。Main/Reader controller 协调输入、宿主、目标和功能组合；`src/input/note-actions.ts` 等领域专用命令保留在输入层的唯一目录，由 `notes` 实现，不另建命令副本。

调整职责时采用干净切换：同步更新调用者、删除旧实现及转发导出，不建立内部兼容层。公共 API 和持久化键的兼容要求与内部源码路径分开维护。

## 用现有功能走读接口

这些场景用于核对现有实现的输入、输出与资源边界。依据是 `src/core/contracts.ts`、Surface 目标解析器、Picker 工作流与 `src/modules/reader-selection/selection-actions.ts`；不通过空实现或模拟模块证明能力可用。

| 场景 | 契约如何组合 | 必须保留的边界 |
| --- | --- | --- |
| Main/Reader 添加标签 | 各自解析明确目标 → 关联 MainWindow 的 Picker → 标签动作确认 → `item-tags` Operation | Reader 不读取 Main Selection；`worksets` 是 Main 的可选目标来源，不是标签模块的硬依赖。 |
| 分屏中的 copy hints | 精确 ReaderView → 原生可见目标 → 本次提示交互 → 当前性与可见性检查 → 复制 | 共享 ReaderSession 不等于两个视图可互换；读取原生批注不依赖 Neo 批注模块启用。 |
| 原生输入与 Note Normal | Surface 输入宿主判定 IME/原生输入/显式 Note Normal → 当前上下文有效绑定 → 单一动作处理器 | 不让模块各自抢全局 keydown；不靠增加 Reader mode 处理评论输入，也不把所有 editable 都归 Neo。 |
| 外部插件注册选择动作 | 当前公共 API → 领域注册表 → 当前选择快照 → 可用性判定与本次执行 → disposer | 不进入内部 ActionId 目录；外部插件释放自己的注册，旧 disposer 不能误删后来注册，Neo 私有宿主对象不外泄。 |

契约评审通过的条件是：这些现有路径均有明确的输入、输出、资源负责方和失败结果；没有流程需要退回全局 Selection、任意服务查找或跨 Surface 动作重分发。若某条路径必须增加业务能力，只给真实调用双方增加具名端口，不先扩充通用插件协议。

## 维护与验收

修改模块时沿用现有具名端口、Operations 和 Toolkit，核对输入、目标、资源、写入结果及 `(BindingContext, ActionId)` 的唯一负责方。只为真实调用增加能力，不按目录或源码文件新增用户开关。

每次变更按[main 验收规范](ACCEPTANCE.md)记录受影响行为的实际结果。当前边界必须满足：

- 默认配置下，现有 Main/Reader/Note 动作、无默认按键的命令、用户重绑定、模式与 IME 行为不变。
- `worksets` 始终为核心模块，Main Visual 与 Persistent Selection 属于同一固定功能分区；关闭行为偏好不得被误写成关闭模块。
- `reader-annotations`、`reader-selection` 与 `reader-navigation` 始终为核心模块；Select 复制/搜索、原生批注交互、hints 读取及导航的故障隔离不能依赖用户关闭核心分区。
- `noteEditor.enabled` 关闭时，Note 原生输入与笔记查找仍可用；Vim 编辑模式的行为偏好保持原义。
- 在双 MainWindow、Reader 分屏、独立 Reader 和 Note editor 替换场景中，状态、历史、焦点与退出都归实际宿主；隐藏/已退休 PDF 视图不能确认提示或写入。
- Picker 排队期间候选改变、分类展开来源改变或交互被替换时，不写错目标；已提交写入仍有真实回执，不被当作取消或重复提交。
- 每个原生桥接只有一个有效所有者；重复打开/关闭窗口或视图后无重复菜单、监听、定时器、patch 和回调。部分激活/释放失败可诊断，不污染下一次实例。
- 关闭可选增强后，其按键不参与匹配、count/前缀等待或 Guide；配置仍保留。仅当可选请求改变时显示 Pending restart，重启前继续使用当前应用图。
- `reader-hints` 与 `extensions` 均关闭时，九个核心模块仍提供 Main、Reader、Note 与 Workspace 工作流；仍可从 Zotero 原生偏好页进入 Neo Settings，Zotero 数据与原生扩展管理不受影响。
- 现有 `getSelection()` / `registerSelectionAction()` 消费方无需改调用签名；核心选择实例当前不可用时 `getSelection()` 返回 `null`，不执行已退休的旧选择回调，恢复后不重复注册。

