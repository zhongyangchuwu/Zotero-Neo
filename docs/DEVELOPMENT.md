# 开发指南 {#development-guide}

## 兼容范围与验证 {#compatibility-and-verification}

当前 `manifest.json` 支持 Zotero `10.0.*`（`strict_min_version: 10.0`、`strict_max_version: 10.0.*`）。修改宿主接缝时，既要运行仓库验证，也要在 Zotero 中操作受影响的工作流。

需要 Node.js 24 和 npm。插件与 VitePress 文档站使用同一个仓库根目录，命令统一定义在根 `package.json`。先在该目录安装锁定依赖，再运行任一构建：

```bash
npm ci
```

如果 npm 12 以 `EALLOWGIT` 拒绝锁定的 Git 依赖，在同一根目录改用 `npm ci --allow-git=all --ignore-scripts`。这只影响本次共享依赖安装，不修改全局 npm 策略。

两种 XPI 构建入口都会调用 `npm run verify`，依次检查 Prettier、严格 TypeScript、Vitest、包构建与 XPI 成员。

## 构建 {#build}

在仓库根目录运行：

```bash
./tools/build.sh
```

Windows 可使用：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

### 文档站 {#documentation-site}

仓库根目录也是 VitePress 文档站根目录，配置位于 `.vitepress/config.ts`。Markdown 来源包括根页面和 `docs/*.md`，静态构建输出到 `.vitepress/dist/`。文档默认只维护中文；现有英文按需迁移，不建立双语副本，具体要求见[文档编写规范](DOCUMENTATION_AUTHORING.md)。

安装上述共享依赖后，在根目录运行：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

编辑时使用 `docs:dev`。`docs:preview` 提供最近一次静态构建；重新构建后要重启预览服务，避免缓存的文件信息继续指向旧 HTML 或资源名。在 GitHub Pages 的 base 路径 `/Zotero-Neo/` 下检查构建结果。

仓库管理员需要将 Pages 构建来源设为 GitHub Actions。PR 只构建和检查站点，不发布；部署仅允许 `main`。文档站输出独立于 XPI 和插件运行时。

### WSL 下的本地 GUI 迭代 {#local-gui-iteration-from-wsl}

使用专用 Zotero 开发 profile，并将其数据目录与个人文献库分开。开发工具只选择 profile，不会自动隔离数据目录。

关闭该开发 profile 的 Zotero 后，只需配置一次：

```bash
npm run dev:setup -- --profile /mnt/c/Users/YOU/AppData/Roaming/Zotero/Zotero/Profiles/DEV.default
```

setup 开启本地远程调试，将 profile 和 Zotero 可执行文件路径记录到被 Git 忽略的 `.zotero-neo-dev.json`，并将 `build/addon/` 镜像到 profile 下的 `zotero-neo-rdp`。配置完成后，先关闭仍使用该 profile 的 Zotero，再启动开发实例：

```bash
npm run dev:start
```

该命令启动配置的 profile，并从解包镜像安装临时扩展。不要同时在这个 profile 中安装同 ID 的 Neo XPI；重复安装可能使 Main/Reader 处理器竞争，并显示旧版 Command Palette。

保持开发实例运行，使用以下命令迭代：

```bash
npm run dev
npm run dev:status
```

`dev` 重建并重载临时扩展；`dev:status` 报告 profile、RDP 连接、镜像和启动日志位置。卸载 Neo 不会清除 `extensions.zotero-neo.*` 偏好或条目标签、持久化 marks 等 Zotero 数据，因此重装不等于干净偏好测试。原生验证只创建并清理明确归本次测试所有的数据，不修改个人条目。

## 品牌与资源 {#branding-assets}

`assets/branding/` 保存仓库 artwork，`assets/package/` 提供静态 XPI 骨架、运行时图标和偏好页。偏好页定义在 `assets/package/content/preferences/pane.xhtml`，行为由 `src/preferences/index.ts` 生成。品牌原始图不复制进 XPI；包内路径保持 `icons/*` 与 `content/preferences/*`。

## 运行时架构 {#runtime-architecture}

交互模型与当前功能所有权见[架构](ARCHITECTURE.md)。Neo 使用严格 TypeScript，通过打包生成 Gecko Bootstrap 运行时；内部 Toolkit 不新增运行时依赖。

`src/toolkit/main/private-types.ts` 和 `src/toolkit/reader/private-types.ts` 将宿主结构类型限制在 Toolkit 内。`src/toolkit/index.ts` 汇总 Main/Reader 入口；Main 已包含 Note-pane 能力，没有单独 Note Toolkit。功能代码使用这些能力入口，不导入原生结构类型或私有实现。没有等价公开 API 时，保留契约后必需的私有能力。

Zotero 管理 Items、视图、标签页、Notes 和 Reader 状态。功能负责目标选择、基数、确认与反馈；Toolkit 负责宿主查找、原生协议、DOM 接缝、跨 compartment 载荷和资源退休。公开 API 能保留行为时优先使用；包装必要私有依赖不能把它宣称为公开能力。公开条目 API 和 `src/platform/zotero-items.ts` 可以直接使用，不逐个套一对一包装。

### 模块基座与首条接入

`src/core/module-host.ts` 提供按 MainWindow 或 ReaderSession 隔离的模块宿主及独立模块作用域。同步激活失败会释放部分资源并保留原错误；动作贡献按 `(BindingContext, ActionId)` 唯一登记，返回有类型的调用入口。退出先使全部回调失效，再完成其余释放，即使某次清理失败也不会中断其他模块。

当前已接入 `src/modules/tags/`、`extensions/`、`collections/`、`worksets/`、`reader-hints/`、`library/`、`notes/`、`capture/`、`reader-navigation/`、`reader-selection/` 与 `reader-annotations/`。MainWindow 组合标签、扩展、分类、工作集、Library、Notes 和 Capture；ReaderSession 组合导航、选择、批注、hints、独立 Library citekey 贡献及 Capture 选择动作。模块只取得已有调用需要的具名端口，不依赖整个 Surface session。Operations 与 Toolkit 保持唯一负责方。模块开关、通用依赖图和其余候选模块仍按[整体设计](MODULE_DESIGN.md)逐步推进，不是当前可用功能。

工作集拥有 SelectionStore、Visual 范围及 Selection Panel。Main Surface 继续初始化和取消原生 Cursor/多目标，持有共享行渲染，并向模块注入刷新、主题和现有 Reveal 导航端口。目标解析与 Library Trash 接收明确 Selection 端口；来源为空或退休后沿用当前目标，不读取旧 Selection。共享导航通过局部界面端口捕获原面板，不再读取 session 的 Selection Panel 状态。

Library 拥有 Local Find 查询/界面及最近回收批次，Main session 不再预建这些状态。可见行查找不修改原生 View；条目选择器显式注入 Library 候选，范围与个人库回退保持原义。Main 保留目标策略、焦点和唯一历史；历史通过 `MainViewOperations` 使用原生查询/标签过滤能力，Workspace 和工作集 Reveal 不依赖 Library 动作。Reader citekey 仍可直接处理当前 Reader 条目。

共享 Picker 使用实际 Main session 的当前性端口；关闭先退休并清空运行时引用，再逐项释放资源。清理重入、异常或晚到的获取只能处理本次界面，不能关闭替换 Picker 或恢复旧焦点。Local Find 的主题句柄归单次界面，长期模块作用域不累计保留已关闭 DOM。

Notes 按窗口拥有候选、选择后的打开编排及可选 Vim 编辑的模式、寄存器和 caret 样式。`NoteSurfaceRuntime` 只保留精确编辑器身份、输入 runtime 和退休代次；Surface 继续决定原生/IME 输入、count、前缀及焦点。Note 普通动作和 Insert 退出登记到原上下文；候选必须显式传给 Picker，Capture 继续使用同一候选来源，不借用 Vim 开关。共享导航提供选择完成后的宿主委托，不新增 Note 历史栈。

Capture 按 MainWindow 拥有冻结的 Reader 选择快照、Note 来源、确认、目的地所有权/库验证及保存回执；ReaderSession 提供原有 `neo.capture-note` 动作，不新增 ActionId 或公共 API。Main 只转发实际关联窗口，Picker 提供排队及精确代次的界面释放。取消或替换先阻止旧确认；已接纳的原生保存继续完成，退休结果仍保留真实回执，旧 Reader 不再显示成功状态或抢回焦点。

Reader 导航拥有页面/滚动/缩放/搜索、语义与批注位置遍历、marks、按需 captions、原生侧栏增强及平滑滚动状态，登记 Normal 与四个侧栏上下文的实际处理器。Surface 保留输入和精确视图、CurrentTarget、共享导航历史，直接使用同一个 Toolkit 导航宿主处理分屏与焦点。marks 保存完成后重查发起交互，不能覆盖新的输入或界面状态；销毁视图时先清空 RAF/完成回调的所有权，再尝试原生取消，即使取消失败也不保留旧视图或阻塞下一次滚动。

Reader 选择拥有 DOM 范围、文本 motions、Flash 输入/标签、复制/搜索及动作面板；Surface 仍保留模式、输入仲裁、精确视图和共享滚动。交互同时捕获 ReaderView 与 Document，新的动作/原生选择接纳前先退休替换视图；旧输入、可用性判断和晚到结果不能操作后继界面。临时样式、anchor、主题与监听均随所属交互释放，具体边界见[架构](ARCHITECTURE.md#reader)。

Reader 批注模块拥有创建/删除/改色/过滤/复制及评论编辑，Surface 保留 CurrentTarget、NativeInput 和混合按键路由。评论输入、系统按键、主题、popup guard 与计时器属于精确 ReaderView / Document；退休先释放界面，已接纳的保存可以完成，但不抢回后继界面的焦点。

批注改动需用专用 profile 的自有附件验证 Select 高亮、下划线、Add note、Normal 改色/过滤/删除确认，以及评论输入实际挂载和聚焦、Escape 保存、两秒自动保存和数据库回读。另查 `i` 的 NativeInput 偏好分支、无批注时 `zb` 的滚动回退、自动保存前换标签页仍保存最终评论，以及晚到保存不覆盖后继 Reader 或 Settings 焦点。程序化设置 DOM 选择后应让 selectionchange 与渲染帧完成，再发送下一次按键；原生模型字段已变不代表 `saveTx()` 已提交。

### 宿主能力 Toolkit {#host-capability-toolkit}

| 能力 | Toolkit 负责方 | 边界与原因 |
| --- | --- | --- |
| Main 条目、标签页、Note 上下文与过滤 | `src/toolkit/main/host.ts` | 提供宿主事实与操作，不选择 Surface 目标。只在恰好一个原生 Scope 时调用 `getSelectedCollection()`；零个或多个 Scope 先用外层复数 API，再回退到原生 tree 的复数 API。分离的 Scope Cursor 不代替已选分类。 |
| Main tree 焦点、ScopeSet 与行 Cursor | `src/toolkit/main/tree.ts`、`host.ts` | 保留原生 Scope 选择与仅焦点的条目行操作；generation 令牌隔离替换或尚未稳定的行视图回调。 |
| 分类身份、条目搜索与 Scope 选择 | `src/toolkit/main/collections.ts` | 提供稳定分类 ID、路径与库可写性；先限制原生搜索 ID 数量再加载候选；等待 `onCollectionSelected()` 和 Main 条目视图加载，并核对已选及已渲染 Scope ID 后才报告完成。 |
| 分类事务回调屏障 | `src/toolkit/main/collection-transactions.ts` | 只在进入的事务体内捕获回调，按实际所属 ID 分发一次。局部观察原生 10.0.6 在 SQL 提交后的 `_commitCount` 增量，在共享回调执行前确认该事务结果，区分 SQL 回滚与提交后回调失败。仅恢复自有临时 registrar/counter descriptor，保留外部替换，不清空共享队列，也不安装宿主常驻 patch。 |
| Main 渲染行装饰 | `src/toolkit/main/rendered-items.ts` | 管理行标记与观察者；安装失败时先退休回调，再释放资源，保留原错误。 |
| 已安装扩展与偏好 | `src/toolkit/main/plugins.ts` | 将 Mozilla AddonManager 和 Zotero 偏好注册表投影为元数据/能力；扩展管理策略仍属于 Plugin Manager。 |
| Reader 注册、清单与身份 | `src/toolkit/reader/host.ts` | Reader 身份就是原生句柄；只有权威原生清单才能据此退休缺失 session。 |
| Reader 按键转发 | `src/toolkit/reader/input-bridge.ts` | 包装私有 `PdfView._onKeyDown` 与 `_textAnnotationFocused`。Zotero 会在普通 DOM 传播之外转发 PDF 按键，只有 `preventDefault()` 不能阻止原生处理；精确视图输入策略仍由 Reader 提供。 |
| PDF 视图监听与发现 | `src/toolkit/reader/view-lifecycle.ts` | 管理主/次 PDF 视图的附着与释放；注册绑定 ReaderView、Window 与 Document，复用 Window 不复活旧监听，部分获取失败仍释放先前句柄。 |
| Reader 原生导航、搜索、缩放、分屏与焦点 | `src/toolkit/reader/navigation.ts` | 在当前原生视图执行操作，并将载荷克隆进其 realm。`prepareReaderSelectionSearch()` 返回精确 pane/原生 Find 状态的一次写入能力，不覆盖后续输入或重开的 Find；语义与历史仍由业务负责。 |
| 跳转捕获、重开与完成桥接 | `src/toolkit/reader/jump-host.ts`、`history-bridge.ts` | 在宿主边界保留视图/历史身份与完成来源；共享历史策略属于 `src/navigation/`。 |
| PDF 文本与选择几何 | `src/toolkit/reader/pdf-text.ts`、`selection-geometry.ts` | 读取文本层和 viewport 几何；不完整几何拒绝保存，不生成部分批注。 |
| 可见标识符文本与几何 | `src/toolkit/reader/identifier-text.ts` | 将可见 PDF.js 文本读成保留来源的同行片段，将文本范围映射成 viewport 矩形；不猜跨行拼接，不使用 OCR。 |
| PDF 链接 overlay 与原生委托 | `src/toolkit/reader/links.ts` | 读取 Zotero overlay 映射，并委托捕获的原生视图激活链接。 |
| Reader 目标 frame 可见性 | `src/toolkit/reader/visibility.ts` | 批注、标识符与原生链接共享窗口关闭及包含 frame 的可见性检查；Reading Mode 下隐藏的 PDF 不能成为操作目标。 |
| 原生 Reader 侧栏 | `src/toolkit/reader/sidebar.ts` | 为 Zotero 管理的 pane/行提供可逆展示与监听机制；绑定和目标策略在 `src/modules/reader-navigation/native-sidebar.ts`，Surface 独立使用 Toolkit 判断原生侧栏输入目标。 |
| 批注选择、过滤与 popup | `src/toolkit/reader/annotations.ts` | 适配 Reader 私有操作；条目写入继续使用公开 Zotero API。 |
| 可见批注模型与几何 | `src/toolkit/reader/annotation-targets.ts` | 只接纳当前过滤视图中、具有支持锚点且与 viewport 相交的原生批注；隐藏、已过滤、屏外及不支持的目标不进入候选。 |
| marks 几何与旧存储 | `src/toolkit/reader/marks.ts` | 提供宿主存储/几何；父条目或附件的存储策略由 `ReaderMarks` 决定。 |
| Zotero 结构化文档块 | `src/toolkit/reader/structured-document.ts` | 原生冷处理可能覆盖整个 PDF 且无法取消；请求保持显式，语义分类属于 `ReaderCaptionTargets`。 |

分类工作流由 `src/modules/collections/` 拥有。Main/Reader 在发起 Surface 提供自己的目标解析器；模块固定来源、库与条目身份，并负责确认、草稿和工作流权限，不直接读取 Main session。`src/operations/collections.ts`、`item-collections.ts` 接收明确条目和分类 ID，在写入前重新验证身份、库与可编辑性。模块内的 Picker provider 只提供同库候选和直接成员覆盖率，不选择操作目标或写入数据。组合根提供精确交互代次与释放句柄；原生对话框返回后也必须重查当前性。

Neo 分类写入共享 Toolkit 接纳屏障，直到自有回调及 Operations 的回滚恢复完成。重载策略仍由 Operations 决定；前一操作恢复缓存成员/分类状态期间，后一 Neo 分类写入不能开始。SQL 已提交时不运行回滚恢复。外部原生回调失败而自有提交回调完成时，返回真实保存回执并通过共享 logger 记录原错误；自有提交回调失败仍是可见拒绝，不能卸载已提交对象或在后续事务重放旧回调。

分类条目 provider 每次查询最多通过 Toolkit 的原生标题/作者/年份搜索取得 100 个顶层条目。Toolkit 只加载这些有界候选的 creators、item data 和 memberships。只有 Enter 确认后才调用 `loadAllData()` 完整加载该条目，满足原生 Main 渲染对子条目数据的要求；该路径不枚举 `Items.getAll()`。

Reader 目标发现与交互由以下功能负责，上述 Toolkit 提供宿主数据和几何：

| 负责方 | 职责 |
| --- | --- |
| `src/identifiers/` | 纯 DOI、arXiv 和 HTTP(S) 识别，保留原始偏移。 |
| `src/modules/reader-hints/identifier-targets.ts` | 合并文本识别与原生链接，将复制内容和跟随目的地分开。 |
| `src/modules/reader-hints/copy-targets.ts` | 将 Excerpt/Comment 作为独立角色，按批注分组，省略空角色；不与标识符去重合并。 |
| `src/modules/reader-hints/copy-hints.ts`、`link-hints.ts` | 在精确活跃视图接纳复制/跟随；链接保留原生目的地与历史语义，导航当前性同时受模块作用域约束。 |
| `src/modules/reader-hints/target-hints.ts` | 管理临时提示、字母输入、分组布局、防碰撞与清理；保留可见提示状态，使旧视图确认仍能进入取消路径。 |

Zotero 10.0.6 的标识符工具提供 DOI/arXiv 匹配与清理基线，不决定 Reader 扫描策略。Reader 增加 HTTP(S)，保留每次可见出现和 arXiv `vN` 版本，只扫描当前视图可见同行片段，不猜跨行拼接或使用 OCR。批注目标遵守 Zotero 可见性/过滤状态，并要求支持的当前视图几何。摘录里的 DOI 仍是独立复制意图。裸 DOI/arXiv 跟随时构造解析 URL；HTTP(S) 字面量保留原始路径、查询、fragment 与大小写。

原生 Reader 按页、按矩形转换批注几何，并将载荷克隆进所属 realm。跨屏外片段的总包围盒不代表存在可见锚点。确认前重新验证原生模型身份、字段/过滤/视图快照；有界布局无法放下不重叠标签时，退休该交互，不提供被遮挡但仍能选择的目标。

绑定 schema 19 在解析前将持久化 `copyIdentifier` / `followIdentifier` 迁移为 `copyTarget` / `followLink`，保留自定义按键、显式 null 与自定义 `reader-normal:y` → `yankAnnotation`。旧 ID 不作为运行时别名。

Bootstrap chrome 与 Zotero content 之间传递对象时，必须克隆到接收窗口。`src/platform/cross-compartment.ts` 统一处理 `Components.utils.cloneInto`、wrapper 身份及 dead-wrapper；PDF 视图句柄保留原生身份，不在每个事件中分配包装器。

异步宿主工作在应用结果前检查捕获的 Reader/session/view 身份和 generation。退出先退休回调，再移除监听器；只在 wrapper 仍自有时恢复被 patch 的方法，并防护已销毁 Gecko wrapper。活宿主上的失败必须可观测。

标签过滤读取当前渲染 Scope 的完整行结果，包括原生多行选择，不扩大到全库。分类动作目标与确认见[交互模型](INTERACTION_MODEL.md#action-target-contracts)。

## 诊断 {#diagnostics}

Bootstrap 将诊断写入 profile 下的 `zotero-neo-startup.log`，并通过 `Zotero.debug()` 报告运行时消息。`npm run dev:status` 显示日志路径。

## Reader 选择 API {#reader-selection-api}

`Zotero.Neo.reader.getSelection()` 返回当前 `ReaderSelectionContext` 或 `null`；`Zotero.Neo.reader.registerSelectionAction(action)` 注册扩展动作并返回 disposer。API 由 `src/addon.ts` 公开、`src/core/contracts.ts` 定义类型；`src/modules/reader-selection/` 负责选择上下文和动作运行时，`registry.ts` 的定义随应用存活，不因关闭一个 Reader 清空。旧 disposer 不删除同 ID 的后继注册；选择模块退休后不暴露旧上下文或执行旧回调。集成方继续使用原接口，不直接访问 Reader session 或 PDF.js 私有对象。
