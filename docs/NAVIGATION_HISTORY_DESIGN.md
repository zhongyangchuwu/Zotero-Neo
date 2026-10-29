# 统一导航执行与历史策略 {#unified-navigation-execution-and-history-policy}

Neo 为每个 Main 窗口维护一个有界导航历史。`NavigationHistoryState` 拥有位置和遍历索引；`NavigationCoordinator` 应用类型化策略，并负责接纳、分发、完成和提交。Neo 发起的操作使用 `NavigationPort.execute()`；已经运行的 Reader 原生导航通过 `observeNative()` 观察，而不是再次分发。命令行为见[导航与共享跳转历史](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist)，Reader 私有传输约束见[开发指南](DEVELOPMENT.md#runtime-architecture)。

## 目录 {#contents}

- [意图与决策](#intent-and-decisions)
- [负责方与依赖方向](#ownership-and-dependency-direction)
- [统一执行契约](#one-execution-contract)
- [单一历史策略源](#one-history-policy-source)
- [接纳、调度与完成](#admission-scheduling-and-completion)
- [Reader 来源与原生完成](#reader-provenance-and-native-completion)
- [位置与恢复契约](#location-and-restoration-contract)
- [生命周期与性能](#lifecycle-and-performance)
- [验收矩阵](#acceptance-matrix)
- [设计权衡](#design-tradeoffs)

## 意图与决策 {#intent-and-decisions}

本设计集中处理 Neo 的导航历史决策，但不改变宿主导航语义：动作和语义事件使用同一策略，操作通过同一协调器路径，适配器提供其执行路径所支持的完成证据。同步与延迟执行共用一个接口。

1. `history-policy.ts` 是动作和事件记录策略的类型化来源。未配置的动作默认使用 Ignore。
2. `NavigationCoordinator.execute()` 是 Neo 发起操作的执行和提交路径。已经运行的 Reader 原生操作通过 `NavigationPort.observeNative()` 观察，不重新分发。
3. 适配器在宿主操作开始前声明 inline、serial-navigation 或 serial-traversal 分发，并返回立即或延迟完成。任意宿主 Promise 都不能作为目的地已稳定的证据。
4. `NavigationHistoryState` 是每窗口有界栈，最多保存 100 个位置，并共用相等判断、刷新和 Reader 标签页重映射规则。
5. 每个已接纳操作都带有不可变的原因和执行所有权。延迟回调及原生生产者保留该所有权；被忽略、被取代、已完成或已释放的工作都不会变成通用原生导航。
6. 证据要求随上下文变化。宿主操作完成不等于导航转移已记录；显式 Reader 导航在启动时建立 epoch，Back/Forward 则等待已接纳的 Reader 操作完成。
7. 协调器通过直接端口连接适配器。Neo 的 Ignore 策略不会抑制 Zotero 自己的原生历史。

**范围：** 集中管理策略、导航执行／完成、来源追踪、取消及调用方迁移。**不在范围内：** 新绑定／计数语义、记录每次原生标签页点击、持久化历史、缩放／布局／Note 文本光标快照、完整 UI 回滚或外部插件 API。

## 负责方与依赖方向 {#ownership-and-dependency-direction}

```text
输入 / 能力 / 语义负责方
  解析目标、count、Surface 和确认
                |
                v
NavigationCoordinator.execute(intent, operation)
  policy -> admission -> dispatch -> real completion -> commit
       |                                      ^
       v                                      |
Main / tab / Reader / managed adapters --------+
  执行宿主操作并报告实际结果
                |
                v
Zotero / PDF.js

Coordinator -> NavigationHistoryState
               append / refresh / move / remap
```

当前模块负责方：

| 模块／负责方 | 职责 | 不得负责 |
| --- | --- | --- |
| `src/navigation/types.ts` | 无 DOM 的位置；类型化原因、意图、token、结果和完成契约 | 输入匹配或宿主执行 |
| `src/navigation/history-policy.ts` | 动作／事件记录决策、上下文条件和证据要求 | 队列、目标修改或宿主 patch |
| `src/navigation/coordinator.ts` | 接纳、分发通道、当前性、完成围栏和内部提交路径 | Picker 搜索／排序或 Reader 几何算法 |
| `src/navigation/history.ts` | 每窗口有界栈、相等判断、刷新、移动和 Reader 标签页重映射 | 原因分类或宿主调用 |
| `src/main/jump-history.ts` 中的 `MainNavigationExecutor` | 构建 Main／标签页操作，并通过 `src/main/navigation.ts`、`src/toolkit/main/` 和 View 负责方捕获／恢复文库位置；将提交交给协调器 | 历史策略或直接追加 |
| `src/reader/` 中的 Reader 功能负责方及 `src/toolkit/reader/` 私有适配器 | 语义遍历、精确视图 PDF 执行与恢复、生产者来源追踪 | 第二套遍历栈或记录策略 |
| `src/addon.ts` 和 Main 窗口生命周期 | 组合端口并附着／释放唯一导航 session | 第二个窗口注册表或跨窗口回退 |

这些是职责边界，不要求每个方法都建一个文件。MainWindowSession 仍是生命周期负责方。Reader 和 Note 通过既有组合边界使用它的导航能力；它们不会借用 Main Selection，也不会为了执行动作而重新分发 ActionId。

Reader 功能负责方选择语义目标、遍历方式和记录上下文。Reader 私有生产者传输位于 `src/toolkit/reader/history-bridge.ts`，PDF 宿主执行与恢复位于 `src/toolkit/reader/jump-host.ts`，Main 树／标签页／筛选能力位于 `src/toolkit/main/`。Toolkit 适配器暴露不透明的视图身份和宿主结果，而不是原始 SDK 对象。

## 统一执行契约 {#one-execution-contract}

以下是 `src/navigation/types.ts` 中代表性的执行和结果声明：

```ts
export type NavigationEvidence = 'settled-change' | 'native-hard' | 'managed-final';

export type HistoryDecision =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'traverse' }
  | { readonly kind: 'record'; readonly evidence: NavigationEvidence };

export type NavigationOutcome =
  | {
      readonly kind: 'completed';
      readonly evidence: NavigationEvidence;
      readonly destination?: NavigationLocation;
      readonly targetIndex?: number;
    }
  | { readonly kind: 'unchanged' | 'unavailable' | 'cancelled' | 'stale' }
  | { readonly kind: 'failed'; readonly error: unknown };

export type NavigationCompletion =
  | { readonly kind: 'immediate'; readonly outcome: NavigationOutcome }
  | { readonly kind: 'deferred'; readonly settled: Promise<NavigationOutcome> };

export interface NavigationOperation {
  readonly dispatch: 'inline' | 'serial-navigation' | 'serial-traversal';
  readonly admission?: 'replace' | 'motion';
  readonly capture?: () => NavigationLocation | null;
  readonly destinationPanel?: 'collections' | 'items';
  start(attempt: NavigationAttempt): NavigationCompletion;
}

export type NavigationResult = NavigationOutcome & { readonly recorded: boolean };

interface NavigationExecutionOwnership {
  isCurrent(): boolean;
  cancel(): void;
}

export type NavigationExecution = NavigationExecutionOwnership &
  (
    | { readonly pending: false; readonly result: NavigationResult }
    | { readonly pending: true; readonly result: Promise<NavigationResult> }
  );

export interface NativeNavigationReceipt {
  readonly source: ReaderJumpLocation;
  readonly destination: ReaderJumpLocation;
  readonly isCurrent: () => boolean;
}

export interface NavigationPort {
  execute(intent: NavigationIntent, operation: NavigationOperation): NavigationExecution;
  observeNative(receipt: NativeNavigationReceipt): void;
}
```

`NavigationCoordinator` 是 `src/navigation/coordinator.ts` 中的类；port 是面向适配器的能力，不是第二套协调器接口。`NavigationIntent` 携带原因、Surface 和可选的临时上下文。接纳时，协调器会复制并冻结原因及上下文包装；之后不能从当前获得焦点的输入处理方读取语义目标。窗口／session 当前性在宿主边界检查；精确 Reader 视图和回调所有权由适配器负责，不属于历史位置。

`NavigationAttempt` 暴露不可变 token、策略决策、当前性检查和取消。Operation ID 与历史 epoch 分开：连续 Back 请求有不同 ID，但共用一个 epoch。Reader 回调绑定和生命周期清理归作用域 bridge／适配器负责，不向 attempt 暴露公共回调绑定方法。

已完成结果带有证据，并可带目的地或遍历目标。Reader 适配器对 `native-hard` 要求精确的生产者／视图回执以及已稳定的最终几何位置；仅有几何变化并不足够。宿主操作完成与写入历史是两回事：缺少快照、位置相同或不满足证据策略时，结果可以是 `recorded: false`。意外宿主错误会被报告；过期工作不会发布当前结果。

立即完成时，协调器会同步捕获目的地。延迟结果只有在适配器报告真实完成后才结算。两种情况的调用方都收到相同形状的 `NavigationExecution`；异步 UI 调用方可以等待 pending 结果，按键分发则无需为立即导航创建 Promise。

### H/L 与选择器使用相同接口 {#h-l-and-chooser-use-the-same-interface}

- `H/L`：解析相对标签页操作并立即调用 `execute()`。
- 选择器：打开／查询／浏览不会调用 `execute()`；语义确认会提供选中的标签页操作和原始 Surface。
- 两者使用相同的标签页适配器和切换后的维护流程。适配器同步检查实际选中的 ID，并负责相对或绝对选择后的 Reader 重扫／焦点维护。
- 历史在执行时捕获来源，而不是在选择器打开时捕获。候选 provider 只提供数据。

## 单一历史策略源 {#one-history-policy-source}

`history-policy.ts` 包含类型化动作规则、事件规则和具名谓词。策略决策为 Record、Ignore 或 Traverse。Record 规则还声明所需完成证据：`settled-change`、`native-hard` 或 `managed-final`。源位置捕获前先通过原因／上下文／路径进行低成本资格检查；完成后，内部提交会按证据要求检查回执。Traverse 是语义角色，不能通过一个 flag 转换成追加。

例如，`mainNavFirst` 仅在意图指向 Main 的 Items 面板时记录；该操作仍会移动条目游标，但不会决定这次移动是否进入历史。相同 ActionId 可按上下文／路径使用不同规则：Main Items 中的 `findNext` 使用 `settled-change`；Reader 搜索路径使用 `native-hard`。

按原因与上下文划分的默认记录策略：

| 原因 | 上下文／时机 | 默认策略 |
| --- | --- | --- |
| `previousTab`、`nextTab` | Main／Reader／Note 中实际切换已选标签页 | Record |
| `switchTab` | 只在选择器确认成功时 | Record |
| `mainNavFirst`、`mainNavLast` | Main Items；不包括 Collections | 在 Items 中 Record |
| `findNext`、`findPrevious` | Main 可见行重复操作／Reader 支持的搜索目标 | Main：稳定变化；Reader：仅拥有的原生硬点 |
| `main-local-find.confirm` | Main Items：Enter 提交查询并移至首个匹配项 | Record |
| `mainOpenPDF` | Main Cursor 或捕获的 Note 上下文目标 | 导航成功后 Record |
| `mainActivate` | Items 打开 Cursor；Collections 的 Enter 确认树游标范围 | 任一面板中的范围稳定变化后 Record |
| `findAllItems`、`findCollectionItems`、`findNotes` | 语义选择器确认，而非 provider／查询活动 | Record |
| `findCollections` | 已确认的 Main 分类候选，而非 Picker 查询／浏览 | 原生范围选择稳定后 Record |
| `main-selection-panel.reveal` | 由本次面板调用显示可用成员 | Record |
| `firstPage`、`lastPage` | 受支持的显式 Reader 页面路径 | 在拥有的原生硬点 Record |
| `prevAnnotation`、`nextAnnotation` | 受支持的 Reader 目的地，而非仅改变选择 UI | 在拥有的原生硬点 Record |
| `followLink` | 确认的内部／引文目的地；排除外部 URL | 在拥有的原生硬点 Record |
| `reader-mark.jump` | 一次受管理的 mark 跳转；设置／删除／浏览除外 | 在受管理的最终目的地 Record 一次 |
| `reader-native.hard` | 选中 Reader 标签页中的非临时、非 Neo 所有原生目的地，包括 Zotero 原生 Outline 导航 | 在符合条件的原生硬点 Record |
| `navigateBack`、`navigateForward` | 有 count 或无 count 的遍历 | Traverse，绝不追加 |
| Main 条目树 `j/k`、Reader `h/l`、滚动／视口移动 | 可导航的普通移动 | 默认 Ignore |
| Main Collections `j/k`、首／末项和展开／折叠 | 未显式确认的树游标／范围移动 | Ignore |
| 原生标签栏选择／关闭、未确认的原生范围／筛选变化 | 当前不是独立跳转事件 | Ignore |
| Selection／文本光标编辑、缩放／布局、批注／标签／条目修改、临时界面打开／浏览 | 不是导航目的地 | 不配置记录规则 |

对于分类目的地，Collections 面板中的 `mainActivate` 是在树游标上按 Enter。接纳时会同步捕获原生范围 ID（包括文库根和已保存搜索），而不是行号或之后的游标。原生选择在串行通道中仍按需执行，并在轮到该请求时捕获离开位置。`findCollections` 只记录已确认的候选项；两者都使用原生范围选择完成状态，只有 Zotero 的 `onCollectionSelected()` 与已渲染 Main 条目视图确认目标范围一致后，才算有效转移。打开或搜索 Picker 本身不构成一次访问。

分类树中的 `j/k`、首／末项和展开／折叠不会追加历史。原生单范围树移动可能在 Enter 前改变实际 Scope，因此 Main 只把移动前的 Library 位置保留为后续 `mainActivate` 的潜在来源。只有当焦点 epoch、历史 revision、选中标签页 ID 和预期原生 Scope ID 都未改变时，才重用该快照。仅为了确保已有树焦点而展开／折叠，不会开启新的焦点 epoch；显式焦点命令和实际原生焦点变化仍会划分访问。Enter 确认的范围变化只有在原生范围选择完成后才符合新访问条件；围栏不匹配时不重用快照，而是捕获当前实际位置。

没有可执行 ActionId 时使用具名事件；不要为了匹配策略而虚构 ActionId。延迟选择器回调携带其语义动作原因。链接提示激活携带负责它的导航原因；原生 Outline 操作遵循 Zotero 原生导航并使用现有 `reader-native.hard` 观察。

Reader 默认使用硬点证据，并不表示表中每条命令都会产生硬点。在检查过的 Zotero 10.0.5 源码中，搜索的 `_onNavigate` 调用 `navigateToPosition()`，但不保存硬点；`setSelectedAnnotationIDs()` 更新选择，却不声明目的地。这些路径可能成功完成但不产生历史记录。其适配器返回真实完成／无操作结果并保留所有权；除非修改证据规则并建立该路径的完成／来源契约，否则不会推断出 `settled-change` 历史项。

规则控制的是**转移**，不是某个位置是否可能出现在历史中。被忽略的移动可以确定之后一次已记录跳转的实际离开位置；该位置可以成为后续跳转的来源。

### 仅修改策略时的要求 {#what-a-policy-only-edit-must-do}

关闭 Record 时：

1. 使用相同目标／count 执行相同宿主操作。
2. 不为该操作追加历史，也不截断 Forward 后缀。
3. 保留显式操作的取消／当前性规则；关闭记录不使旧宿主工作复活。
4. 保留 Zotero 原生历史。不能通过向普通宿主命令传入 `skipHistory` 来实现 Ignore。
5. 保持原生／临时基线更新，使后续跳转和离开位置刷新使用实际位置。
6. 在所有已发出的子完成事件结算前保留所有权来源。停用的 Reader 动作不能以 `reader-native.hard` 重新出现。

只有当现有适配器实现了真实完成信号／来源捕获时，才可将默认忽略的**可导航**移动提升为 Record。Main 行移动可以同步完成；Reader 翻页／滚动需要自己的完成信号，即使它不会产生硬点保存。适配器支持的路径必须和所配策略一起验证。不能仅在表中添加一个 ID 就把非导航修改变成导航。新增导航类别需要接入一个适配器；修改已接入类别的策略只需改策略文件。

不受支持的 `gg/G` 使用现有滚动回退。默认页面规则要求走显式页面路径，因此回退不会因此获得硬点记录或跳转接纳围栏。count 和宿主目标验证保持不变。

## 接纳、调度与完成 {#admission-scheduling-and-completion}

需要区分四项决策：

1. **策略：** 这次已完成的转移是否应追加到历史？
2. **接纳：** 该意图会取代哪些较早操作的所有权？
3. **分发：** 宿主操作能否立即执行，还是必须等待窗口串行通道？
4. **完成：** 何时能取得真实结果？

延迟结果不代表必须排队。Reader 页面导航可以立即开始，之后再完成。H/L 和确认标签页选择是立即且同步的。Main 打开条目／在文库中显示条目则通过串行通道延迟执行。适配器必须在调用 thunk 前声明分发通道；执行 thunk 后再看它是否返回 Promise，已来不及决定如何调度。

### 立即执行路径 {#immediate-path}

评估规则和低成本上下文检查；仅在需要时捕获来源；执行操作；验证当前性；返回前捕获／提交目的地。此路径不会无条件 `await`。

对于同步的 `A -> B -> C`，第一次执行必须在第二次将标签页改为 C 前捕获 B。普遍 await 会允许 `A -> C`，从而丢失中间目的地。

### Main 串行路径 {#serial-main-path}

排队前接纳请求并分配版本，但只能在请求轮到执行时捕获其离开位置并调用 thunk。等待中的请求若被取代，就不会执行。已经运行的过期宿主调用仍须排空，然后才能开始下一项串行宿主操作；其实际部分 UI 效果会成为下一项操作的离开位置。被拒绝的结果不能污染队列尾部。

取消不等于回滚，也不能证明原生工作已停止。过期或已取消的根不能提交；在串行正确性需要时，仍要跟踪宿主操作实际排空。

### Reader 启动与遍历围栏：有意采用统一规则 {#reader-launch-and-traversal-fences-deliberate-normalization}

已接纳的显式 Neo Reader 跳转会在启动时建立窗口 epoch，与 Main 跳转相同。即使新动作关闭了历史记录，也会取代较早的显式工作。Reader 宿主调用仍立即分发；延迟完成会为后续 Back/Forward 登记围栏，但不会排队等待跳转本身。Back/Forward 等待该操作的真实结果，再根据更新后的历史计算目标。这将启动时的取代规则与记录策略及排队宿主分发区分开。

普通的默认 Ignore 移动仍走不建立 epoch 的快速路径。除此之外，现有 Reader 输入切换必须在任何普通／未绑定／前缀按键时退休正在执行的 mark。执行所有权取消与历史 epoch 推进不是同一件事。

### 遍历 {#traversal}

连续 Back/Forward 请求共用已接纳的 epoch，并按串行方式执行。在实际执行时刷新离开位置并计算目标索引。新的显式导航会使该批请求失效。只有当前且完全成功的恢复才会移动索引；遍历及其原生回声都不会追加历史。

### 根状态与至多一次提交 {#root-state-and-at-most-once-commit}

```text
admitted -> waiting -> running -> settling -> completed / unchanged / failed
    |          |          |          |
    +----------+----------+----------+----> retired / stale

running/settling retirement may still require host drainage
completed/retired ownership is never reclassified as native
```

一个根有唯一 Operation ID、epoch、原因、上下文标记、记录决策及终结／提交状态。原生子生产者继承该根，不会创建额外历史根。完成时按情况验证窗口／session、目标标签页／条目、视图身份、调用代次及 epoch。每个根最多成功提交一次。

原生观察在完成时接纳窗口工作：生产者 ticket 在调用时捕获来源、视图和原生原因，但只有符合条件、已变化且仍当前的完成才能接纳原生历史根并取代窗口工作。拥有 ticket 的操作即使原 epoch 已结束也不会变成这样的根。后台／冷启动观察只更新基线。原生观察与显式 Neo Reader 跳转调度分开，但共用内部提交路径。

## Reader 来源与原生完成 {#reader-provenance-and-native-completion}

延迟的原生保存不会标明是哪一个 Neo 动作引发它，因此 Reader 传输需要跟踪生产者和回调所有权。本文引用的私有方法固定基于 Zotero 稳定版 **10.0.5** 和 Reader 子模块 `9d821fa2c1941bdfdd7bee3199936401b45be852`：[PDF 视图源码](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-view.js)和[查找控制器源码](https://github.com/zotero/reader/blob/9d821fa2c1941bdfdd7bee3199936401b45be852/src/pdf/pdf-find-controller.js)。这只标识被检查的源码版本，不代表已经通过当前宿主验收；每次支持的宿主更新都要重新验证私有假设。该版本中，PDF `navigate()` 会调用 `_pushHistoryPoint()`，但不等待其完成。该生产者等待滚动稳定，读取真实 PDF XYZ 几何，再保存原生历史；因此 `await navigate()` 不能作为目的地已稳定的证据。搜索使用 `_findController`，而不是上游 master 的较新分组导航／搜索 API；bridge 会将硬点保存关联到精确生产者的终结完成，而不是根据 `navigate()` 或全局保存队列推断。

来源追踪必须遵守以下协议：

1. 以不可变 token 开始操作，并在正确的适配器边界捕获来源。
2. 在注册／调用所有权边界将 Neo 异步回调绑定到该 token。回调绑定只在回调同步执行期间恢复来源；不能借用视图上最新的 token。
3. 在原生历史**生产者调用时**创建生产者 ticket，携带继承的操作 token、精确视图／历史身份和生产者生命周期。无所有者的生产者调用属于原生原因；已退休但曾拥有所有者的调用仍属已拥有且必须拒绝。
4. 原生生产者只委托执行一次，并保留原 receiver、参数、返回值／Promise 身份及拒绝行为。生产者真实结算，而不是 `navigate()` 的解析，才是原生完成围栏。
5. 继续观察原生保存载荷，以保留真实硬点／临时几何。只有绑定来源的完成回执才能完成 Neo 根或原生根；原始保存观察器不是另一条历史追加路径。
6. 受管理的 marks 拥有中间生产者，并只报告一个最终目的地。恢复生产者是 Traverse 子项。已完成、被忽略、已取消或已退休的子 ticket，在原生工作结算前都不能记录。
7. 释放时移除拥有的监听／patch 并退休回执。晚到回调不能使用其他窗口／视图，也不能回退到通用原生记录。

主、次视图都会被观察。原生资格要求所属 Reader 标签页处于选中状态，不要求具体分屏视图当前获得焦点。后台标签页的原生保存仍照常发生，但不会追加历史或取代活动窗口工作。

### 固定路径与完成矩阵 {#pinned-route-and-completion-matrix}

| Zotero 10.0.5 检查源码中的路径 | 源码行为 | 适配器所有权／完成边界 | 默认记录证据 |
| --- | --- | --- | --- |
| `navigate({ pageIndex / position / annotationID })` | 直接开始移动，并在第一次 await 前调用 `_pushHistoryPoint()`；不会等待该生产者 | 在生产者调用时建立作用域；将生产者自身的终结 Promise 边界与其精确视图硬点保存回执关联 | 原生硬点；没有匹配回执则不记录 |
| `navigate({ dest })`、outline/hash／内部链接服务 | `goToDestination()` 可能异步解析目标；仅观察到周边保存不能证明该路径的目标 | 将发起方作用域沿着拥有的链接／回调工作传递，并要求精确生产者报告已稳定的最终目的地 | 原生硬点；没有拥有的回执则不记录 |
| `navigate({ pageLabel / pageNumber })` | 移动和生产者调用前只等待一次 `_pageLabelsPromise` | 临时为精确可写字段设置请求专属的 native-realm thenable；立即恢复原值；在 PDF continuation microtask 中传递不可变所有权 | 原生硬点 |
| `findNext()` / `findPrevious()` | `find(state)` 保存精确请求对象；`_onNavigate(pageIndex, matchIndex)` 等待匹配数据后调用 `navigateToPosition()`；检查过的路径没有硬点 | 精确请求身份和绑定的原生回调保留发起方作用域；独立等待真实搜索／滚动完成，不以硬点证据代替 | 仅原生硬点；搜索可以完成但不记录 |
| `setSelectedAnnotationIDs()` 和批注导航回退 | 选择 setter 更新选择但不声明目的地；`navigate({ annotationID })` 可能使用硬点生产者 | 仅选择结果不报告目的地；真实导航使用自己的生产者回执 | 原生硬点，不能只凭选择记录 |
| 受管理的 mark 跳转／历史恢复 | Neo 拥有跳转过程、当前性检查和最终几何 | 受管理 mark 报告一个精确视图最终目的地；恢复生产者属于 Traverse 子项 | 受管理的最终结果／Traverse |
| Reader 翻页或 Neo 平滑滚动 | 没有通用硬点回调；Neo 的平滑滚动持有其真实停止状态，精确视图提供原生滚动稳定信号 | 默认 Ignore 的移动走无历史路径；提升策略的受支持移动等待实际负责方和精确视图稳定／捕获 | 默认 Ignore；提升后使用稳定变化，绝不伪造硬点保存 |

bridge 包装精确的原生生产者，并保留原 receiver、参数、返回值、Promise 身份和拒绝行为。固定版本的 SDK 生产者等待 `debounceUntilScrollFinishes()`，并在原 Promise 完成前立即调用终结的 `_history.save()`。原生硬点通过 PDF `queueMicrotask` 发布／清除边界发出；回执通过**直接**的 `original.then` 终结回调关联，而不是 Promise adoption、FIFO 队列、保存数量或匹配 XYZ 猜测。同步生产者保存由生产者调用帧处理。回执标记包含精确 patch、窗口、历史和视图身份；捕获的硬点目的地必须与稳定后的最终几何相符。

标签页导航使用另一个固定私有接口：`_pageLabelsPromise` 是自有且可写字段，SDK 在移动和生产者调用前恰好 await 一次。请求专属的 native-realm thenable 使用 PDF continuation microtask 传递不可变调用身份；原字段会立即恢复。嵌套标记会解包到原 Promise；精确 patch／窗口／历史／视图标记会拒绝已退休的 continuation。不复制标签解析器，也不 patch 全局 Promise。

拥有的请求／回调作用域只会在其注册工作期间携带不可变操作 token。已关闭、被忽略、被取代或已退休的拥有作用域仍视为已拥有并拒绝；绝不回退到 detached-native 规则。原始保存观察只更新原生／临时基线，不是提交入口。真正脱离 Neo 的原生生产者只有在所属 Reader 标签页被选中且精确回执仍有效时，才能通过 `NavigationPort.observeNative()` 进入历史。分屏焦点不影响资格。若没有 Main navigation port 或精确所有者，bridge 不会伪造 Main token／历史。拥有的传输路径不受支持时会拒绝，而不是回退到通用原生记录。

默认忽略的普通翻页或 Neo 平滑滚动若被提升为 Record，会使用移动负责方的真实完成信号和精确视图稳定／捕获。平滑按住操作在滚动器的停止回调中完成。不要伪造原生硬点保存；原生硬点观察必须独立于记录策略。

## 位置与恢复契约 {#location-and-restoration-contract}

复用现有无 DOM 位置：

- Library：范围 ID、Quick Search 文字、标签、高级搜索是否存在、稳定 Cursor 条目和面板。
- Reader：稳定的文库／条目身份、标签页查找提示，以及可选的精确主／次视图页码与 top/left。
- 其他／Note 标签页：标签页身份及原生保留的位置。

不增加持久 Main Selection、缩放／布局、Note 文本光标或对已丢失高级搜索条件的虚构重建。沿用现有精确相等规则和 100 个位置上限。只有身份的 Reader 记录可以补全；冷加载不算另一种跳转。

恢复使用相同协调器和适配器，并建立 Traverse 根。重用可读取的已关闭附件，并重映射所有匹配的历史标签页提示。只有受管理的恢复会抑制原生历史；普通命令的 Ignore 策略不会抑制原生历史。

Library 恢复按以下顺序执行：标签页、范围、Quick Search、标签、高级搜索可用性、Cursor、焦点。失败时索引保持不变，但不会撤销此前的 UI 变化；应如实报告部分完成／过期状态。

Main ScopeSet 非空时，范围选择与恢复会等待面板的规范 `onCollectionSelected()` 完成，而不只依赖选择事件或 ID 匹配。系统将已稳定的选中 ID 与原生 `itemsView.collectionTreeRows` 比较；选择还会等待条目 View 加载，历史恢复则会在应用筛选、Cursor 和焦点前等待该加载完成。被替换的 pane／view 或不匹配的渲染范围不能算成功访问。

效果和反馈边界都要检查当前性：

- Selection Panel Reveal 只能关闭或更新发起它的面板调用，不能操作后来重新打开的面板。
- Reader 恢复时的几何验证和最终焦点使用相同的精确视图／窗口身份。视图被替换时应返回 Stale/Unavailable，而不是成功移动索引。
- 选择器回调保留发起 Surface 和目标上下文，即使焦点后来移到查询框也不改变。

## 生命周期与性能 {#lifecycle-and-performance}

- 每个 Main 窗口只有一个导航 session；Reader 或协调器不另建 session 注册表。窗口释放会使 epoch 失效并丢弃历史。
- Reader 视图替换会退休绑定该视图的工作，只恢复 Neo 自己拥有的 patch。不能覆盖其他组件后来设置的 patch。
- Token 是内存引用／ID，不会持久化为历史，也不会把 chrome 对象传入 content。宿主载荷继续由现有适配器克隆；原生调用使用 chrome `Reflect.apply`。
- 即使关闭记录，也要更新硬点／临时基线。原生调用、结果、异常和原生历史均保持不变。
- 默认忽略的移动只做低成本策略／路径检查，并使用现有执行器；不会为每次普通动作额外创建完整文库／PDF 快照、历史数组副本、Promise 或专用完成观察器。复用已安装的视图观察，不要每按一次键就安装监听器。关闭记录时，拥有的原生工作仍需来源追踪；只在执行所有权需要时分配延迟回执／token，不为每次普通移动创建完整历史快照／完成流水线。
- Operation 与生产者元数据只在工作待完成期间存在，并在完成、取消或释放时清理。

## 验收矩阵 {#acceptance-matrix}

| 场景 | 必须观察到的结果 |
| --- | --- |
| Inline H/L `A -> B -> C` | 第二次命令前捕获 B；历史遍历 A/B/C，而不是 A/C。 |
| 打开／浏览／取消选择器或选择当前标签页 | 不产生新记录；Forward 后缀保留。 |
| 确认更换标签页 | 与 H/L 使用相同策略和提交路径，只记录一次，并共用切换后维护。 |
| 对 H/L 或 Reader 页面动作关闭 Record | 宿主导航保持不变；不追加／截断历史；原生历史不变；不回退到通用原生路径。 |
| Main Items 与 Collections 中的 `gg/G` | 由一条中央上下文规则决定记录；count 不变。 |
| Main 提示框确认与 `n/N` | 具名确认原因与动作重复原因各自生效；未命中／空结果／取消行为不变。 |
| Reader 搜索／批注选择完成但没有硬点保存 | 明确报告完成／无操作；默认硬点策略不追加，也不无限等待。 |
| 主动启用 Reader 非硬点目的地 | 只在修改中央证据规则后记录已验证且有所有权的目的地，不虚构原生保存。 |
| 搜索回调重入／原生搜索替换请求状态 | 保留正确的不可变请求所有权，或明确拒绝过期请求；不借用最新 `_state` 作为原因。 |
| 默认忽略的移动 | 不为历史额外捕获快照／创建 Promise；之后记录的跳转使用真实离开位置。 |
| 按策略提升的受支持移动 | 真实稳定目的地可被记录，不增加逐命令历史包装，也不伪造原生保存。 |
| 两个 Main 请求排队 | 被取代的等待请求不执行；正在运行的过期宿主工作排空；最新请求在启动时捕获真实离开位置。 |
| Main 或 Reader 跳转待完成时执行 Back | 等待真实完成后再计算目标；不产生虚构目的地。 |
| 快速连续 Back/Back 或 Forward/Forward | 共用 epoch、按序计算目标；不自我失效或自行记录。 |
| 较早 Main 工作期间开始新的显式 Reader 跳转 | 遵循已说明的启动时取代规则；较早结果不能追加或声称成功。 |
| 被忽略／过期／已完成根的晚到原生生产者 | 原生操作仍执行；不新增历史，也不重新归类为原生操作。 |
| 拥有的延迟工作期间发生原生 UI 导航 | 使用它自己的原生原因／当前性，而非拥有动作的策略；来源／目的地正确。 |
| 当前 Main port／精确所有者缺失时发生脱离的原生工作 | 不伪造 Main token 或历史；不支持的拥有传输应拒绝，不回退到通用原生路径。 |
| 生产者完成顺序反转 | 保留正确的不可变所有权或明确拒绝过期结果；不使用 FIFO／超时／XYZ 归因。 |
| mark 跳转期间有新的普通 Reader 输入 | 成功时只记录最终位置；普通输入可退休 mark 所有权，无需改变历史 epoch。 |
| 已选 Reader 中未聚焦的次视图 | 符合条件的原生目的地仍可记录；精确保留 pane。 |
| 已关闭但仍可读取的 Reader 目标 | 在同一窗口重新打开附件，恢复正确 XYZ／pane，重映射所有标签页提示，不创建重复标签页。 |
| 几何验证后、焦点设置前 Reader 视图被替换 | 返回 Stale/Unavailable，索引不变，不把焦点移到替代视图并声称成功。 |
| 待处理期间 Selection Panel 关闭并重开 | 旧完成回调不能关闭／更新新调用。 |
| 标签页／条目／范围／几何／条件集合缺失 | 明确报告 unavailable／partial，索引不变，不虚构快照。 |
| 窗口／视图释放 | 不追加历史、不复活旧状态、不跨窗口回退、不泄漏回调或 Neo 所有的 patch。 |
| 原生调用拒绝或保存捕获失败 | 保留原结果／拒绝语义；不提交历史；诊断不能破坏宿主执行。 |

永久测试应检查位置／顺序／目标／当前性结果以及真实适配器／观察器组合，而不是源码字符串或对包装函数的调用。切换策略的测试必须同时断言导航效果保留且历史行为改变。

## 设计权衡 {#design-tradeoffs}

共享操作和证据契约避免了几种看似方便但有风险的做法：

- 同步与异步历史使用不同 API 会迫使调用方选择存储机制；单一操作契约允许适配器报告立即或延迟完成，而无需更改记录路径。
- 无条件等待宿主操作可能丢失立即发生的来源／目的地顺序，也不能证明 Reader 原生目的地已稳定。
- 每个 ActionId 一个布尔值，或只用于文档的策略表，无法表达上下文、确认事件、原生原因，也无法在提交时强制证据要求。
- 同时记录 Neo 所有的 Reader 完成和原始原生保存可能产生重复根，并让关闭策略的工作看起来像通用原生导航。
- 视图全局的当前动作、任意计时器、FIFO 生产者队列或按 XYZ 匹配，都无法可靠归属延迟／并发生产者；所有权应绑定到精确生产者和视图。
- 原生 `skipHistory` 不是 Neo 的 Ignore 策略，因为它会改变 Zotero 自己的历史。
- 第二套 Reader 栈、通用事件总线／完成引擎、全局 Promise patch 或复制的原生导航实现会重复状态或有改变宿主行为的风险；直接端口和窄适配器可以保留原调用。
