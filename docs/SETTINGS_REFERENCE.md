# 设置参考

设置中心提供下列控件和默认值，操作步骤见[设置指南](SETTINGS_GUIDE.md)。普通偏好通常立即保存；快捷键草稿通过“应用绑定”提交，可选增强则在保存模块请求并完全重启 Zotero 后生效。

| 控件 | 默认值 | 作用 |
| --- | --- | --- |
| 交互配色 | Zotero | 仅控制交互标记和状态颜色，可选 Zotero、Catppuccin、Tokyo Night、Gruvbox 或自定义配色；面板颜色跟随宿主。 |
| 标记宽度（px） | 3 px | Main Cursor 和 Select 标记宽度，可选 1 至 4 px。 |
| 状态样式 | 中性 | 状态指示器可选中性或着色。 |
| 文本选择模式 | 开 | 允许 `v` 或原生 Zotero 文本选择进入 Reader Select。 |
| 批注评论编辑 | 开 | 允许 Reader Normal 的 `i` / `Enter` 编辑选中批注；关闭后 `i` 改为原生输入透传。 |
| Vim 风格笔记编辑 | 关 | 在上下文面板和独立 Note 标签页中启用 Vim 编辑；新配置默认保留 Zotero 原生输入。 |
| 滚动模式 | 恒速 | 可选步进、恒速、加速；只显示当前模式的参数。 |
| 滚动步长（px） | 60 px | 步进模式下每次 `j` / `k` / `zh` / `zl` 的距离；count 乘以步长。 |
| 滚动速度（px/s） | 2000 px/s | 恒速模式按住按键时的速度。 |
| 初始速度（px/s） | 2000 px/s | 加速模式起始速度。 |
| 最大速度（px/s） | 2000 px/s | 加速模式最大速度。 |
| 加速度（px/s²） | 2600 px/s² | 按住滚动键后的速度增量。 |
| 减速度（px/s²） | 4200 px/s² | 松开滚动键后的减速量。 |
| 松开按键时立即停止 | 关 | 加速模式松键后直接停止。 |
| 持久化标记 | 关 | marks 存入父条目的 Extra；独立 PDF 使用附件的 Extra。写入失败时回退到不同步的本地偏好。 |
| 默认颜色 | 黄色 | 未明确指定颜色的下划线或 Add note 使用此颜色。 |
| 显示前缀提示 | 开 | 多键命令等待期间显示可用后续按键；Main、Reader 和 Note 默认命令前缀为 `<Space>`。 |
| 显示延迟（ms） | 200 ms | 前缀提示显示前的延迟，范围 0 至 1000 ms。 |
| 字号（px） | 15 px | 前缀提示字号，范围 12 至 24 px。 |
| 鼠标单击选择、双击确认 | 开 | 单击选择共享选择器结果，双击确认；悬停保留当前选择。 |
| 语言 | 跟随 Zotero | 本地化设置与命令标签，也可固定为 English 或中文。 |
| 命名空间分隔符 | `/` | 将扁平标签显示为虚拟路径；留空则按平面标签匹配。 |

Neo 面板跟随 Zotero 计算出的浅色或深色配色。快捷键草稿操作见[修改快捷键](SETTINGS_GUIDE.md#修改一个快捷键)。

上表是新配置的默认值。升级已有配置时，Neo 保留鼠标选择与 Vim 笔记编辑的原有行为，包括旧默认值和手动选择。

## 模块

当前目录共 21 个模块：15 个固定启用的核心模块和 6 个可选增强；完整目录见[模块所有权表](MODULE_DESIGN.md#模块目录与所有权)。可选 ID 为 `reader-hints`、`extensions`、`translation`、`ai-qa`、`references` 和 `tab-enhancements`。
模块请求使用 `extensions.zotero-neo.modules.<id>.enabled`。`reader-hints`、`extensions` 和 `references` 默认 `true`；`translation`、`ai-qa` 和 `tab-enhancements` 默认 `false`。`translation` 与 `ai-qa` 依赖固定启用的 `reader-selection`。启用 `ai-qa` 需要单独保存请求；旧版 `reader-ai` 的偏好保留原义。核心功能始终启用，旧 `extensions.zotero-neo.modules.<core>.enabled=false` 值按兼容数据保留。

| 模块 ID | 名称 | 功能与依赖 |
| --- | --- | --- |
| `library` | 文库 | 树导航、条目查找、搜索入口、打开、标识符录入、citekey 和最近回收批次。 |
| `worksets` | 工作集 | Main Persistent Selection、Visual 行范围和 Selection Panel；Main Visual 由此核心分区提供。 |
| `tags` | 标签 | 添加/移除标签及 Main 标签过滤。 |
| `collections` | 分类 | 分类查找、成员关系及结构工作流。 |
| `reader-navigation` | 阅读导航 | 页面、滚动、缩放、搜索、位置遍历、marks 与原生侧栏增强。 |
| `reader-chapters` | 章节查找 | 章节范围选择、字面查找及确认定位；原生 Find 保留独立查询。 |
| `reader-figures` | 图表浏览 | 图表筛选、原图预览和确认定位；依赖 `reader-navigation` 提供既有来源与导航。 |
| `document-comparison` | 文档解析对照 | 本地规则／原生 SDT／云端解析对照、缓存和显式解析；上传由云端解析按钮发起。 |
| `reader-selection` | 阅读选区 | Select、范围动作、Flash、复制/搜索所选文本和所选文本操作面板。 |
| `translation` | 翻译增强 | 可选增强：手动翻译、自动译文弹窗保存与侧栏译文角色；依赖 `reader-selection`，新配置默认关闭。准备流程见[设置指南](SETTINGS_GUIDE.md#准备翻译增强)。 |
| `reader-annotations` | 阅读批注 | 批注创建、删除、改色、过滤、复制和评论编辑。 |
| `reader-excerpts` | 对象摘录 | 图表／公式的预览、复制及显式保存为来源笔记。 |
| `chapter-notes` | 章节笔记整理 | 来源内容的章节归属、筛选、预览与显式生成笔记。 |
| `document-preparation` | 文档准备 | Main／Reader 的 PDF 准备入口；应用级队列在界面关闭后继续运行。 |
| `reader-hints` | 链接与复制提示 | 可选增强：复制／跟随提示，可独立读取 Zotero 原生批注。 |
| `references` | 引用增强 | 可选增强：在本机定位参考文献和已识别的正文提及，按需查询原始学术元数据。默认开启，使用本机解析和学术元数据 API。操作见[阅读器指南](READER_GUIDE.md#查找和核对参考文献)。 |
| `ai-qa` | AI 问答（实验） | 可选增强：解释当前 Reader 选区，就选区或有限章节证据提问，并准备章节图文导引；图像输入可选关联图表裁图，数据范围限定为当前任务证据。依赖 `reader-selection`，默认关闭。 |
| `notes` | 笔记 | 笔记查找、打开及可选 Vim 编辑。 |
| `workspace` | 工作区 | 标签页操作、Show in Library、Reader 分屏与方向焦点，可独立使用。 |
| `extensions` | 扩展管理面板 | 可选增强：管理 Zotero 附加组件的 Plugin Manager，提供固定官方 Translate 安装及所选插件更新。 |
| `tab-enhancements` | 标签页增强 | 可选增强：Main 左／右垂直栏或上方横向标签，以及一级活动标签分组；依赖 `workspace`，默认关闭。分组流程见[标签页增强指南](MAIN_GUIDE.md#用标签页增强管理阅读分组)。 |

| 运行状态 | 含义 |
| --- | --- |
| 已启用（Enabled） | 当前宿主中的模块激活成功。 |
| 已停用（Disabled） | 可选增强已应用关闭请求，其实例和交互贡献随之释放。 |
| 已阻止（Blocked） | 当前启用图或宿主缺少必需依赖；可根据界面列出的依赖调整请求。 |
| 失败（Failed） | 当前宿主实例激活失败，入口已退休并尝试清理资源；界面显示原因，日志保留原错误。新宿主实例或重启 Zotero 后可再次激活。 |
| 等待主机（Pending host） | 等待支持的宿主出现，例如打开 Reader。 |
| 等待重启（Pending restart） | 已保存请求与已应用值不同；当前功能继续使用已应用值。 |

界面分别显示草稿、已保存请求和已应用值。“恢复默认模块请求”将 `reader-hints`、`extensions`、`references` 设为开启，将 `translation`、`ai-qa`、`tab-enhancements` 设为关闭，并显式保留 `translation=false`。保存或恢复后，完全重启 Zotero 才会应用；热重载继续使用本次启动快照，缺失的可选模块标记按关闭处理。核心模块偏好和其他行为设置保持原样。

行为偏好控制模块内的具体操作：`noteEditor.enabled=false` 保留笔记查找，关闭 Vim 编辑；`annotationCommentEditor.enabled=false` 保留 Select 的添加批注评论和原生评论；`marks.persist=false` 使用会话内 marks；`mode.visual.enabled` 等键各按原义生效。核心 `worksets` 始终启用，Main Visual 由其专属偏好控制。关闭可选增强后，绑定、marks、主题、行为偏好和原生数据继续保留。

设置、共享焦点、Picker 与后退／前进属于核心交互。关闭六项可选增强后，仍可通过 Zotero 原生偏好页的 Open Neo Settings 或 `Zotero.Neo.openSettings` 打开设置。步骤见[模块设置指南](SETTINGS_GUIDE.md#开关可选功能)。

## 标签页增强的显示设置

这些控件位于“Neo 设置 → 模块 → 标签页增强”的“标签页显示”区域。模块请求在完全重启后应用；模块已启用时，显示位置变更立即生效。显示偏好使用 `extensions.zotero-neo.tabEnhancements.{side,width,collapsed,titleFormat}`。

| 偏好键 | 默认值 | 含义 |
| --- | --- | --- |
| `extensions.zotero-neo.tabEnhancements.side` | `left` | 显示位置；可选 `left`（**最左侧**）、`right`（**最右侧**）或 `top`（**上方**）。默认仍为 `left`。 |
| `extensions.zotero-neo.tabEnhancements.width` | `260` px | 左／右侧栏展开宽度，范围为 `180` 至 `520` px。 |
| `extensions.zotero-neo.tabEnhancements.collapsed` | `false` | 左／右侧栏是否收起；已有收起／展开快捷键定义保持不变。 |
| `extensions.zotero-neo.tabEnhancements.titleFormat` | `{title}` | Neo 标签页增强界面中的标签标题模板。 |

标题模板支持以下动态字段：

| 占位符 | 显示内容 |
| --- | --- |
| `{title}` | 所属文献标题。 |
| `{citekey}` | 所属常规条目在 Zotero／Better BibTeX 中的实际引用键；缺失时该字段为空。 |
| `{author}` | 首位创建者的姓氏或名称。 |
| `{year}` | 日期字段中识别出的四位年份。 |
| `{filename}` | 附件文件名。 |

:::: v-pre

用 `{{` 和 `}}` 显示字面花括号。模板按上述占位符替换文字，校验通过后保存；未知占位符或不配对的花括号会提示错误。动态字段全空时，整项回退为原生标签标题；纯字面模板按原文显示。分隔符始终作为字面文字保留，例如 `{citekey} — {title}` 在 citekey 缺失、标题存在时仍显示分隔号。修改范围是 Neo 标签展示，Zotero 原生标题与文献元数据保持原样。

::::

阅读分组保存在当前 Zotero 配置文件中，以 `extensions.zotero-neo.tabEnhancements.groups.v2` 为唯一模型，旧 `groups.v1` 留作备份。分组属于 Neo 的本机阅读组织数据，Zotero 标签与分类各自保留。停用模块或点击“恢复标签页显示默认值”后，分组仍可复用。操作见[标签页增强指南](MAIN_GUIDE.md#用标签页增强管理阅读分组)。


## 引用增强的元数据来源与密钥

参考文献解析、PDF 跳转和所属文库匹配在本机完成。打开“论文详情”先读配置文件内的缓存，缺失时显示“没有缓存的元数据。请搜索以获取。”。点击“搜索元数据”后，先按规范化查询词或标识符查缓存，包括过期结果；缺失时才请求 Semantic Scholar 或 arXiv。“刷新元数据”直接请求新结果，请求内容限于查询词或标识符。

DOI 和标题查询使用 Semantic Scholar 免费 Graph API，arXiv ID 查询使用免费 arXiv 接口。Semantic Scholar 可提供题名、作者、年份、刊名、摘要、标识符、来源链接和 API 计数；arXiv 可提供题名、作者、年份、期刊字段与原始摘要。字段按来源实际返回值展示，缺失项留空。标题查询得到多个候选时，由你选择采用哪一项。

元数据缓存保存在当前配置文件的 `zotero-neo-reference-cache.json`，格式版本为 1，最多 50 条、4 MiB。成功取得的论文元数据满 30 分钟后标为过期并继续保留。详情显示来源、原始获取时间和状态；刷新失败时显示错误，已有结果与时间仍保留。缓存范围限于论文元数据，PDF 文本、笔记、坐标与凭据由各自功能管理。

Semantic Scholar API Key 是可选的元数据查询凭据，可从 [Semantic Scholar API 页面](https://www.semanticscholar.org/product/api)申请。匿名查询同样可用，额度由服务限流策略决定；本机匹配可直接使用。

在“Neo 设置 → 阅读器 → Semantic Scholar”密码框填写或修改密钥，输入会立即保存到 Zotero 本机 Login Manager。删空即清除，重开时以掩码回填已有值；关闭设置后仍保留已输入的改动。密钥值由密码管理器保管，普通偏好、结果和日志保留非秘密信息；论文详情使用该设置入口提供的凭据。

点击“验证”会向只读 Graph API 发起检查；PDF 保留在本机，打开设置和编辑密钥仅更新本机状态。界面分别反馈无效凭据、拒绝访问、限流和网络／服务异常；403 可能表示密钥错误或接口权限不足，需要结合服务配置核对。验证结果反映该次访问状态，后续额度和查询质量由服务决定。

密钥和元数据缓存独立管理。“清除元数据缓存”只清缓存，文库条目、已采纳记录和凭据继续保留。查询或存储失败时会显示具体结果，可在核对后再次操作。完整步骤见[阅读器指南](READER_GUIDE.md#查找和核对参考文献)。

## 配置 AI 问答（实验）

明确启用 `ai-qa` 并完全重启 Zotero 后，Reader Normal 的 `<Space>aa` 打开 AI 问答面板，Reader Select 的 `neo.ai-qa.explain` 提供选区解释。API 协议、基础 URL、模型、最大输出 token 数和发送图像选项均在该面板配置。最大输出 token 数默认 `2048`，图像发送默认关闭。服务地址使用 HTTPS，回环地址也可使用 HTTP。

协议可选 OpenAI Chat Completions（`openai-chat-completions`）或 OpenAI Responses（`openai-responses`）。基础 URL 填写 `/chat/completions` 或 `/responses` 之前的服务路径。旧配置沿用 Chat Completions；Responses 请求使用独立会话并设置 `store: false`。每次请求按你选择的协议执行，服务需支持该协议和 JSON Schema 结构化输出；协议调整由你手动完成。

API 密钥按端点保存在本机密码管理器，界面只显示保存状态；MinerU、PDFTranslate 的凭据分别管理。编辑或忘记密钥的操作始终绑定当前草稿端点，其他 Reader 的配置各自保存。打开面板先读取本机成果与缓存；点击解释选区、提问或准备章节证据后，才会收集当前 Reader 的选区或有限章节证据并请求模型。图像发送开启后可附带最多 4 张关联图表局部 PNG。输入范围限定在当前任务，成果保存在本机；每次请求固定使用所选服务，在重定向或失败时返回错误，再次请求由明确操作发起。

关闭模块后，配置、端点凭据、成果、人工修订和已采纳的 Note 均保留。实现改名沿用 `ai.configuration`、`.zotero-neo-reader-ai.json`、端点凭据身份及 Note provenance／幂等标记，已有成果和人工内容继续使用。

选区解释与章节提问的操作流程见[AI 问答操作指南](READER_GUIDE.md#解释选区和询问论文)。

## 文档解析对照

Reader Normal 按 `<Space>rd` 打开文档解析对照，默认选择本地规则（无模型）。后端保存为 `extensions.zotero-neo.documentAnalysis.provider`（`local` / `mineru` / `oxr`）；缺失或无效值按 `local` 处理，已有明确选择保留。本地模式可直接使用。MinerU 采用官方 v4 API；OXR 地址在成功解析后保存为 `extensions.zotero-neo.documentAnalysis.oxr.endpoint`。

MinerU API Token 用于云端 PDF 解析，可按 [MinerU API 文档](https://mineru.net/apiManage/docs)申请。它与 Semantic Scholar 元数据密钥分别管理。在阅读器设置、单篇对照或批量准备中输入后，Token 自动保存到本机密码管理器，三处共用；删空即清除，重开时回填已有值。“验证”发送只读任务状态请求，用于检查凭据；解析任务、PDF 上传和额度使用由后续明确操作决定。

OXR 密钥在本次对话框内使用，免费接口默认值为 `dummy`；自部署服务可填写对应地址和密钥。凭据在请求时单独传入，普通偏好、任务记录、缓存和复制报告只保存各自的非秘密信息。

本地规则使用 Zotero 自带 PDF.js 的可提取文字、向量路径和图像位置，提供文字与区域布局。普通 Reader 入口按需处理，对照面板的显式解析负责持久保存。原生 SDT 作为独立来源，通过“读取原生结构”准备，可能使用 Zotero 模型；公式 LaTeX、表格单元格和 OCR 也属于相应后端的能力。MinerU／OXR 上传由云端解析操作发起。所有后端统一使用 PDF 用户坐标，文字批注通过精确原生映射保存。

当前后端的有效布局用于图表导航、正文选择和侧栏增强。更换后端或保存新分析后，旧目标退休，后续操作读取新布局。区域列表按图表组展示，定位使用成员矩形；MinerU 的显式成员关系保留，本地规则结合题注、分栏、绘图和正文阻隔判断。列表会标记缺主体或关联不确定的结果，方便核对；跨页对象先定位题注所在的第一页。缓存和纠错步骤见[选择指南](SELECTION_GUIDE.md#对照原生与云端解析)。

Main／Reader Normal 的 `<Space>ru` 打开“使用 MinerU 准备 PDF”。此入口固定使用 MinerU，当前 Reader 后端选择保持原样。面板说明该选择能否消费 MinerU 缓存，批量范围、进度和恢复见[批量准备论文](SELECTION_GUIDE.md#批量准备论文)。
