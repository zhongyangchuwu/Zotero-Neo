# 架构 {#architecture}

Zotero Neo 在 Zotero 之上增加交互能力，不维护另一套文档、选择或数据模型。通常的调用路径为：

```text
上下文 -> 目标 / 目标集 -> 语义动作 -> Zotero 宿主操作
```

每一层只有一个负责方。只有多个具体工作流使用相同契约时，才提取共享抽象。

共享导航栈及其记录/恢复策略见[导航历史设计](NAVIGATION_HISTORY_DESIGN.md)。本文描述当前运行时所有权；[交互模型](INTERACTION_MODEL.md)定义 Main 交互语义，[命令参考](COMMAND_REFERENCE.md)维护准确的按键说明。

[模块拆分与基座能力设计](MODULE_DESIGN.md)描述整体边界与迁移约束。当前已实现最小基座及标签、扩展管理、分类模块接入；其余模块、依赖图和启用配置仍是设计，下文维护实际运行时所有权。

## 分层 {#layers}

### 1. 输入与交互作用域 {#_1-input-and-interaction-scope}

`src/input/` 负责按键归一化、语义 token、序列/count 匹配、已解析绑定，以及 `src/input/engine.ts` 中的纯 reducer。`src/input/runtime.ts` 为每个输入处理方维护待完成序列、count 和定时器。`src/ui/key-guide-runtime.ts` 单独负责按键指引展示；局部控件使用 `src/input/local-binding-runtime.ts`。

宿主判定原生输入、可编辑输入和输入法组合状态，并负责焦点、动作执行与生命周期。`BindingContext` 表示精确的输入处理方/能力契约，不是 Surface mode；上下文不继承其他模式的绑定，也不使用全局后备绑定。Main 和 Reader 具有 Normal/Visual 交互，Note 具有 Normal/Insert。Main Visual 的 `main-select` 上下文只在临时范围存在时适用，不取决于 Persistent Selection。批注评论输入与编辑功能关闭后的原生透传属于功能输入处理方，不是额外的 Reader mode。输入法与文本输入见[输入说明](INPUT_METHODS.md)；完整上下文和按键清单由命令参考维护。

持久化绑定迁移位于 `src/core/preferences.ts`，不创建运行时别名或继承 keymap。

### 2. 语义动作与能力 {#_2-semantic-actions-and-capabilities}

`src/input/actions.ts` 是唯一的 `ActionId` 目录。功能能力模块定义可执行动作；controller 分发已解析的语义动作，不模拟键盘事件。Settings、Key Guide、快捷键提示和按键匹配都由同一动作目录、处理方能力与已解析绑定生成。

条目目标由发起操作的 Surface 解析。`src/core/item-target.ts` 定义共享结果形状；`src/platform/zotero-items.ts` 负责 Zotero 查找、归一化与身份去重。`src/main/main-item-target.ts` 在 Main 中优先解析 Selection，再解析 CurrentTarget；`src/reader/item-target.ts` 解析当前 Reader 条目；`src/main/note-item-target.ts` 解析当前 Note。Reader 和 Note 不借用 Main Selection。

具体领域操作位于 `src/operations/`，接收显式条目或 ID。Surface 负责目标选择、基数、确认、导航与状态反馈。跨 Surface 协作使用命名能力或共享 Operation，不重新分发另一 Surface 的 `ActionId`。

### 3. 功能所有权 {#_3-feature-owners}

#### Main {#main}

`src/main/window-runtime.ts` 为一个物理 Zotero MainWindow 提供服务。`src/main/session.ts` 将宿主 runtime 与 Main、各功能状态组合；`src/main/active-surface.ts` 根据 Zotero 焦点、标签页和编辑器状态推导当前 Main、Reader 或 Note 交互。

Note 是由 MainWindow 承载的独立交互处理方。`src/main/note-editor.ts` 通过 editor Window、Document 和 Note 条目 ID 识别附着身份；任一身份被替换时，先退休旧输入，再清理监听器。Note 内容仍以 Zotero 为准。

`src/main/controller.ts` 协调 Main 动作；`src/main/navigation.ts` 负责条目树/分类树移动；`src/main/item-select.ts` 负责临时 Visual 范围及其可见原生树投影。Persistent Selection 属于 session，独立于原生行选择。`src/main/picker/` 为发起动作解析一个临时候选，确认及宿主写入由动作负责。共享写操作位于 `src/operations/`，Main 宿主能力位于 `src/toolkit/main/`。

`src/core/module-host.ts` 为每个 MainWindow 的模块提供独立子作用域、同步激活回滚和 `(BindingContext, ActionId)` 贡献所有权。调用返回有类型的业务入口，不新增命令 ID 或跨 Surface 分发器。宿主退出先退休全部贡献，再尝试释放所有资源；原始激活或清理失败仍可观测。

`src/modules/tags/` 是首条完整接入路径：`index.ts` 组合模块与作用域，`actions.ts` 拥有标签候选/确认与过滤策略，`capabilities.ts` 向现有三个 Surface 能力目录提供动作集合。Main controller 只在各自 Surface 解析目标后调用模块入口，并注入 Picker、状态反馈和 Main 过滤端口。标签事务仍由 `src/operations/item-tags.ts` 执行，候选 provider 仍只处理数据和展示。

标签模块不持有 Main session、原生 pane 或 Reader 对象。Picker 端口返回仅能关闭本次调用的释放句柄；视图或窗口退休后不能确认旧选择、重画状态或关闭后来替换的界面。已接纳的保存继续按原生事务结果完成，不因模块退休而伪装成取消。

`src/modules/extensions/` 拥有已安装 Zotero 扩展的 Plugin Manager。`index.ts` 为每个 MainWindow 创建模块作用域、面板和状态；Main session 不再持有插件面板状态。Main/Reader/Note 的 `managePlugins` 进入实际所属窗口的同一面板，局部输入继续使用 `plugins-input` / `plugins-list` 和既有重绑定。

面板关闭先退休交互，再分别释放局部绑定、输入监听、主题与 DOM；某项释放失败仍尝试其余资源，并保留原始错误。异步刷新和原生启停完成后同时核对模块作用域与本次界面身份，不更新退休界面或恢复其焦点。已接纳的原生操作不伪装成可取消。原生 AddonManager 接缝仍在 Toolkit；该模块不负责 Neo 内部模块配置，也不新增安装、更新或卸载功能。

`src/modules/collections/` 拥有分类成员操作、查找、连续添加条目、分类结构操作、候选展示及每个窗口的重命名草稿。Main/Reader 传入各自的目标解析器和显示标签，确认时重验证来源、库与目标签名；模块不持有整个 Main session、共享 Picker 或 MainNavigation。Main 保留现有九个分类命令，Reader 保留 Add/Remove，Note 不新增命令。

组合根为分类工作流提供精确 Picker 代次、确认时的已提交查询和本次释放句柄。多步骤创建保留返回原查询与取消语义；原生命名对话框的嵌套事件循环返回后，先检查当前性，不能让退休工作流继续弹出确认框。作用域退出只释放自有 Picker，不关闭替换交互。现有分类 Operations 在事务内继续验证当前性，失效时按原有规则回滚未提交写入并恢复缓存；模块不改变 Toolkit 的提交回执或回滚屏障。

#### Reader {#reader}

`src/reader/controller.ts` 按 Zotero `instanceID` 管理 Reader session。主、次 PDF 视图共享一个 Reader Surface，但输入、几何与导航始终保留精确视图身份。

Reader 各功能维护自己的状态：`src/reader/navigation.ts` 负责语义遍历与反馈；`src/reader/selection-range.ts` 负责临时键盘 Select 范围；`src/reader/flash.ts` 与 `src/reader/link-hints.ts` 负责各次目标提示交互；`src/reader/marks.ts` 负责持久化 marks；`src/reader/native-sidebar.ts` 负责可逆的 Outline 集成；`src/reader/caption-targets.ts` 负责按需图表/标题分类；`src/reader/comment-editor.ts` 和 `src/reader/native-input.ts` 负责功能输入；`src/reader/selection-actions.ts` 负责视图级动作面板。功能输入所有权不新增 Reader Surface mode。

宿主能力位于 `src/toolkit/reader/`；具体路径和私有接缝见[开发指南](DEVELOPMENT.md#host-capability-toolkit)。Reader 生命周期工作仅对活跃 session 及精确 PDF 视图有效。原生事件回调在注销前先按身份退休；只有权威 Reader 清单才能据此退休缺失 session。退出时防护已销毁的 Gecko wrapper，同时保持活对象上的失败可观测。

#### 共享导航历史 {#shared-navigation-history}

`src/navigation/history.ts` 维护每个 MainWindow 唯一的历史栈；`src/navigation/history-policy.ts` 定义记录资格与证据；`src/navigation/coordinator.ts` 负责接纳、当前性、完成与提交。`NavigationPort` 是记录入口，Main 与 Reader 宿主适配器提供原生操作。记录、恢复与传输细节由[导航历史设计](NAVIGATION_HISTORY_DESIGN.md)维护。

### 4. 宿主能力 Toolkit {#_4-host-capability-toolkit}

Zotero 拥有领域数据和原生视图。Neo 只在宿主无法表达对应契约时维护交互状态：Main Persistent Selection 保存稳定条目身份而非渲染行号；Reader 键盘 Select 使用临时 DOM range，因为目前没有受支持的宿主 API 能更新 Zotero 私有 PDF 选择模型。

`src/toolkit/index.ts`、`src/toolkit/main/index.ts`、`src/toolkit/reader/index.ts` 是宿主能力入口。Main 包含 Note-pane 能力，没有独立 Note Toolkit。Toolkit 负责原生结构类型、宿主查找、回调 patch、DOM 集成与资源退休。跨 chrome/content compartment 的载荷通过 `Components.utils.cloneInto` 克隆到接收窗口，统一由 `src/platform/cross-compartment.ts` 处理。目标、模式、绑定、历史记录资格、确认与反馈由功能负责，不由 Toolkit 决定。公开条目 API 和 `src/platform/zotero-items.ts` 满足契约时可以直接使用。

文档化 API 无法提供相同行为时，保留必要的私有能力，并放在命名契约后；包装私有调用不代表依赖已变成公开 API。[开发指南](DEVELOPMENT.md#host-capability-toolkit)列出当前负责方，以及单数/复数 Scope 的前置条件。

## 共享原语，而非通用框架 {#shared-primitives-not-generic-frameworks}

共享原语应已被具体功能使用：输入 reducer 与各处理方 runtime、语义 `ActionId`/能力投影、输入法组合防护、类型化条目目标及 Zotero 归一化辅助、`fuzzyMatchScore()` 适配器、主题管理器和具体 Operations。Picker、Plugin Manager、Reader overlay 与各 Surface 目标解析器保留自己的生命周期和领域策略；共享原语不意味着合并它们的契约。
