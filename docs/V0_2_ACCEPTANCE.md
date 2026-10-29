# v0.2 候选验收指南

本指南是 v0.2.0 候选的 U1–U9 执行协议。每轮候选提交、版本与 XPI SHA-256 以 [`updates.candidate.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/updates.candidate.json) 和 [#142 发布跟踪](https://github.com/zhongyangchuwu/Zotero-Neo/issues/142) 为准；不在此固定本轮包身份。将实际验收结果记录到 [#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137) 和 [#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98)：未执行项记 `NOT PERFORMED`，仅可选且条件缺失的项目记 `NOT APPLICABLE`。

## 1. 固定候选与边界

每轮记录候选完整提交 SHA、XPI SHA-256、Neo 与 Zotero 完整版本、操作系统、键盘布局、输入法、profile 和数据目录，以及是否为持久安装。目标范围是当前最新稳定 Zotero；不承诺旧 major 或 Beta。

从包含 v0.2.0 候选元数据的插件源码构建并检查：

```bash
npm ci
npm run build
node tools/check-package.mjs
node tools/check-release.mjs v0.2.0
sha256sum zotero-neo.xpi
```

Windows 可使用仓库的 PowerShell 入口：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
Get-FileHash zotero-neo.xpi -Algorithm SHA256
```

这些检查验证构建、包成员和版本／候选更新元数据，不代替人工验收。`updates.candidate.json` 是候选元数据，`updates.json` 是公开更新 feed；在已验证的 v0.2.0 资产存在且获准 promotion 前，公开 feed 只保留官方 v0.1.0 entry。两份 feed 都不打包进 XPI。

从该确切源码提交的 CI 构建附件或同一源码的本地构建取得候选 XPI。冻结发布候选后，将其 SHA-256 写入候选 entry 的 `update_hash`，格式为 `sha256:<digest>`；发布器会核对包内 manifest、提交／tag 和哈希，并下载核对 XPI 与 `.sha256` 校验文件。同 tag 的既有资产必须逐字节一致；缺失、冲突或不完整 Draft 不自动修补。发布期间必须保持单一写入者：GitHub 没有原子的“仅 Draft 可上传”条件，预先读取并检查不能锁定外部写入者。

安装／升级结果只适用于记录的那个包身份。包字节变化后，为新候选重新固定身份并执行受影响的包验收；旧包的结果不能转记为新包的 PASS。

## 2. 建立安全的验收环境

使用新的 profile 和独立数据目录，不使用日常库、同步账户或共享数据库。官方说明：[多 profile](https://www.zotero.org/support/kb/multiple_profiles)、[数据目录](https://www.zotero.org/support/zotero_data)。

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
- 文献 B 及其 PDF，用于证明跨阅读器／主窗口目标不会串用。
- A 的两条已有笔记、B 的一条已有笔记，A/B 中各有一条同名笔记；正文包含分段和少量格式。
- 文献 C，无子笔记；一条独立笔记；两个测试集合；两个可删除的测试条目。
- 可选：已安装且可正常工作的 Better BibTeX／Translate，或一个可安全停用且有注册设置入口的测试插件。未安装时记录条件缺失，不把该项记为通过。

建立数据可以使用 Zotero 原生界面。

## 3. 安装和升级

### U1：干净安装 v0.2.0

1. 在干净验收 profile 中打开 Tools → Plugins／Add-ons，通过 gear 菜单选择 Install Plugin From File，安装候选 XPI；按提示重启。
2. 在插件列表核实 Neo 版本为 `0.2.0`，不是仅修改了文件名的旧包。
3. 在主窗口条目列表的 Normal 状态下，按 `:` 打开 Command Palette；只有一个面板，输入查询和取消正常。
4. 用 `<Space>ps` 打开 Settings，查看阅读器、主窗口、笔记编辑器和本地控件对应的实际上下文；Reader 不出现 Insert，Note Insert 保留。
5. 在配置编辑器记录 `extensions.zotero-neo.bindings.schemaVersion`，核实它与本轮确切源码 `src/core/preferences.ts` 的 `BINDING_SCHEMA_VERSION` 一致。不手动修改 schema 数值制造升级结果。
6. 关闭并重启该 profile，再执行一次入口命令；没有重复面板或遗留旧代键处理。

**通过标准**：持久版本正确、默认功能入口可用、配置上下文正确、重启后只有一个当前输入处理方。单凭“插件列表显示启用”不算功能通过。

### U2：官方 v0.1.0 → 候选 v0.2.0

在升级 profile 中先安装[官方 v0.1.0 包](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi)并重启；不能用把当前源码改成旧版本号后构建的包替代官方发行版。

官方 v0.1.0 的[偏好源码](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/src/core/preferences.ts)使用 binding schema `11`；候选目标值以其确切源码中的 `BINDING_SCHEMA_VERSION` 为准，不在协议里固定。记录实际安装后的观察值，不手动改写 schema 数值。

在**仅属于升级验收的 profile**里保存现有 `extensions.zotero-neo.bindings` 原值，再通过旧版配置／高级配置编辑器加入以下测试配置，确保不覆盖其他已有 override：

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
- 在旧版阅读器的 Insert／批注评论入口设置或高级配置中将 `extensions.zotero-neo.mode.insert.enabled` 设为 `false`，记录原值。使用任一无关验收偏好或一个已存在的语言／滚动设置作为保持不变的对照。

然后执行：

1. 先关闭旧版阅读器；在同一个仍运行的升级 profile 中，用原生插件管理器安装候选 0.2.0 包，按安装结果要求退出／重启 Zotero。不要先退出整个程序后再要求在已关闭的窗口里安装。
2. 核实插件版本 0.2.0、schema 与本轮确切源码一致、自定义 `Q` 的行为和 `j` 的明确取消均保留；原保存的无关设置未丢失。
3. 核实旧 Reader Insert 行消失，其他上下文映射／取消仍在；不是把全部配置重置为默认。
4. 核实新的 `extensions.zotero-neo.annotationCommentEditor.enabled` 为 `false`，旧 `mode.insert.enabled` 清除；在 Reader Normal 中，`i` 将输入交给 Zotero 原生输入处理，按 `Escape` 退出该输入状态，不出现 Reader Insert 模式。
5. 再重启，重复版本／映射／取消／开关检查，确认第二次迁移不改变结果。
6. 另一组独立升级测试配置可验证“旧键为 `false`、现行设置键已为 `true`”：候选应保留现行设置键的 `true` 值，再清除旧键。这只是预先设置的键值冲突，不表示官方旧版提供了新的设置开关。

**通过标准**：原生升级真实发生，数据和用户意图保留，退休范围仅删除已批准的数据，现行设置键的优先级正确，重启后仍一致。失败时记录修改前后的实际偏好值，不先 Reset 掩盖问题。

## 4. 每个交互界面和视图的一次动作

默认键位用于这一组；U2 的自定义键位和取消映射单独记录，不能把已取消的 `j` 当作默认失效。

### U3：主窗口与笔记编辑器

- 主窗口条目列表 Normal：只按一次 `s`，检查当前目标只进入 Neo 选择集一次；没有重复切换、第二个意外目标或额外条目游标移动。移动条目游标后按 `o`，只打开游标指向的条目，不借用已有 Neo 选择集；返回文库后 Neo 选择集保留。
- 用 `<Space>ss` 检查 Neo 选择集的可见／隐藏成员。用 `v` 建立可视范围，按 `Escape` 取消，不清空已有 Neo 选择集。
- 在设置中启用 **Vim-style note editing**（中文界面：**Vim 风格笔记编辑**）后打开一条测试笔记。Normal `i` 进入原生 Insert；输入并切换到另一条笔记时，新笔记条目或编辑器身份不继承旧笔记的待处理输入。使用已有笔记编辑动作或原生文本／撤销功能时，不应多出键字符或重复编辑。
- 在笔记编辑器 Insert 或原生可编辑字段中输入文字／操作剪贴板，不把这些输入当作主窗口／阅读器 Normal 命令。

### U4：阅读器主视图／次视图

1. 打开 A PDF，等待 Neo 在阅读器中的交互可用；建立水平或垂直分屏。固定窗口大小、缩放和滚动设置，拍到两侧位置。
2. 焦点在主视图 PDF 时，轻按并释放一次默认 `<C-d>`，观察一次配置预期的半页运动；次视图不移动，不出现另一个工具／面板动作。
3. 将实际焦点切至次视图后重复一次；主视图不受影响。键盘自动重复或长按不属于这个用例。
4. 在每侧执行一次 `<Space>ro` 并回到 PDF，再执行 `[s` / `]s`；当前视图变化正确，没有一次按键触发两次跳转或改变另一侧。
5. 关闭次视图，保持主视图可操作；关闭阅读器再重开，等待新视图可用后重复一个动作。
6. 用原生插件管理器禁用／启用 Neo 后，再分别观察主窗口和当前阅读器中的动作；不要同时保留临时 RDP 版本。

**通过标准**：实际焦点对应的输入处理方能解释每次动作；活跃视图、关闭／重开和禁用／启用后都只有一个当前输入处理方。只看 bridge “安装成功”或一个 overlay 的数量，不等于一次动作已被证明；若录像无法区分次数，就保留该项目未确认，并收集实际诊断，不猜 PASS。

## 5. 真正的输入法和原生键

### U5：文本输入的真实 OS IME

对 Flash 查询、批注评论文本框和 Picker 查询分别执行下列操作。使用真实键盘、真实 OS 输入法，录屏范围包含候选窗和当前输入框：

1. 输入一段能出现多个候选的拼音／其他输入法文本，不直接粘贴最终汉字。
2. 在候选窗选择一个候选并确认，确认提交内容进入当前输入框／草稿；没有提前运行 Neo 的 Enter 动作。
3. 重新进入输入法组合状态，按 Escape 取消候选；只取消输入法状态，当前 Neo 输入／工具不因此退出或保存关闭。
4. 输入法组合期间按 Backspace 删除预编辑字符，Neo 不退场、不误触快捷键。
5. 再提交文本，组合结束后才执行正常的 Neo 确认／取消；该动作恢复其正常语义。

批注评论编辑器补充：普通 `Enter` 是换行；最后一次输入后约两秒自动保存，自动保存时编辑器必须保持打开。普通 `Escape` 会保存最终草稿并关闭编辑器；Neo 停用交互、将输入交回 Zotero 原生编辑器时也会先保存最终草稿。IME 组合期间的 `Escape` 由输入法先处理，不执行编辑器的保存命令。

关闭视图或阅读器本身只释放编辑器，不会补存未保存草稿，因此关闭视图或阅读器前先按 `Escape` 保存。原生保存已经开始后，生命周期清理不会取消它；普通失焦不能作为保存保证。

验证自动保存时，保持批注评论编辑器打开，且不要按 `Escape`、也不要发生输入交接；从 Zotero 原生批注卡片或单独标明的只读持久值检查中读回已保存内容。文本框中的草稿和关闭后重开的结果不能单独证明自动保存。若无法独立读回，应把自动保存标为未确认，单独记录 `Escape` 或停用时输入交接保存的结果。

### U6：Settings 录键和浏览器输入

1. 在 Settings 搜索字段中使用真实 IME，搜索文本是提交后的内容，不把预编辑字符重建为快捷键。
2. 选择有效的动作和按键上下文，进入 **Record** 状态并发起输入法组合；Process/229 和候选确认键不能变成误记录的 Neo 命令或提前 Apply。
3. 组合结束后录入一个真实可用序列。Enter/Escape 是被记录的按键，不是隐含的 Done/Cancel。使用界面明确的 Done 或 Cancel，检查焦点返回编辑目标。
4. 验证编辑未 Apply 时实际旧绑定仍生效；明确 Apply 后才改变。取消／失败不能把待应用的草稿当作已保存。

Recorder 不是汉字编辑器；这一场景验证它让出 IME 和保持显式完成边界，不要求在 Recorder 里录入汉字字符串。

### U7：Outline 与剪贴板

- 聚焦真正的 native Outline，使用原生箭头、Tab/Shift-Tab、Enter/Return；目标仍按 Zotero 的原生行为激活。不要把 default-unbound 的 `uiConfirm` 或另一面板的 Enter 当作 Outline 默认。
- 在 Picker 查询、评论或 Note Insert 中，用自己的测试文字验证原生复制／粘贴，包括平台支持的 `<C-Insert>` / `<S-Insert>`。一次复制后在另一个安全原生字段粘贴核对内容；不以脚本直接读取／写入 clipboard 代替人体操作。
- 在 Settings binding draft 中尝试把这些 native 保留键藏到一个多键序列的后续 token，确认冲突会阻止 Apply；不要因此禁用原生功能。

**通过标准**：每个指定目标的实际 focus、IME 阶段、候选确认和原生结果可见。脚本发送 composition/keyCode229、可信 Gecko 事件或调用生产 API，都不能替代这一组人工 PASS。

## 6. 发布工作流回归

这些场景同时可供 S1–S6 [录屏脚本](RECORDING_GUIDE.md)引用；发布验收应记录真实结果，宣传片不自动成为证据。


### U8：查询、历史和 native Sidebars

- 按主窗口 `/` 在可见列表中查找；`<Space>fq` / `<Space>fa` 是原生 Quick/Advanced Search，二者不混淆。
- 单集合、多个集合以及宿主支持的集合／Saved Search／Library 混合选择，都能打开 Toggle Tag Filter。候选来自当前完整视图，排除范围外标签；Quick／Advanced Search 不被清除，零结果时仍可取消当前 active tag。
- 用真实的主窗口 → 阅读器 → 标签页／PDF 位置跳转，再执行 `<C-o>` / `<C-i>`。恢复符合条件的位置，而不是复制 Neo 选择集；历史不承诺恢复缩放、布局或笔记编辑器中的文本光标。
- `<Space>ro/rm/ra/rt` 直接打开／聚焦 Outline、Bookmarks、Annotations、Thumbnails，重复操作不把目标侧栏关闭。
- `[s` / `]s` 从 PDF 和四种侧栏上下文按实际位置遍历原生完整 heading tree；Figure/Table 只在存在真实 native 数据时验收，不通过标题正则编造目标。冷 SDT 处理可有等待，不能把等待宣传为零成本。

### U9：变更与可选集成

- 模块边界：在一次性 profile 中，将 `library`、`worksets`、`tags`、`collections`、`reader-navigation`、`reader-selection`、`reader-annotations`、`notes`、`workspace` 各自对应的 `extensions.zotero-neo.modules.<id>.enabled` 旧值设为 `false`，并关闭 `reader-hints`（链接与复制提示）和 `extensions`（扩展管理面板）。保存请求前后、Neo 重载后确认当前能力不变；真正重启 Zotero 后确认只关闭两项增强，九个核心仍提供 Main、Reader、Note 与 Workspace 工作流，包括 Main Visual、选择/批注、导航、笔记查找和标签/分类操作。
- 恢复默认模块请求，只恢复 `reader-hints` 与 `extensions` 两项默认启用值；对照确认九个核心旧值及 `noteEditor.enabled` 等行为偏好未被改写。模块保存与恢复默认都不得改变快捷键、行为偏好或 Zotero 数据。

- 标签／集合操作在主窗口以 Neo 选择集为优先目标，在阅读器／笔记编辑器中使用各自上下文，操作目标和数量应清楚可解释。主窗口清除视图筛选不等于清除 Neo 选择集。
- 对一次性测试条目执行 Trash 取消，再执行确认／`u` 恢复；应能观察到对隐藏 Neo 选择集成员的拒绝，以及取消后的保存结果。阅读器中的批注删除是永久操作，仅使用一次性测试批注并检查确认。
- 只有实际安装并工作的 Better BibTeX 才验收 citekey；只有实际 Translate provider 才录制翻译结果。未具备条件的可选场景写 `NOT APPLICABLE` 并说明条件，不能替代任何必需场景。
- Plugin Manager 只演示现有列表／查询／enable-disable／registered settings／信息链接。它不能停用 Neo 自身；没有通用商店、自动安装或卸载工作流。

## 7. 结果记录与收束

每条 U1–U9 记录以下字段，内容由实际观察填写，不预填成功：

- 候选提交、包 SHA256、Neo/Zotero 版本、OS/输入法、持久安装来源、profile/data identity。
- 用例 ID、开始 Surface/mode/focus、实际键序列、native input/IME 阶段、期望和实际可见结果。
- `PASS` / `FAIL` / `NOT PERFORMED`；仅可选且确实缺少条件的场景使用 `NOT APPLICABLE`。
- 未剪掉失败的截图／录像位置和原始诊断；剪辑版宣传片另外标明，不覆盖原始证据。
- 记录与用例相关的笔记、Neo 选择集、目标条目和偏好值在变更前后的状态；不要公开真实资料或凭空增加动作日志。

发生失败：停止该用例，保留原始状态，在独立缺陷 Issue 写明复现和已观察后果。修复后只复验受影响的行为，并记录新候选身份；不要为了清空列表伪造 PASS 或重启覆盖证据。

完成后退出本轮自己启动的 profile，释放它的调试连接和录屏进程。只清理可确认属于本轮的测试数据和目录，Zotero 关闭后才处理其数据库文件，不触碰日常库或其他进程。

## 8. 发布门禁

1. U1/U2 的干净安装和官方 v0.1.0 升级／重启都须针对拟发布的确切 XPI 记录身份与结果；包更换后只复验受影响的包验收，不沿用其他包的结果。
2. 最终版本、包、兼容范围、候选更新 entry、release notes、安装入口和校验资产必须一致；XPI 包含项目和第三方许可，Release 提供同 tag 源码入口。最后改源码或版本后重新固定候选身份并检查包。
3. 当前 CI 在 Ubuntu 验证；不要把历史 Windows job 或本地包检查写成 Windows/macOS GUI 验收。
4. 源码可以在统一验收前合入 `main`，但合并不代表验收或发布。所有必需结果须在 #137/#98 记录并由相应负责人确认；未满足前不打 tag、不提升公开 feed、不发布。发布仍须明确授权。
5. 正式网站下载链接和“已发布”文案只在真实发布资产可用后切换。
