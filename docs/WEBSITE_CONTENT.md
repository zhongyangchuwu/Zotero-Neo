# Zotero Neo 网站文案包

本文是未来文档网站可直接拆分使用的中文正文与内容归属图，不是网站实现方案。网站上线前，仍以项目仓库中的详细文档为准；下文的简短按键示例不替代完整命令表。

**正文版本范围：**以下交互模型、工作流和按键说明针对未发布的 v0.2.0 候选源码；公开 v0.1.0 的安装入口只说明当前可下载资产，不表示旧版具备候选全部契约。若网站在 v0.2.0 发布前上线，请把这些页面明确标为“v0.2 候选”，不要作为 v0.1.0 的稳定版手册。旧版使用应查看[对应 tag 的指南](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/docs/USER_GUIDE.md)；新候选安装按[验收指南](V0_2_ACCEPTANCE.md)执行。

## 1. 信息架构与内容归属

| 网站页面 | 页面负责回答 | 详细事实的唯一来源 |
| --- | --- | --- |
| 首页 | Neo 是什么、适合谁、当前公开版本是什么 | [README](../README.md)、[CHANGELOG](../CHANGELOG.md) |
| 开始使用 | 安装公开版、首次打开、如何判断版本 | [README 安装说明](../README.md#install)、[验收与发布清单](V0_2_ACCEPTANCE.md) |
| 交互模型 | Main、Reader、Note 的焦点、模式与目标 | [交互模型](INTERACTION_MODEL.md)、[命令参考](COMMAND_REFERENCE.md) |
| 文献库 | 导航、查找、Selection、标签、分类、citekey | [Selection 与标签](TAGS.md)、[交互模型](INTERACTION_MODEL.md)、[命令参考](COMMAND_REFERENCE.md) |
| Reader | 页面、面板、分栏、历史、链接与标记 | [用户指南](USER_GUIDE.md)、[命令参考](COMMAND_REFERENCE.md) |
| 选中文本与知识捕获 | Flash、标注、评论、向已有笔记捕获 | [用户指南：选区](USER_GUIDE.md#selection-workflow)、[用户指南：知识捕获](USER_GUIDE.md#knowledge-capture-workflow)、[输入法](INPUT_METHODS.md) |
| 笔记编辑 | Zotero 笔记编辑器中的 Normal/Insert | [用户指南：Note 编辑器](USER_GUIDE.md#note-editor-context-pane-and-standalone-note-tab)、[命令参考](COMMAND_REFERENCE.md#note-editor) |
| 设置与插件 | 快捷键、语言、外观、Neo Plugin Manager | [用户指南：自定义快捷键与设置](USER_GUIDE.md#customising-keybindings)、[命令参考](COMMAND_REFERENCE.md#selection-actions-plugin-manager-settings-and-selection-panel) |
| 命令与帮助 | 查询精确 ActionId、默认键、上下文及限制 | [命令参考](COMMAND_REFERENCE.md)、[输入法](INPUT_METHODS.md) |

**内容边界：**网站短路径示例只解释常见操作；[`COMMAND_REFERENCE.md`](COMMAND_REFERENCE.md) 是唯一完整 ActionId、默认绑定、执行上下文、计数与临时界面语法参考。用户指南讲工作流；交互模型与 Selection/标签文档讲目标语义；输入法文档讲文本和 IME 所有权。不要把所有命令表复制到网页，也不要用其他产品的键位语法替换 Neo 的实际默认值。

### 文档组织参考（不是键位来源）

网站按任务引导用户、把精确键位索引留作独立参考：这类内容分工参考了 [Yazi Quick Start](https://yazi-rs.github.io/docs/quick-start/) 的任务式入门与独立 keymap、[Zellij 文档](https://zellij.dev/documentation/) 的安装/配置/布局/插件主题组织，以及 [Zellij Screencasts](https://zellij.dev/screencasts/) 以完整任务为单位的演示方式。这些链接只说明信息组织和演示结构的灵感；Neo 的目标、焦点、ActionId 与默认键仍以 Neo 自己的文档和实现为准，不采用 Yazi/Zellij 的键位语法或产品语义。

## 2. 首页

### 面向 Zotero 的键盘交互层

**Zotero Neo 为 Zotero 主窗口和 Reader 提供可配置的键盘交互。**用键盘浏览文献、定位 PDF 内容、处理文本选区与标注，并在需要时回到 Zotero 原生界面完成输入。

Neo 尊重 Zotero 的文献数据和原生编辑器：Main 的项目操作有明确目标，Reader 文本输入和 IME 由浏览器处理，笔记仍在 Zotero 笔记编辑器中编辑。它受 Vim/Neovim 启发，但不是完整 Neovim 仿制品。

**当前公开版本：v0.1.0。**[下载已发布的 Zotero Neo v0.1.0 XPI](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi) · [查看 v0.1.0 发布说明](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0) · [开始安装](#3-开始使用安装升级与第一次操作)

> **版本说明：**v0.2.0 仍是未发布候选版本，不是当前下载。候选内容的源码说明和人工验收状态见[验收清单](V0_2_ACCEPTANCE.md)；清单中的未完成或未观察项目不能视为已通过。目前尚未人工实测系统级 IME 候选交互、组合态 Escape/Backspace、剪贴板相关原生按键边界及逐 live-view 的动作所有权；公开 v0.1.0 到 v0.2.0 候选的实际升级验证也尚未执行。v0.2.0 候选 XPI 的哈希与 v0.1.0 不同；此前相同运行时的包/原生证据不替代候选包的 GUI 人工验收。实际发布 v0.2.0 后，才将本页版本号、下载资产与发布说明链接一并更新为已发布资产；在发布前不要把候选包写成公开下载。

### 从 v0.1 延续到 v0.2 候选

- **v0.1.0 已有基础：**Reader 键盘导航、Flash 文本选择与标注操作、分栏和链接提示；Main 基础导航与临时项目范围；共享查找器、标签动作、命令面板、笔记查找与 Note 编辑。具体以已发布包的发布说明为准。
- **v0.2.0 候选侧重：**保留这些工作流，同时完善 Main 独立 Selection 与 Cursor 目标规则、Reader 原生侧栏和分类导航、跨界面显式导航历史、已有笔记捕获的目标安全，以及按上下文编辑快捷键和 Plugin Manager。候选源码并不等于已发布 XPI，也不代表每项人工验收已完成。

### 适合你的工作

- 在 Main 中以 Cursor 浏览当前可见项目，并用 Selection 明确组织多项目操作。
- 在 Reader 中导航页面、侧栏和 PDF 内部链接，选择文字并运行标注动作。
- 将阅读摘录追加到已有笔记，或在 Zotero 原生笔记编辑器内编辑。

操作是否可用取决于当前窗口、焦点、模式、快捷键自定义和目标是否存在。先从[交互模型](INTERACTION_MODEL.md)了解焦点边界，再按[命令参考](COMMAND_REFERENCE.md)核对准确绑定。

## 3. 开始使用：安装、升级与第一次操作

### 安装当前公开版本

Zotero Neo 支持**当前最新稳定版 Zotero**；旧的 Zotero 主版本不在支持范围内。请从[公开 v0.1.0 发布页](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)下载 XPI，而不是从候选源码或未发布版本链接安装。

1. 在 Zotero 中打开 **Tools → Plugins**。
2. 打开齿轮菜单，选择 **Install Plugin From File…**，选中下载的 `zotero-neo.xpi`。
3. 按 Zotero 提示重启。

如果已有 Neo 安装，需要更新到一个**已发布**版本，请先确认对应 GitHub Release 页面中的版本、说明和 XPI，再通过 Zotero 的 **Install Plugin From File…** 选择该发布资产并按提示重启。v0.2.0 尚未发布，因此目前没有可供公开升级的 v0.2.0 XPI。重新安装会保留 Neo 偏好设置；这本身不等同于干净安装或正式升级验收。

### v0.2 候选的第一次操作

按验收指南取得并持久安装获准的 v0.2.0 候选、核实版本并重启后，先在 Main 的项目列表聚焦一条文献：按 `j` / `k` 移动 Cursor，再按 `Enter` 打开 Cursor 项目。进入 PDF 后，用 `j` / `k` 阅读；若当前 Reader 视图有可选 PDF 文本，按 `v` 输入可见文字并选择 Flash 标签，确认后即可开始 Select 工作流。不要用刚下载的 v0.1.0 包证明这些候选契约。

这里的目标是当前 Main Cursor 和当前 Reader 文本；打开项目不会批量打开 Main Selection。按键只在对应焦点和能力上下文中生效，自定义绑定可能不同。Normal 的模式指示通常隐藏，不要等待一个不会出现的固定指示器；PDF 可读后可用 `:` 检查当前 Reader 的 Neo Command Palette。若仍在加载／Neo 视图挂载尚未就绪，就等待后再试，不能把此前按键当作已经由 Neo 执行。

**进一步了解：**[用户指南](USER_GUIDE.md) · [所有默认键与上下文](COMMAND_REFERENCE.md) · [v0.2 验收清单](V0_2_ACCEPTANCE.md)

## 4. 理解 Main、Reader 与 Note

Neo 把“当前在哪个界面”“键盘由谁接收”和“操作针对哪个对象”分开处理：

| 界面 | 常见键盘所有者 | 默认模型 |
| --- | --- | --- |
| **Main**（Zotero 主窗口） | Zotero 集合树、项目列表、原生搜索框或 Neo 临时界面 | Cursor 浏览当前视图；独立的持久 Selection 可供项目操作使用；`v` 临时选择可见项目范围。集合树的 Scope 仍由 Zotero 管理。 |
| **Reader** | PDF 阅读器、原生侧栏、Neo 的 Select、评论输入或原生输入 | 只有 **Normal** 与 **Select** 两种 Reader Surface 模式。评论编辑器和 `NATIVE` 输入是临时功能输入所有者，不是 Reader Insert 模式。 |
| **Note** | Zotero 笔记编辑器或 Neo Note Normal/Insert | Note 编辑器 Vim 模式由偏好设置控制；关闭时由 Zotero/浏览器原生编辑。Note 的目标是当前 Note 上下文。 |

Main 的普通项目操作遵循 **持久 Selection 优先，否则解析当前 CurrentTarget**；但 Main 项目列表的 `Enter` / `o` 是明确例外，只打开 Cursor 项目，不因 Selection 或 Zotero 多选而批量打开。Reader 与 Note 操作各自解析当前 Reader/Note 项目，**不会借用 Main Selection**。集合树焦点是 Zotero 的 Scope，不是 Neo 项目 Selection。

文本框、查询输入、原生编辑器和 IME 组合期间，输入由对应的 Zotero/浏览器控件接管。设置一个按键不能把它变成当前界面不支持的操作。

**详细说明：**[Library Interaction Model](INTERACTION_MODEL.md) · [键位、模式与能力](COMMAND_REFERENCE.md#modes-focus-and-capabilities) · [输入法与焦点](INPUT_METHODS.md)

## 5. 文献库：导航、查找与项目操作

### 浏览集合与项目

**目标：**在 Zotero 当前 Scope 和 View 中定位项目。

**快速路径：**项目列表聚焦时用 `j` / `k` 移动 Cursor；集合树由 Zotero 原生 Scope 控制，`Enter` 激活所选 Scope。`h` / `l` 在树和项目列表之间执行上下文相关导航。`<Space>ff` 搜索当前 Library 项目，`<Space>fc` 搜索当前 Collection 项目。

**作用范围：**Cursor 属于当前可见有序 View；改 Quick Search、Advanced Search、标签筛选或排序会改变 View，但不清空 Neo Selection。集合树和项目列表是不同焦点区域。

**注意：**Main 的 `Enter` / `o` 只打开 Cursor 项目；不能假设它会打开 Selection 中所有项目。精确焦点规则见[命令参考：Main window](COMMAND_REFERENCE.md#main-window)。

### 查找当前可见项目

**目标：**不改变集合、过滤条件或 Selection，在现有可见项目中移动 Cursor。

**快速路径：**项目列表聚焦时按 `/` 输入并确认非空查询，再用 `n` / `N` 前进或后退查找。若要编辑 Zotero 原生 Quick Search，使用 `<Space>fq`；Advanced Search 使用 `<Space>fa`。模糊选择项目用 `<Space>ff` / `<Space>fc`，它们不是本地查找。

**作用范围与限制：**本地查找只搜索当前可见项目，匹配标题/显示文本、首位创建者、年份及可用 citekey；无匹配时不改变 Cursor 或 View。Quick/Advanced Search 会改变 Zotero View。查询输入和 IME 保持原生。

**详细说明：**[Main local find](USER_GUIDE.md#main-local-find) · [选择器与键位](COMMAND_REFERENCE.md#temporary-surfaces-and-chooser-grammars)

### 用 Selection 执行明确的项目操作

**目标：**跨 Cursor 移动保留一组明确的项目目标。

**快速路径：**在项目列表按 `s` 将当前目标加入/移出 Neo Selection；按 `v` 开始临时可见行范围，用 `j` / `k` 调整，`o` 交换端点，`s` 提交。`Escape` 取消临时范围但保留既有 Selection。使用 `<Space>ss` 检查可见、隐藏或不可用成员，`<Space>sc` 清空 Selection。

**作用范围：**Selection 是 Neo 在当前会话维护的项目身份集合；它和 Cursor、临时 Visual 范围、Zotero 原生多选不同。普通 Main 项目操作优先用非空 Selection，否则解析当前目标；Main Open 仍只针对 Cursor。

**注意：**Selection 成员可能因 View 改变而隐藏。高影响的 Trash 会显示目标和数量，并拒绝含隐藏成员的 Selection；先用 Selection Panel 检查、显示或移除成员。Reader/Note 从不继承 Main Selection。

**详细说明：**[Selection 与标签](TAGS.md) · [目标规则](INTERACTION_MODEL.md#action-target-contracts) · [Main 与 Selection Panel 命令](COMMAND_REFERENCE.md#main-window)

### 标签、Collection 与 citekey

**给项目加/删标签：**在 Main、Reader 或 Note 的对应目标上下文按 `<Space>ta` 添加、`<Space>tr` 移除。添加可能提供明确的创建候选；移除只列出当前目标已拥有的标签。Reader/Note 使用自己的当前项目，不读取 Main Selection。

**筛选标签：**仅 Main 支持 `<Space>tf` 切换一个 Zotero 原生标签过滤器，`<Space>tc` 清除全部标签过滤器。多个活动过滤器遵循 Zotero 的 AND 语义。若启用标签分隔符，例如 `method/`，路径候选只是筛选提示；确认具体终端标签后才执行标签动作，Zotero 中的标签仍是普通字符串。

**调整 Collection 成员关系：**Main 与 Reader 可用 `<Space>ca` 加入、`<Space>cr` 移出一个目标 Collection；Main 可能处理一组目标，Reader 使用当前项目。操作要求同一 Library，并在确认前重新核对目标。Note 不支持 Collection 成员操作。

**复制 citekey：**`<Space>yy` 从当前上下文复制 citekey；Main 可能基于 EffectiveSelection 批量复制，Reader/Note 为当前上下文单项目。此功能需要可用的 Better BibTeX citekey；如果批处理中有目标不可用或缺少 citekey，整个操作拒绝，剪贴板不变。它不是格式化引文工具。

**详细说明：**[Selection 与标签](TAGS.md) · [Main 操作与 Reader/Note 目标](INTERACTION_MODEL.md#action-target-contracts) · [命令参考](COMMAND_REFERENCE.md)

## 6. Reader：阅读、侧栏、链接与导航历史

### 阅读与 PDF 页面

**目标：**在当前 Reader PDF 视图内移动、缩放和查找。

**快速路径：**`j` / `k` 滚动，`h` / `l` 执行 Zotero 上/下页步进，`+` / `-` 缩放，`=` 重置缩放；`/` 打开 Zotero PDF 查找，`n` / `N` 移动搜索结果。支持按页跳转的宿主中，`gg` / `G` 到文档起止，带正数时可定位对应页起始。

**作用范围：**页面、滚动和搜索属于当前活动 Reader 视图；分栏中按键由当前 PDF pane 接收。PDF 搜索、滚动和普通 `h` / `l` 页步进不保证增加 Neo Back/Forward 历史。

**限制：**若 Zotero 宿主不支持页导航 API，`gg` / `G` 回退为滚动到文档顶部/底部，不承诺数值页跳转或历史记录。精确页数和恢复规则见[命令参考：Reader Normal 与共享 jumplist](COMMAND_REFERENCE.md#reader-normal)。

### 原生侧栏与标题、图表、表格导航

**目标：**从 PDF 位置浏览大纲、书签、标注或缩略图，并按文档类别定位。

**快速路径：**`<Space>ro`、`<Space>rm`、`<Space>ra`、`<Space>rt` 分别打开或聚焦 Outline、Bookmarks、Annotations、Thumbnails。`[s` / `]s` 导航标题，`[f` / `]f` 导航 Figures，`[t` / `]t` 导航 Tables，`[a` / `]a` 导航标注，`[m` / `]m` 导航 Neo marks。

**作用范围：**Neo 增强 Zotero 原生 Outline 显示，但保留其原生条目与标题；标题遍历面向完整 Outline，不受折叠、筛选或当前行限制。侧栏中的本地 Neo 键和 Zotero 原生箭头/Tab/Enter 分属不同所有者；尤其 Outline 的 Enter/Return 是 Zotero 原生键。

**限制：**标题/Figure/Table 仅使用原生大纲、结构化文档和有效 PDF 锚点。第一次明确请求可能触发 Zotero 在本机处理整个 PDF；打开 Reader 本身不会启动这项额外处理。没有匹配标题/图表时不会造出目标；不新增 OCR、上传或识别服务。

**详细说明：**[用户指南：原生 Reader Outline 与 Bookmarks](USER_GUIDE.md#native-reader-outline-and-bookmarks) · [命令参考：Reader 侧栏](COMMAND_REFERENCE.md#native-reader-outline-and-bookmarks)

### 分栏、pane 焦点与显式历史

**目标：**并排查看 Reader 内容，或返回之前显式定位过的位置。

**快速路径：**`<Space>-` 切换上下分栏，`<Space>|` 切换左右分栏；`Ctrl+h/j/k/l` 将焦点移向最近的可用 pane。`Ctrl+o` / `Ctrl+i` 在 Main、Reader、Note Normal 中遍历 Neo 共享的 Back/Forward 历史。

**作用范围与限制：**焦点移动不创建 pane，也不在方向边界绕回。历史记录显式且成功的位置变更，不是每次滚动、缩放、键盘动作或原生点击；失败、取消和重复位置不会创建新记录。Reader 恢复可能不恢复缩放或分栏布局；目标缺失时恢复可能失败或不完整。

**详细说明：**[共享导航历史与恢复边界](COMMAND_REFERENCE.md#navigation-and-the-shared-jumplist) · [用户指南：分栏](USER_GUIDE.md#reader-split-view)

### PDF 链接提示与 Reader marks

**链接目标：**按 `f` 为当前 Reader pane 中可见的内部、引用或外部 PDF 链接显示提示，再输入提示字母选择。只处理可见链接；外部链接由 Zotero 原生处理，不是 Neo Reader 历史位置。内部/引用跳转是否记录取决于宿主导航是否产生可验证的位置变化。

**位置标记：**`m` 后接字母或数字可设置当前视口 mark，反引号后接标签可返回该位置；`<Space>rm` 聚焦 Bookmarks。marks 是 Neo Reader 位置标记，不是 PDF 标注；是否跨重启保存由 **Preferences → Marks → Persist marks** 决定。已选标注关联、存储位置和完整语法见[用户指南](USER_GUIDE.md#marks)与[命令参考](COMMAND_REFERENCE.md#marks-and-bookmarks-group)。

## 7. PDF 选区、标注评论与已有笔记捕获

### 选择 PDF 文本并标注

**目标：**在当前 Reader PDF 中选中可见文字，创建高亮、复制或搜索选中文字。

**快速路径：**按 `v` 开始 Select；输入要定位的可见文字并选择 Flash 标签，匹配文本即成为选区。用 `h/j/k/l`、`w/b`、`0/$`、`(`/`)`、`{`/`}` 微调范围，按 `s` Flash 到另一端，`o` 交换端点。`zy/zr/zg/zb/zp` 创建不同颜色高亮；`y` 复制，`#` 搜索。按 `a` / `Enter` 打开 Selection Actions，可选 Capture to note、Underline、Add note；Escape 关闭面板并保留选区。

**作用范围：**选区归当前 PDF pane；Reader 只提供 Normal/Select 两种 Surface 模式。普通 Flash 匹配是可见 PDF 文本的字面匹配，不是模糊搜索、OCR 或转写。OS IME 和查询编辑由原生输入框处理，组合中的按键不转成 Neo 命令。

**可选能力：**若安装并提供 Zotero Translate 集成，Selection Actions 才显示 Translate；它不是 Neo 内置翻译服务。详见[输入法](INPUT_METHODS.md)、[选区工作流](USER_GUIDE.md#selection-workflow)与[Select 命令](COMMAND_REFERENCE.md#reader-select-and-annotation-actions)。

### 编辑已有标注评论

**目标：**查看或修改当前 Reader 中已选标注的评论。

**快速路径：**用 `[a` / `]a` 选中前/后一条标注，按 `i` 或 `Enter` 打开 Neo 评论编辑器。输入和 IME 保持原生；`Enter` 插入换行；停止输入两秒后自动保存，或按非组合状态下的 `Escape` 保存并关闭。

**作用范围：**编辑器保存到打开时捕获的那条标注，并归属于它所在的 PDF view；另一个 split view 可继续正常导航。开启入口由 **Settings → Reader → Annotation comment editing** 控制；关闭后 Reader 的 `i` 进入原生键盘 passthrough，直到 Escape 退出，不会禁用 Zotero 自己的评论编辑器。

**重要：**Escape 是保存并关闭，不是撤销或取消；IME 组合中的 Escape 由 IME 处理。评论编辑和 Select 中的 Add note 会产生标注评论，与 Capture to note 不同。详见[评论输入](USER_GUIDE.md#annotation-comment-input)。

### 将摘录捕获到已有 Note

**目标：**把 Reader 选中文本追加到一条已有 Zotero Note。

**快速路径：**在 Select 中按 `a` / `Enter`，选 **Capture to note**。选择器默认只显示当前文献的 Note；需要其他已有笔记时，明确切换到 **Browse library**，选中并检查预览，再确认。Neo 将摘录追加为引用块，并在可用时附 PDF 页标签。

**作用范围与安全：**只能写入同一 Library 中重新验证过的已有 Note；列表行只显示标题，分组边界不可选，预览显示真实归属。确认会锁定目标 Note；保存一旦交给 Zotero 原生保存，就不能通过关掉选择器撤销。列表为空时表示当前文献没有 Note，不会自动回退到 Library 搜索。

**不会发生的事：**捕获不新建 Note、不自动生成 Reader backlink，也不等同于创建带评论的 PDF 标注。需要改选其他 Note 时先切换来源；失败时查看目标提示后再重新选择。

**详细说明：**[用户指南：Knowledge Capture](USER_GUIDE.md#knowledge-capture-workflow) · [交互模型：Knowledge capture](INTERACTION_MODEL.md#knowledge-capture)

## 8. Note 编辑、设置与 Plugin Manager

### 在 Zotero 编辑 Note

**目标：**在 Zotero 的右侧 Note pane 或独立 Note tab 中编辑当前笔记。

**快速路径：**当 **Note editor Vim mode** 开启时，Note Normal 使用 `h/j/k/l` 移动、`w/b` 跳词、`x` 删除字符；`i` 进入 Insert，输入由原生编辑器接收，`Escape` 返回 Normal。常见行操作包括 `dd` 删除当前行、`yy` 复制到 Neo Note 寄存器、`p/P` 粘贴该寄存器。

**作用范围与限制：**Note Insert 的文本输入属于 Zotero/浏览器编辑器；Vim 模式开关只影响 Note 编辑器，不会给 Reader 增加 Insert 模式。Note 操作解析当前 Note/父文献上下文，不会借用 Main Selection。Note 选择器用于查找并打开 Note，不是 Note 创建、删除或管理命令面板。

**详细命令：**[Note editor](COMMAND_REFERENCE.md#note-editor) · [用户指南](USER_GUIDE.md#note-editor-context-pane-and-standalone-note-tab)

### Neo Settings 与快捷键

**目标：**按个人习惯调整 Neo 外观、语言、功能开关和某个上下文中的 Action 绑定。

**快速路径：**在 Main、Reader 或 Note Normal 按 `<Space>ps` 打开 Neo Settings。外观可选 Auto、Light、Dark；界面和命令语言可跟随 Zotero（按宿主语言选择中/英文）。在 Keybindings 中按 Action、组或 BindingContext 搜索，再 Add、Record、Unbind 或 Reset；快捷键更改暂存到 **Apply** 后才生效。

**作用范围与限制：**同一个键序列会因上下文而不同；设置项只列出该上下文支持的动作。Native shortcuts 单独只读显示；改 Neo 绑定不会屏蔽 Zotero 原生快捷键。重复绑定、不支持的 Action/Context 组合和保留的原生按键会阻止 Apply；严格前缀冲突会提示。标签路径分隔符只影响候选细化，不重写标签。

还可配置 Reader Select、评论编辑入口、Note Vim 编辑、marks 持久化、Picker 鼠标行选择和 Prefix Guide。Keybindings 变更需要 Apply；其他设置按界面提示保存。

**详细说明：**[用户指南：自定义快捷键](USER_GUIDE.md#customising-keybindings) · [设置项](USER_GUIDE.md#settings) · [精确绑定与 Native 所有权](COMMAND_REFERENCE.md#command-palette-remapping-and-unbound-actions)

### Plugin Manager：管理已安装插件

**目标：**查看 Zotero 当前安装插件的状态，并执行 Zotero 允许的生命周期或信息操作。

**快速路径：**在 Reader、Main 或 Note Normal 按 `<Space>pp` 打开常驻面板；用 `/` 聚焦过滤框，Escape 回到结果列表。结果列表支持浏览、刷新、可用时启用/禁用、打开插件设置，以及打开主页、可识别的 GitHub README 或提交记录。

**作用范围与限制：**过滤框文字和 IME 由原生输入处理；Zotero AddonManager 是插件状态权威来源，只有它允许时 Enable/Disable 才可用。Neo 不能在自己的 Manager 中禁用自己。该面板**不是**插件商店或通用安装器：不提供远程发现、更新、安装 XPI 或卸载；也不会在打开面板时下载 README 或提交内容。安装/更新/卸载请使用 Zotero 原生 Plugins 界面。

**详细说明：**[用户指南：Plugin Manager](USER_GUIDE.md#plugin-manager-panel) · [命令参考：Plugin Manager](COMMAND_REFERENCE.md#selection-actions-plugin-manager-settings-and-selection-panel)

## 9. 命令查找、常见问题与已知限制

### 查精确按键，不要猜

按键示例只在标明的界面、模式和焦点上下文中有效；用户自定义绑定可以替换或取消默认值。Printable 字母区分大小写；`<Space>` 表示实际 Space 键加后续序列。`<C-o>` 等尖括号形式表示带修饰键的单个按键。Neo 默认语法受 Vim 启发，但不承诺完整 Vim/Neovim 行为。

完整查找顺序：先看[命令参考](COMMAND_REFERENCE.md)中的 ActionId、默认绑定、BindingContext 和计数语义；再到 Settings → Keybindings 查看当前 Default、Custom 或 Unbound 状态。`:` 命令面板只在 Main/Reader/Note Normal 打开，列出当前上下文可执行动作，包括无默认键的动作；它不执行 Ex 命令或参数解析。Prefix Guide 在 Space 或其他未完成前缀后显示当前可用后续键。

### 常见问题

**按键没有反应？**先确认当前 Surface 和模式，再确认焦点在项目列表、PDF、侧栏、文本输入框还是 Note 编辑器；检查功能开关、自定义绑定及目标是否存在。Native 编辑器/IME、Picker 查询框和 Reader 原生侧栏可能拥有该按键。支持与默认绑定是两回事：Unbound 仍可能可从命令面板执行；不支持的 Action 不能靠绑定强行启用。

**为什么抓取笔记时没有可选项？**默认来源是当前文献的已有 Note。空列表是如实结果；按 **Browse library** 才显式浏览同 Library 的其他 Note。Neo 不自动创建 Note，也不添加回链。

**为什么 citekey 没有复制？**需要 Better BibTeX 提供 citekey；Main 的批量操作遇到缺失或不可解析目标时整体拒绝，避免复制不完整结果。

**为什么 Reader 第一次跳到图/表时等待？**Figure/Table/Heading 的首次显式请求可能触发 Zotero 本机结构化 PDF 处理，且缓存可供后续使用。它不上传文档、不运行新 OCR；不存在的原生目标不会被推测出来。

**为什么 Reader 的 Escape 没有取消评论？**评论编辑器的非组合 Escape 会保存当前草稿并关闭；组合输入时 Escape 由 IME 接收。它没有“Escape 丢弃草稿”的取消模式。

**为什么 Plugin Manager 里找不到安装按钮？**该面板仅管理已安装插件中 Zotero AddonManager 当前允许的操作并显示信息，不是插件商店或 XPI 安装器。

### 明确的能力边界

- 公开下载仍是 v0.1.0；v0.2.0 是未发布候选。候选包下载、升级或人工验收未完成时，不应宣传为正式可用或已通过。
- 仅支持最新稳定版 Zotero；具体兼容矩阵以[README](../README.md)和发布说明为准。
- Reader 是 Normal/Select 两种 Surface 模式；评论编辑器和原生 passthrough 是功能输入所有者。Note Insert 仅属于 Note 编辑器。
- Flash 针对可见 PDF 文本做字面匹配，不提供 OCR、模糊匹配、转写或语言感知分词。IME 文本输入仍由浏览器/Gecko 处理，详见[输入法说明](INPUT_METHODS.md)。
- Better BibTeX citekeys 与 Zotero Translate 是可选集成，不是 Neo 内置能力。
- Reader 侧栏、外部链接、宿主页导航和 Note 保存最终依赖 Zotero 原生功能；未被宿主支持或无法解析的目标会失败、保持空结果或不产生历史记录，而不是伪造成功。

## 10. 实际录屏的放置位置

以下 S 编号仅用于将来对照[录屏指南](RECORDING_GUIDE.md)整理真实任务录制；它们不是运行时接口、快捷键或验收证据。没有录制素材时，网站只显示本页文字，不放空播放器、假缩略图、虚构时长或占位视频。取得真实录屏后，把相应片段挂到对应任务页的步骤旁，并按[验收清单](V0_2_ACCEPTANCE.md)如实标记尚未完成的验证。

| 内容 ID | 后续归属页面 | 展示的完整任务 |
| --- | --- | --- |
| S0 | 开始使用 | 安装公开包并完成第一次交互 |
| S1 | 文献库 | Main 项目浏览与 Selection triage |
| S2 | Reader | Reader 导航、侧栏、分栏与历史 |
| S3 | 选中文本与标注 | Flash 选区、标注和评论 |
| S4 | 选中文本与标注 | 将摘录捕获到已有 Note |
| S5 | 设置与插件 | 暂存快捷键变更并理解 Native 所有权 |
| S6 | Note 编辑 | Note Normal/Insert 基础编辑 |
| S7 | 设置与插件 | 浏览已安装插件并使用 Plugin Manager |
