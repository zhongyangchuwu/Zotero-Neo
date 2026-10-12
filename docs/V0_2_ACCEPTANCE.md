# v0.2 候选验收指南

本指南是候选验收执行协议，不是已经通过的验收报告。当前公开版本仍为 v0.1.0；v0.2.0 候选包属于仍为 draft 的 [PR #143](https://github.com/zhongyangchuwu/Zotero-Neo/pull/143)，未发布。本 main-derived 网站树的 manifest 仍为 `0.1.0`，不包含该候选包或其发布元数据。网站主页见[首页](../index.md)，公开版安装与首次使用见[开始使用](GETTING_STARTED.md)；不维护平行的网站文案副本。

截至 [Issue #137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137) 的记录，候选 source `bfda2cdaae4b6233cf69309325a6e37d12de08ca` / XPI SHA256 `687c291d32310ddb971a495f918b79f11a7517949c945bd31519239aac8ffab2` 已在 Windows Zotero 10.0.6 隔离 profile 中完成原生持久安装、真实公开 v0.1.0 → 候选升级/重启及受信任 Gecko 的 per-view 路由观察。这些证据属于 PR #143 的包，不是本分支源码构建。物理 OS-IME 候选确认、组合态 Escape/Backspace、人工剪贴板和 Outline Enter/Return 仍为 **NOT PERFORMED**；#137 仍开放。此文不预填 PASS；未执行的项目始终写 `NOT PERFORMED`，不能用 CI、DOM composition、可信事件注入、桥接安装或宣传录像代替真实结果。

## 1. 固定候选与边界

每轮先记录：候选完整提交 SHA、XPI SHA256、Neo 版本、Zotero 完整版本、操作系统、键盘布局、输入法名称、profile 和数据目录、是否为持久安装。支持范围仍是当前最新稳定 Zotero；清单不承诺旧 major 或 Beta。

下面的构建与包检查命令只适用于实际包含 v0.2.0 候选元数据的准备分支 / PR #143，不适用于本 main-derived 网站树；在本树上运行不能产生或验证那个候选包。原生候选安装与升级观察已记录于 #137，不应把本协议误作它们尚未执行的证据。

在候选准备分支构建和检查：

```bash
npm ci
npm run build
node tools/check-package.mjs
node tools/check-release.mjs v0.2.0
sha256sum zotero-neo.xpi
```

Windows 可使用仓库的 PowerShell 构建入口，包哈希使用：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
Get-FileHash zotero-neo.xpi -Algorithm SHA256
```

以上检查只证明构建、包成员和版本／更新元数据的一致性。候选 `updates.json` 中 v0.2.0 的资产地址是准备发布的目标地址，不是已存在的公开下载入口。候选身份与实际观察见 draft PR #143 和 [#137 验收记录](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137)；公共 v0.1.0 包仍从[已发布资产](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi)取得。

过去源码仍标记 0.1.0 时的安装／外部高版本夹具，不等同于“官方发布 v0.1.0 → 最终 v0.2.0 包”的实际升级。最终候选包的版本变化也使整个 XPI 哈希变化；不能继续把旧包的人工结果无条件标到新包上。

## 2. 建立安全的验收环境

使用新的 profile 和独立数据目录，不使用日常库、同步账户、共享数据库或旧任务已经删除的临时目录。官方说明：[多 profile](https://www.zotero.org/support/kb/multiple_profiles)、[数据目录](https://www.zotero.org/support/zotero_data)。

1. 关闭正在使用的 Zotero。通过实际 Zotero 可执行文件加 `-P` 打开 Profile Manager，创建具名验收 profile。例如 Linux 使用 `zotero -P`，macOS 使用 `/Applications/Zotero.app/Contents/MacOS/zotero -P`；Windows 对实际安装的 `zotero.exe` 使用 `-P`。不要把安装路径误当作 profile 路径。
2. 创建两个分别用于“干净安装”和“旧版升级”的新 profile，名称应带本轮日期／唯一后缀，不复用旧临时名称。
3. 在每个验收 profile 中，通过 Zotero Settings → Advanced → Files and Folders 选择新的空数据目录，并重启。使用 **Show Data Directory** 核实实际路径。新 profile 不保证一定自动获得独立数据目录。
4. 若首次打开已显示真实资料库，立即停止操作并关闭实例，先按官方流程完成数据隔离；不导入、删除、改名或同步真实资料。
5. 不登录同步账户。只导入有授权／公有领域的 PDF，或者自己制作的测试文档。不把私人 PDF、笔记、窗口标题或剪贴板内容录进视频。
6. 使用原生 Add-on Manager 持久安装 XPI。此轮不运行 `npm run dev:start` / `npm run dev`，不混用同 ID 的临时 RDP 加载和持久包；临时加载不能证明安装／升级。

`npm run dev:setup -- --profile ...` 只为已注册且已存在的开发 profile 配置 RDP，当前工具不提供 `--data-dir` 或 `--port` 参数，也不替代上面的数据隔离和持久包验收。技术排查需要 RDP 时，另建开发 profile，遵守[开发指南](DEVELOPMENT.md#local-gui-iteration-from-wsl)。

### 最小数据集

只在验收库中建立以下原生 Zotero 数据：

- 文献 A，附一份可选中文／英文文本、至少两页、至少两个原生 Outline 条目的 PDF；有条件再提供真实 Figure/Table 结构。
- 文献 B 及其 PDF，用于证明跨 Reader／Main 目标不会串用。
- A 的两条已有笔记、B 的一条已有笔记，A/B 中各有一条同名笔记；正文包含分段和少量格式。
- 文献 C，无子笔记；一条独立笔记；两个测试集合；两个可删除的测试条目。
- 可选：已安装且可正常工作的 Better BibTeX／Translate，或一个可安全停用且有注册设置入口的测试插件。未安装时写明条件缺失，不伪造结果。

建立数据可以使用 Zotero 原生界面。它是测试准备，不是“Capture 自动创建笔记”功能。

## 3. 安装和升级

### U1：干净安装 v0.2.0

1. 在干净验收 profile 中打开 Tools → Plugins／Add-ons，通过 gear 菜单选择 Install Plugin From File，安装候选 XPI；按提示重启。
2. 在插件列表核实 Neo 版本为 `0.2.0`，不是仅修改了文件名的旧包。
3. 在 Main 条目列表 Normal，按 `:` 打开 Command Palette；只有一个面板，输入查询和取消正常。
4. 用 `<Space>ps` 打开 Settings，查看 Reader、Main、Note 和本地控件的实际上下文；Reader 不出现 Insert，Note Insert 保留。
5. 在配置编辑器核实 `extensions.zotero-neo.bindings.schemaVersion` 为 `18`。本轮不凭修改 schema 数值制造升级结果。
6. 关闭并重启该 profile，再执行一次入口命令；没有重复面板或遗留旧代键处理。

**通过标准**：持久版本正确、默认功能入口可用、配置上下文正确、重启后只有一个当前操作所有者。单凭“插件列表显示启用”不算功能通过。

### U2：官方 v0.1.0 → 候选 v0.2.0

在升级 profile 中先安装上面的官方 v0.1.0 资产并重启，不能使用最近源码改了版本号的外部夹具冒充旧发行版。

官方 v0.1.0 的[偏好源码](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/src/core/preferences.ts)使用 binding schema `11`，当前候选为 `18`。记录真实安装后观察值，不手工把 schema 改成 11 来伪装来源。

在**仅属于升级验收的 profile**里保存现有 `extensions.zotero-neo.bindings` 原值，再通过旧版配置／高级配置编辑器加入以下明确夹具，确保不覆盖其他已有 override：

```json
{
  "reader-normal:Q": "scrollDown",
  "reader-normal:j": null,
  "reader-insert:x": null
}
```

- `Q` 是大小写敏感的独立可打印键，测试有效的自定义 Reader Normal 映射。
- `j: null` 是明确取消默认，不是缺失值。先在旧版核实自定义 `Q` 可执行、已取消的 `j` 不再触发 Neo 滚动。
- `reader-insert:x` 是要退休的保存数据；升级后应按已批准的迁移删除，不把它视为候选的有效模式。
- 在旧版 Reader 插入／评论入口设置或高级配置中将 `extensions.zotero-neo.mode.insert.enabled` 设为 `false`，记录原值。使用任一无关验收偏好或一个已存在的语言／滚动设置作为保持不变的对照。

然后执行：

1. 先关闭旧版 Reader；在同一个仍运行的升级 profile 中，用原生插件管理器安装候选 0.2.0 包，按安装结果要求退出／重启 Zotero。不要先退出整个程序后再要求在已关闭的窗口里安装。
2. 核实插件版本 0.2.0、schema 18、自定义 `Q` 的行为和 `j` 的明确取消均保留；原保存的无关设置未丢失。
3. 核实旧 Reader Insert 行消失，其他上下文映射／取消仍在；不是把全部配置重置为默认。
4. 核实新的 `extensions.zotero-neo.annotationCommentEditor.enabled` 为 `false`，旧 `mode.insert.enabled` 清除；Reader Normal `i` 是原生 passthrough 所有者，Escape 退出它，不产生 Reader Insert 模式。
5. 再重启，重复版本／映射／取消／开关检查，确认第二次迁移不改变结果。
6. 另一个独立升级夹具可以测试“旧 key=false，已经存在的 canonical key=true”：候选应保留 canonical true，再清除旧 key。明确这是预设冲突夹具，不是已公开旧版提供了新的设置开关。

**通过标准**：原生升级真实发生，数据和用户意图保留，退休范围仅删除被批准的数据，canonical 优先级正确，重启后仍一致。失败时保留实际 before/after 偏好，不先 Reset 掩盖问题。

## 4. 每个 Surface 和视图的一次动作

默认键位用于这一组；U2 的自定义键位／取消夹具单独记录，不能把已经取消的 `j` 当作默认失效。

### U3：Main 与 Note

- Main 条目列表 Normal：只按一次 `s`，检查一个当前目标进入 Selection；没有重复切换、第二个意外目标或额外 Cursor 运动。移动 Cursor 后按 `o`，只打开 Cursor 条目，不借用已有 Selection；返回 Library 后 Selection 保留。
- 用 `<Space>ss` 检查可见／隐藏成员。用 `v` 建立 Visual，Escape 取消，不清空已有 Selection。
- 开启 **Note editor Vim mode** 后进入一条测试笔记。Normal `i` 进入原生 Insert，输入并切到另一笔记；新 Note item/editor identity 不继承旧的 pending input。使用已有 Note motion 或 native text/undo 时，没有额外键字符或重复编辑。
- 在 Note Insert 或 native editable 中输入文字／操作剪贴板，不把它当作 Main/Reader Normal 命令。

### U4：Reader primary / secondary

1. 打开 A PDF，等待 Neo 的 Reader 交互可用；建立水平或垂直 split。固定窗口大小、缩放和滚动设置，拍到两侧位置。
2. 焦点在 primary PDF，轻按并释放一次默认 `<C-d>`，观察一次配置预期的半页运动；secondary 不移动，不出现另一个工具／面板动作。
3. 把实际焦点切到 secondary，重复一次；primary 不受影响。键盘 auto-repeat／长按不是这个用例。
4. 在每侧执行一次 `<Space>ro` 并回到 PDF，再执行 `[s` / `]s`；当前视图变化正确，没有一次按键触发两次跳转或改变另一侧。
5. 关闭 secondary，保持 primary 可操作；关闭 Reader 再重开，等待新视图可用后重复一个动作。
6. 用原生插件管理器禁用／启用 Neo 后，再分别观察 Main 和当前 Reader 动作；不要同时保留临时 RDP 版本。

**通过标准**：实际 focused owner 可解释每次动作，活跃视图、关闭／重开和禁用／启用后只有一个当前所有者。只看 bridge “安装成功”或一个 overlay 的数量，不等于一次动作已被证明；若录像无法区分次数，就保留该项目未确认，并收集实际诊断，不猜 PASS。

## 5. 真正的输入法和原生键

### U5：文本输入的真实 OS IME

对 Flash 查询、评论 textarea、Picker 查询分别执行下列操作。使用真实键盘、真实 OS 输入法，录屏范围包含候选窗和当前输入框：

1. 输入一段能出现多个候选的拼音／其他输入法文本，不直接粘贴最终汉字。
2. 在候选窗选择一个候选并确认，确认提交内容进入当前输入框／草稿；没有提前运行 Neo 的 Enter 动作。
3. 重新进入 composition，按 Escape 取消候选；只取消输入法状态，当前 Neo 输入／工具不因此退出或保存关闭。
4. composition 中按 Backspace 删除预编辑字符，Neo 不退场、不误触快捷键。
5. 再提交文本，composition 结束后才执行正常的 Neo 确认／取消；该动作恢复其正常语义。

评论编辑器补充：普通 Enter 是换行，编辑后约两秒 autosave 保持打开；普通非组合 Escape 保存并关闭，不撤回已经保存的内容。IME 所有的 Escape 不算普通 Escape 保存命令。

证明 autosave 时，要在编辑器仍打开、未 blur/关闭/Escape 的条件下观察原生标注中的已保存内容，例如真实 native annotation 卡更新，或单独标为技术证据的只读持久值检查。textarea 中的草稿不证明已保存；关闭 Reader 可能触发退场保存，因此“关闭再重开”本身不能区分 autosave 与关闭保存。无法独立观察时，这条只记录 Escape 保存结果，autosave 仍未确认。

### U6：Settings 录键和浏览器输入

1. 在 Settings 搜索字段中使用真实 IME，搜索文本是提交后的内容，不把预编辑字符重建为快捷键。
2. 进入一个有效 action/context 的 Record 状态，发起真实 composition；Process/229 和候选确认键不能变成误记录的 Neo 命令或提前 Apply。
3. composition 结束后录入一个真实可用序列。Enter/Escape 是被记录的 token，不是隐含的 Done/Cancel。使用界面明确的 Done 或 Cancel，检查焦点返回编辑目标。
4. 验证编辑未 Apply 时实际旧绑定仍生效；明确 Apply 后才改变。取消／失败不能把 staged draft 当作已保存。

Recorder 不是汉字编辑器；这一场景验证它让出 IME 和保持显式完成边界，不要求在 Recorder 里录入汉字字符串。

### U7：Outline 与剪贴板

- 聚焦真正的 native Outline，使用原生箭头、Tab/Shift-Tab、Enter/Return；目标仍按 Zotero 的原生行为激活。不要把 default-unbound 的 `uiConfirm` 或另一面板的 Enter 当作 Outline 默认。
- 在 Picker 查询、评论或 Note Insert 中，用自己的测试文字验证原生复制／粘贴，包括平台支持的 `<C-Insert>` / `<S-Insert>`。一次复制后在另一个安全原生字段粘贴核对内容；不以脚本直接读取／写入 clipboard 代替人体操作。
- 在 Settings binding draft 中尝试把这些 native 保留键藏到一个多键序列的后续 token，确认冲突会阻止 Apply；不要因此禁用原生功能。

**当前结果边界：** #137 已观察候选包原生 Outline 焦点 UI，但按键尝试未证明原生激活；人体 OS-IME、剪贴板与 Outline Enter/Return 均为 **NOT PERFORMED**。受信任 Gecko 输入与 API/UI 观察不能替代该组人工 PASS。

## 6. 发布工作流回归

这些场景同时可供 S1–S7 [录屏脚本](RECORDING_GUIDE.md)引用；发布验收应记录真实结果，宣传片不自动成为证据。

### U8：当前文献笔记与 Capture

1. 在 Reader A 创建／采用一段真实可见选区，`a` 或 Enter 打开 Selection Actions，选择 **Capture to note**。
2. 初始只列 A 的已有笔记；显式 **Browse library** 后才列同库其他已有笔记。保留查询，同名 A/B 笔记的 Preview 显示实际 parent 和分段正文。
3. 取消确认前的 chooser，检查笔记无新增正文、Reader 恢复焦点。
4. 明确确认 A 的目标，观察保存结果指明目标；原笔记 HTML/文字不丢失，只有一段捕获引用及可用页码。快速重复确认不能把另一个 Preview 写成目标。
5. 对 C 的无笔记情形，当前范围是诚实空列表，不能自动切 Library、创建笔记或写 backlink；显式 Library 浏览后可选择已有同库目标。
6. 将一个尚未确认的笔记在原生界面移动到其他 owner 后，再确认旧候选；应拒绝旧 ownership，而不是写入错误目标。刷新来源后才可主动重新选择。

正常 UI 验收不强迫制造底层 save failure。若发生保存失败，保存实际提示与笔记 before/after；不把测试注入的失败写成日常人体观察。

### U9：查询、历史和 native Sidebars

- Main `/` 是可见列表 local find，`<Space>fq` / `<Space>fa` 是原生 Quick/Advanced Search，二者不混淆。
- 用真实 Main → Reader → Tab／PDF 位置跳转，再执行 `<C-o>` / `<C-i>`。恢复合格位置而不是复制 Main Selection；历史不承诺恢复缩放、布局或 Note caret。
- `<Space>ro/rm/ra/rt` 直接打开／聚焦 Outline、Bookmarks、Annotations、Thumbnails，重复操作不把目标侧栏关闭。
- `[s` / `]s` 从 PDF 和四种侧栏上下文按实际位置遍历原生完整 heading tree；Figure/Table 只在存在真实 native 数据时验收，不通过标题正则编造目标。冷 SDT 处理可有等待，不能把等待宣传为零成本。

### U10：变更与可选集成

- Tag／Collection 操作在 Main 使用 Selection 优先目标，在 Reader/Note 使用自己的上下文，目标和数量可解释。Main 清除 View 筛选不等于清除 Selection。
- 对一次性测试条目执行 Trash 取消，再执行确认／`u` 恢复；隐藏 Selection 的拒绝和取消后的保存必须可见。Reader annotation 删除是永久操作，仅使用一次性测试标注并检查确认。
- 只有实际安装并工作的 Better BibTeX 才验收 citekey；只有实际 Translate provider 才录制翻译结果。未具备条件的可选场景写 `NOT APPLICABLE` 并说明条件，不能替代任何必需场景。
- Plugin Manager 只演示现有列表／查询／enable-disable／registered settings／信息链接。它不能停用 Neo 自身；没有通用商店、自动安装或卸载工作流。

## 7. 结果记录与收束

每条 U1–U10 记录以下字段，内容由实际观察填写，不预填成功：

- 候选提交、包 SHA256、Neo/Zotero 版本、OS/输入法、持久安装来源、profile/data identity。
- 用例 ID、开始 Surface/mode/focus、实际键序列、native input/IME 阶段、期望和实际可见结果。
- `PASS` / `FAIL` / `NOT PERFORMED`；仅可选且确实缺少条件的场景使用 `NOT APPLICABLE`。
- 未剪掉失败的截图／录像位置和原始诊断；剪辑版宣传片另外标明，不覆盖原始证据。
- 变更前／后笔记、Selection、目标 item、偏好等与该用例相关的结果。不要公开真实资料或凭空增加动作日志。

### 程序化观测与真实输入的界限

- RDP 端口就绪不等于 Zotero 数据层就绪：调用 Reader／Item API 前等待 `Zotero.initializationPromise`。原生 PDF 初始化也不保证 Neo 视图已经挂载；键路由验收要先确认当前安装包的视图处理者可用。
- 遵循项目的跨 compartment 约束：传给内容 Window 构造器的事件初始化对象要 `cloneInto` 到目标 realm。否则可能收到 `isTrusted=true` 但 key/code 为空的测试事件；这种观测不能算功能失败或通过。
- 原生输入处理器的 Control/Shift 状态应由实际 modifier keydown/keyup 事务建立，不能把构造器中的 `ctrlKey=true` 当作已经送出了组合键。每个事务释放 modifier，避免污染下一步。
- DOM `Window.focus()`／容器 focus 不等于 Zotero 已切换 native PDF owner。使用实际支持的 pane-focus 操作（例如 `<C-h>`／`<C-l>`），核实目标视图后再送键；不要直接改 `_lastViewPrimary` 等私有状态制造正确结果。
- 滚动／导航动画必须完成后再读取位置，并考虑原生边界 clamp；第一帧的位置不证明多处理或错处理。Note 的可见文字也要等原生保存后读取，不把草稿或立即关闭时的旧缓存当成最终持久值。
- 程序化可信 Gecko 事件、原生 Add-on Manager API 和实际 UI 图像，各自证明其已执行属性；它们不是物理键盘、OS 候选窗或人工剪贴板 PASS。后台窗口的前台保护拒绝时，停止全局发键，不向别的窗口重试。

发生失败：停止该用例，保留原始状态，在独立缺陷 Issue 写明复现和已观察后果。修复后只复验受影响的行为，并记录新候选身份；不要为了清空列表伪造 PASS 或重启覆盖证据。

完成后退出本轮自己启动的 profile，释放它的调试连接和录屏进程。只清理可证明属于本轮的夹具／目录，Zotero 关闭后才处理其数据库文件，不触碰日常库或其他进程。

## 8. 发布门禁

1. U1/U2 的候选包安装／升级观察已在 #137 记录；剩余物理人体／每视图输入项仍须实际完成，未执行项不能以已完成文档顶替。
2. 最终版本、包、兼容范围、更新 entry、release notes 和安装入口一致；最后改版本／源码后重新固定候选，不发布被另一推送替换的包。
3. 保留已有 schema/native 证据的准确来源；新的 0.2.0 XPI 和真实官方旧版升级分别有身份和观察。
4. 仓库 CI 当前验证 Ubuntu。不要把历史 Windows job 或本地包装检查写成当前 Windows/macOS GUI 验收。
5. #137/#98 只按实际完成条件收束。候选仍在 draft PR #143；不要提前合入 `main` 暴露不存在的 v0.2.0 下载；版本 tag／发布仍需要明确授权。
6. 正式网站下载链接和“已发布”文案只在实际资产可用后切换。当前[首页](../index.md)、[公开版入门](GETTING_STARTED.md)与[录屏脚本](RECORDING_GUIDE.md)不要求虚构素材来完成页面。
