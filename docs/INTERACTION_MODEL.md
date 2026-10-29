# 文库交互模型 {#library-interaction-model}

本文定义文库及其 Main、Reader、Note 交互界面的操作契约。[命令参考](COMMAND_REFERENCE.md)维护准确快捷键；[导航设计](NAVIGATION_HISTORY_DESIGN.md)维护历史记录与恢复规则；[架构](ARCHITECTURE.md)描述运行时所有权。

## 术语 {#terminology}

文档和中文 UI 标签使用下列名称。下文定义交互契约；准确按键和动作可用性由[命令参考](COMMAND_REFERENCE.md)维护。

| 术语 | 中文名称 |
| --- | --- |
| Main | 主窗口 |
| Reader | 阅读器 |
| Note surface | 笔记编辑器 |
| Zotero note | 笔记 |
| Surface | 交互界面 |
| [View](#view) | 视图 |
| [Main Scope / ScopeSet](#filter) | 文库范围／范围选择 |
| [Cursor](#cursor) | 条目游标 |
| [Selection](#selection) | Neo 选择集 |
| [Main Visual range / `VisualTarget`](#visualtarget) | 可视范围 |
| Reader Select / text selection | 文本选择模式／文本选区 |
| Note caret | 文本光标 |
| Annotation / annotation comment | 批注／批注评论 |

Main Selection 是仅在会话期间存在的工作集，不是 Reader 文本选区，也不是临时 Main 范围。Reader 内部的 `visual` 状态显示为 Select。

UI 说明使用所选语言界面中显示的标签。代码标识符、绑定上下文、命令和配置键保持原样。

## 核心模型 {#core-model}

```text
View = Query + Sort
          |
          v
   visible ordered items
          |
        Cursor
          |
   +------+------+
   |             |
 VisualTarget   Selection
   |             |
   +------v------+
     Object Action
```

这些概念彼此相关，但不能混为一谈。

### 视图 {#view}

View 是 Zotero 在当前原生 Scope 中维护的结果集及排序。条目树、原生搜索／筛选／排序状态和底层 Item 数据均由 Zotero 负责。Neo 调用宿主机制，不另行维护查询 AST 或重复的文库状态。

Quick Search、标签条件、高级搜索、结果选项和排序都会影响 View。Scope 是另一个独立的原生集合树选择状态，见[筛选](#filter)。

更改 View 可能会使之前选中的条目不可见，但不能因此重新定义 Neo 持久化的 Selection。

### 条目游标 {#cursor}

Cursor 是当前可见有序 View 中获得焦点的条目。

Cursor：

- 属于当前 View；
- 通过普通导航或局部查找移动；
- 不表示条目已加入 Selection；
- 是单条目查看／导航命令的目标；
- 进入 Visual 时提供锚点。

因此，普通条目导航只能移动焦点。不能为了移动焦点而调用会折叠 Selection 的宿主操作。

如果 Zotero 只提供私有的“仅移动焦点”接口，Neo 应将其隔离在具名宿主适配器之后。

### 选择集 {#selection}

Selection 是 Neo 拥有的临时工作集，由稳定的条目标识组成。

概念上：

```text
Selection = Set<{ libraryID, itemID }>
```

Selection 与 Zotero 当前的 `TreeSelection` 并不相同。后者保存当前渲染结果树中的行索引，因此无法表示被筛选条件或范围隐藏的条目，也无法在排序或刷新后保持稳定。

Neo 仍以 Zotero 的数据模型为准：

- Zotero Item 对象和数据库状态是权威数据；
- Selection 只保存身份，不复制条目数据；
- Selection 是会话交互状态，不是持久化文库数据；
- 修改操作仍使用 Zotero API 和事务。

当前可见的 Zotero 树可能会投影 Selection 中可见的成员，以兼容宿主或 UI；但该投影不是完整的事实来源。Zotero 原生条目 TreeSelection 也可能因 `Ctrl+A` 或鼠标选择等宿主操作，暂时包含多个可见条目。这种原生选择是即时 CurrentTarget，不是持久 Neo 工作集。

Main 显示 Selection 标记及其总数和可见数；若有隐藏成员，也会显示隐藏数。可见行装饰只是兼容宿主／UI 的投影；由 Main 拥有的 Selection 身份才是完整事实来源。

### 有效选择集 {#effectiveselection}

Main 的工作集类 Operation 按下列规则解析目标：

```text
EffectiveSelection =
    Selection non-empty -> Selection
    Selection empty     -> CurrentTarget

CurrentTarget =
    Visual active       -> VisualTarget
    native multi-set    -> NativeTarget
    otherwise           -> { Cursor }
```

这将持久工作集语义与临时目标区分开，同时仍可组合 Zotero 原生多选。并非所有动作都会使用 EffectiveSelection；目标归属取决于具体动作，见下文的**动作目标契约**。

### 可视目标 {#visualtarget}

Visual 是以 Main Cursor 为基础的临时连续范围。进入 Visual 后会建立 anchor/head 范围；准确按键序列见命令参考。

Visual 期间：

- 移动会改变范围头部；
- 扩展和缩小均可反向操作；
- 交换端点会交换 anchor 和 head；
- 只有显式 Selection 操作提交范围时，Selection 才会改变；
- 取消会丢弃临时范围，不修改 Selection。

必要时，Visual 会按稳定条目标识跟踪范围。它不会反复调用 `shiftSelect(..., augment=true)` 来编辑可变范围，因为缩小这类范围时旧的尾部仍会留在选择中。

## Selection 操作 {#selection-operations}

Selection 操作的目标是 CurrentTarget，不是隐含的持久集合模式：

```text
Normal + native multi-set -> CurrentTarget = native selected items
Normal otherwise          -> CurrentTarget = { cursor item }
Visual                     -> CurrentTarget = contiguous visual range
```

Toggle Selection 对目标集合 `T` 使用全有或全无规则：

```text
if T is entirely contained in Selection:
    Selection = Selection - T
else:
    Selection = Selection union T
```

这样将 Visual 范围视为一个整体，避免对称差产生意外的空洞。在 Normal 中，Toggle Selection 操作 CurrentTarget；在 Visual 中，显式提交会将操作应用于 VisualTarget 并返回 Normal。准确绑定见命令参考。

提交 Visual 范围不需要另设一个独立的“结束选择模式”概念。

## Selection 没有模式 {#no-selection-mode}

Selection 自身没有模式。

`main-select` 是精确的 `BindingContext`，不是 Surface 模式或临时兼容产物。Main 处于 Visual 状态时，该上下文的负责方接收编辑范围的动作。Selection 仍是独立的交互工作集；绑定上下文不会定义或持久化 Selection。

持久 Selection 自身也没有模式。Main 的 Selection 操作按上述规则作用于 CurrentTarget 或 VisualTarget；不存在脱离这些目标单独编辑已存工作集的模式。

## 局部查找与筛选 {#local-find-versus-filter}

Find 和 Filter 是不同的操作。

### 局部查找 {#local-find}

局部查找：

- 只搜索当前可见有序 View；
- 将 Cursor 移到匹配项；
- 不改变 Query、Sort、Selection 或 Scope；
- 不回退到全局条目选择器；
- 没有匹配项时也不清除筛选条件。

局部 Find 通过 Main Normal 绑定以及在当前 View 中确认的重复操作打开；它只移动 Cursor。准确按键见[命令参考](COMMAND_REFERENCE.md)。

### 筛选 {#filter}

Quick Search、高级搜索和标签条件会改变 View。

它们可能改变 Selection 成员的可见性，但不能悄悄改变完整 Selection 工作集。

分类／文库树是 Zotero 的原生 Scope 层。它可以包含多个选中的文库、分类或已保存搜索行（`ScopeSet`）；Neo 观察宿主状态，不再创建另一套集合范围。

条目 `Selection` 与 ScopeSet 不同。分类树输入仍由 Zotero 原生处理；Neo 没有 ScopeSet 修改语法或分类选择模式。Scope 的成员关系与含义仍以 Zotero 为准。

## 动作目标契约 {#action-target-contracts}

Neo 按 Surface 解析条目目标；共享 Operation 不代表共享目标解析器。Main View 动作和 Reader 本地 PDF 动作不使用条目目标。

- **MainItemTarget**：Main Selection 非空时使用该 Selection；否则依次使用 CurrentTarget（Main Visual 范围、Zotero 原生条目多选或 Cursor）。普通 Main 条目 Operation 使用此目标。
- **ReaderItemTarget**：当前 Reader 条目的上下文；Operation 需要书目条目时，按 Zotero 的顶层条目规则归一化。
- **NoteItemTarget**：当前上下文面板中的 Note，或已选中的独立 Note 标签页；若有书目父项，则归一化到该父项。

Reader 和 Note 的目标来自各自上下文，绝不借用 Main Selection。Surface 或功能负责方解析语义目标和预期基数；是否归一化由具体目标契约明确规定。Operation 接收已解析的目标并实施数据安全和前置检查，不会替换成另一个 Surface 的选择集或猜测目标。不存在通用目标解析器；目标不可用或不受支持时不会静默回退到 Cursor。

当前动作目标规则：

| 动作类别 | 目标契约 |
| --- | --- |
| Cursor 移动和局部查找 | 仅 Cursor |
| Main Items 中的 Open/Activate | 仅 Main Cursor，不论持久 Selection 或 Zotero 原生多选；Cursor 不可解析时拒绝。Items 面板的 Enter 同样遵循此规则；分类面板的 Enter 选择原生 Scope 游标并将焦点移至 Items。 |
| Note Open | Note 上下文条目；如有书目父项则归一化到父项；不使用 Main Selection。 |
| Show in Library | Reader/Note 使用各自 Surface 的上下文条目；Selection Panel Reveal 使用面板中选中的确切 ItemRef。 |
| Add/Remove Tag | Main 使用 MainItemTarget；Reader/Note 使用各自上下文中的单条目标。 |
| Trash / restore | Trash 使用 MainItemTarget，并确认目标／数量且拒绝隐藏成员；restore 使用 Neo 最近一次 Trash 批次。 |
| Reader 批注删除 | 一个选中的 Reader 批注；显式确认永久删除。 |
| 分类成员关系 | Main 使用 MainItemTarget；现有 Reader 添加／移除操作使用 Reader 上下文条目；Note 不支持分类操作。 |
| Visual 选择操作 | VisualTarget 修改 Main Selection；它不是普通 Main 条目 Operation。 |
| Quick/Advanced Search、标签筛选和排序 | 仅影响 View，不修改 Main Selection。 |
| Citekey 复制 | Main 可通过 MainItemTarget 批量处理；Reader/Note 仍按各自上下文处理单个目标。 |

Main Open/Activate 是普通 Main 条目 Operation 的一个特例，只以 Cursor 为目标：持久 Selection 和原生多选不会替代 Cursor。Cursor 无法解析时拒绝；绝不打开宿主选择集中的第一项。Note Open 使用自身上下文目标。这不是批量打开契约。

具体动作的归一化规则仍然重要。例如，为条目添加标签时可以有意将附件归一化到父项；删除该附件的动作则不能悄悄采用这种归一化。

一旦 Cursor 可以独立于 Selection，`getSelectedItems()[0]` 这类代码模式就不构成有效的隐式目标契约。

### Main 批量操作细节 {#main-batch-operation-details}

Main citekey 复制使用 MainItemTarget，通过 Zotero 的 `Items.keepTopLevel()` 归一化并去重；若目标已过期或有 citekey 缺失，则拒绝操作。生成的 Better BibTeX 原始 key 以空格分隔。Reader 和 Note 的复制仍由各自上下文中的单目标 Operation 处理。

Main 分类成员关系操作从 Main `EffectiveSelection` 解析 MainItemTarget：Neo Selection 非空时使用 Selection，否则使用 Main CurrentTarget。Main 工作流在显示候选项前固定目标来源、身份集合和文库，并在确认时重新验证这些目标以及可写性。现有 Reader 添加／移除调用方传入 Reader 上下文条目，不借用 Main Selection。Note 不支持分类操作。

`moveToCollection` 还要求一个当前普通来源分类，且每个目标都直接属于该分类。Main 会重新验证来源和目标身份；Operation 接收明确的条目对象及来源／目标分类 ID，在保留其他分类关系的同时原子移动成员关系。候选覆盖范围仅限直接成员。确认不会改变 Main Selection。

### 分类结构目标 {#collection-structure-targets}

`moveCollection`、`renameCollection` 和 `deleteCollection` 的目标必须是一个普通分类：分类面板聚焦时使用树游标，否则要求恰好选中一个有效分类。树焦点可独立于多个已选范围定位游标；离开该面板后，选中多个范围时拒绝操作。文库根、不可用游标或行都不是目标，也不会替换成第一条选中行。这些动作不借用条目 `Selection`。

`createCollection` 需要一个文库上下文。树聚焦时使用游标所在文库，否则要求恰好选中一个文库／范围。现有选择器会询问父分类（包括文库根）。当前分类可以预选为父项，但条目 Selection 和原生条目多选都不能选择父分类。Main 解析稳定分类 ID；Operation 在修改前重新检查分类和文库。

## 隐藏 Selection 安全性 {#hidden-selection-safety}

持久工作集会有意引入隐藏目标。

高影响修改会在变更 Zotero 数据前展示实际解析出的目标：

- Main Trash 会拒绝缺失目标，以及被当前 View 隐藏的 Neo 持久 Selection 成员。状态会报告隐藏数／总数，并引导用户打开 Selection Panel 检查、显示或移除成员。
- 对可见 Main Trash 目标，确认信息会列出 Neo Selection、Visual 范围、Zotero 原生多选或 Cursor 的目标种类及条目数。取消不会修改 Zotero 数据、Selection 或 Trash 历史；完成反馈会再次说明解析后的目标及数量。
- Reader 批注删除会确认恰好一个选中批注，并说明删除不可恢复。取消会保留批注选择；Neo 只在 Zotero 删除成功后清除选择。

Selection Panel 是工作集的检查／管理界面，可以：

- 列出成员；
- 显示成员可见或隐藏状态；
- 移除成员；
- 清空 Selection；
- 显示选中成员。

它不是操作控制台。

## 在文库中显示 {#show-in-library}

Reader 和 Note 从各自当前 Surface 解析条目，不借用 Main Selection。Selection Panel Reveal 使用面板中选中的精确 `ItemRef`。二者使用相同的单条 Zotero Operation，也都不会捕获或恢复 Main Selection。历史记录见导航设计。

## 导航跳转历史 {#navigation-jump-history}

每个 Main 窗口拥有一个由 Main、Reader 和 Note 共用的内存历史栈。持久 Main Selection 不属于历史位置。[导航设计](NAVIGATION_HISTORY_DESIGN.md)说明哪些宿主操作会记录、完成／当前性要求及恢复行为；准确用户按键见[命令参考](COMMAND_REFERENCE.md)。

## 键位图方向 {#keymap-direction}

Main 和 Reader 具有 Normal/Visual 交互；Note 具有 Normal/Insert。`BindingContext` 标识负责方及其能力集合，不是单独的 Surface 模式或领域状态。准确上下文和绑定见[命令参考](COMMAND_REFERENCE.md)；模式不会继承其他模式或全局后备绑定。

功能输入负责方只在各自定义的目标和生命周期内优先处理输入。批注评论编辑器拥有其捕获的 PDF 视图。设置 → Reader → **批注评论编辑**偏好控制能否进入编辑器；关闭后，`i` 会使用 Reader 范围的原生输入透传，直到按 Escape 或交互停用。Enter 插入原生换行。Escape 或输入交接会保存最终草稿并关闭编辑器；停止输入两秒后也会自动保存。Reader／视图销毁只释放编辑器和定时器，不会另行启动保存；已开始的保存不受销毁影响。这不是 Reader Insert 模式。Note Insert 会将普通文字交给 Zotero 原生编辑器。输入法组合输入的所有权见[输入法说明](INPUT_METHODS.md)。

## 运行时身份与激活 {#runtime-identity-and-activation}

当前 Surface 根据 Zotero 焦点／标签状态推导，顺序为：获得焦点的上下文面板 Note、选中的独立 Note 标签页、选中的 Reader 标签页，否则为 Main。Neo 不维护可变的全局 `currentSurface`。切换活动分屏 PDF 视图不会改变 Reader Surface 身份。

| 状态切换 | 保留 | 清除、归一化或释放 |
| --- | --- | --- |
| Main 停用 | Main Persistent Selection | Main Visual 范围、待处理输入、Prefix Guide；模式恢复为 Normal。 |
| Reader 停用 | Reader session 和 Zotero PDF 状态 | Reader 激活期间的临时输入／Visual；活动批注编辑器通过保存／关闭流程交还输入权。 |
| Note 停用 | Note 身份和 yank/register | 待处理输入及 Insert 模式；模式恢复为 Normal。 |
| Note A → Note B 或编辑器宿主替换 | Zotero Note 数据 | 按 Note 条目 ID 和编辑器宿主身份重新绑定；重置 Note 模式、待处理输入和 yank/register。 |
| Reader 主 PDF 视图 → 次 PDF 视图 | 同一 Reader Surface/runtime | 只切换活动视图。 |
| Reader A → Reader B | 两个仍存活的 `instanceID` runtime | 停用非活动 Reader 的临时交互状态。 |
| Reader 关闭 | Zotero 数据 | 对账并释放该 Reader runtime。 |
| MainWindow 关闭 | Zotero 应用数据 | 释放该窗口作用域中的 Main、Note 和 Reader runtime。 |

即使上下文面板中的 Note 编辑器 DOM 由 MainWindow 承载，它仍属于 Note 交互。若复用的编辑器宿主改为显示另一条 Note，这属于身份切换，而不是原 Note 的 Neo 输入状态延续。
