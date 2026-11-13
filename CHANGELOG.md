# main 更新摘要

本页汇总 `main` 的当前实现，不维护历史发行版说明或版本对照。具体变更过程见 [Git 提交记录](https://github.com/zhongyangchuwu/Zotero-Neo/commits/main/)；操作步骤和准确按键分别由[使用指南](docs/USER_GUIDE.md)与[命令参考](docs/COMMAND_REFERENCE.md)维护。

## 核心交互

- Main 文库、工作集、标签、分类、Reader 导航/选区/批注、笔记和工作区由九个固定启用的核心分区提供；内部共 12 个功能分区，另有 `reader-hints`、`extensions` 和 `translation` 三项可选增强。
- 新配置默认开启链接与复制提示和扩展管理面板，关闭翻译增强；模块请求只在完整重启 Zotero 后应用，Neo 重载保留本次进程的已应用状态。翻译模块偏好缺失时的一次迁移保留已有 Translate for Zotero 用户的使用，已有明确关闭值不被覆盖。恢复默认会显式写入三项规范默认值。
- 首次启用翻译增强可在 Neo 设置中经确认准备官方固定版本 Translate for Zotero 2.4.8；此入口不依赖 Plugin Manager。仅新安装会尝试初始化选中文本自动翻译和 Neo 语言目标，且只写入准备安装前没有用户值的偏好；上游启动写入的默认目标语言不会阻止这次初始化，卸载后重装时保留的自动翻译或目标语言设置也不会被覆盖。已有插件配置与版本不会被静默替换。Plugin Manager 仍提供另一种安装及原生更新入口。
- Main、Reader、Note 分别解析发起交互的目标。Main 一般条目操作优先使用非空 Neo 选择集；Reader 和 Note 使用自己的条目上下文，不借用 Main 选择集。
- 各窗口与 Reader 视图分别持有状态和资源；过期界面、回调和异步结果不能接管后继交互。

## 文库与笔记

- Main 支持树移动、内部查找、原生 Quick/Advanced Search、条目与笔记选择器、标识符录入、标签与分类操作，以及确认后的回收站操作和最近批次恢复。
- Main Visual 与 Persistent Selection 支持范围选择、成员管理和隐藏成员定位；打开 PDF 仍作用于条目游标，而不是批量打开整个选择集。
- Note 选择器支持当前条目和文库范围。笔记编辑使用 Zotero 原生编辑器；Vim 风格编辑由独立行为偏好控制，关闭它不影响笔记查找。
- 每个 MainWindow 使用同一导航历史，跨 Main、Reader 和 Note 处理明确完成的跳转。历史不恢复 Neo 选择集、缩放/布局或 Note 文本光标。

## PDF 阅读与批注

- `<Space>rr` 切换原生 Reading Mode；PDF 与重排视图共享输入、Flash、词元选择和视觉行移动，重排选区可映射回原 PDF 保存文字批注。Reading Mode 的句子和段落扩展使用结构化文本边界。
- `<Space>rb` 在当前 Reader 会话切换正文选择；显式准备原生结构后，PDF 与 Reading Mode 的键盘候选、复制和批注几何共同排除已识别的图表、图注与页边文字。公式和未知区域保留可选，普通鼠标拖选仍由 Zotero 处理。
- Figure／Table 定位共享图表关联步骤，支持同页多个子图、表格本体与 caption 的整组矩形；对照面板显示关联状态、整组定位及报告成员。跨页、正文阻隔与冲突关联保留回退位置。
- `<Space>rd` 提供原生 SDT／OXR 完整解析对照、区域定位和报告复制。云端请求显式发起，文件版本、页面几何与取消后的结果寿命分别校验；区域结果不冒充精确文字批注。
- OXR 结果保存到附件目录并在重开或重启后按来源与配置复用；打开对照面板只读取缓存，提供明确的重新解析入口。原生 SDT 继续复用 Zotero 缓存，PDF 文件保持原样，派生图表关联按当前算法重算。

- Reader 提供滚动、翻页、缩放、平移、PDF 搜索、原生侧栏与结构导航、会话或持久化 marks，以及标签页和分屏操作。
- Reader 的界面模式为 Normal 和 Select；批注评论编辑与原生输入透传是输入处理状态，不增加 Reader Insert 模式。
- Flash、DOM 选区移动、端点交换、复制/搜索及批注操作绑定精确 ReaderView/Document。无法完整定位的选区不会生成部分批注。
- Flash 将部分单词和短语扩展到完整词元，合并同一范围的重复匹配；Unicode 归一化与大小写转换保留原始 PDF 文本位置。Select 的 `h/l` 按词元调整，`j/k` 按视觉行吸附词元，`H/L` 保留字符级微调，并显示活动词元轮廓。原有自定义动作和显式取消绑定意图保留。
- 批注支持高亮、下划线、评论、改色、过滤、复制与确认删除。评论保存遵守原生写入和精确视图寿命；焦点变化不使过期结果重新抢回界面。
- 翻译增强拥有 Translate for Zotero 自动翻译弹窗旁的译文保存及侧栏译文角色；保存当前显示内容（包括用户修订），不再次请求翻译。原文旁使用原生便签，不自动添加高亮；关闭 Neo 增强不会停用上游插件或删除已有便签。
- `reader-selection` 继续拥有公共 `getSelection()` / `registerSelectionAction()` 选择 API；`translation` 为 Reader Select 操作面板贡献手动 `pdf-translate.translate` 动作，并拥有译文保存与侧栏功能，不新增 Reader mode。翻译服务、目标语言和密钥仍由 Translate for Zotero 管理。

## 设置与输入

- 绑定按精确上下文维护，支持动作搜索、暂存编辑、录键和显式应用。自定义键位与行为偏好不因模块请求的保存或恢复默认而重置。
- 前缀提示按当前有效绑定覆盖 Reader Normal／Select、Main 和 Note Normal，不限于 Space；数字计数在 Reader 状态指示器中即时显示。取消、退格与超时统一处理待完成输入，歧义短动作保留匹配器等待时间。停用增强不留下可执行入口或无效前缀等待。
- 设置、选择器、批注评论及笔记原生输入保留 IME、剪贴板与宿主快捷键所有权。Reader 的普通文字输入和 Note Insert 不作为 Normal 命令处理。
- 设置与动作标签支持中文、英文及跟随 Zotero；默认命令前缀为 `<Space>`。

## 构建、兼容与验证

- 插件使用严格 TypeScript，经 esbuild 生成 JavaScript 并打包为单个 XPI；运行时不动态加载 npm 包、远程脚本或本地辅助程序。
- 构建包包含完整项目许可证和 fuzzysort 的 MIT 声明。包成员及实际许可载荷由仓库验证检查。
- 支持范围以当前 `manifest.json` 为准；CI 验证格式、类型、契约、构建及包装，Zotero GUI、真实输入法和物理输入另按 [main 验收规范](docs/ACCEPTANCE.md)验证。
- 文档站只说明当前 `main`，安装入口指向相应 CI 附件或源码构建；文档合并不等于正式发布。
