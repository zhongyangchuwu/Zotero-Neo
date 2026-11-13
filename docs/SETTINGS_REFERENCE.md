# 设置参考

本页维护控件和默认值。修改绑定、保存与选择设置的方法见[设置指南](SETTINGS_GUIDE.md)。普通偏好通常立即保存；快捷键编辑需点击**应用绑定**；可选增强的模块请求需单独保存并完全重启 Zotero。

| 控件 | 默认值 | 作用 |
| --- | --- | --- |
| 主题 | Zotero | 交互配色，可选 Zotero、Catppuccin、Tokyo Night、Gruvbox 或自定义主题。 |
| 标记宽度（px） | 3 px | Main Cursor 和 Select 标记宽度，可选 1–4 px。 |
| 状态样式 | 中性 | 状态指示器可选中性或着色。 |
| 文本选择模式 | 开 | 允许 `v` 或原生 Zotero 文本选择进入 Reader Select。 |
| 批注评论编辑 | 开 | 允许 Reader Normal 的 `i` / `Enter` 编辑选中批注；关闭后 `i` 改为原生输入透传。 |
| Vim 风格笔记编辑 | 开 | 在上下文面板和独立 Note 标签页中启用 Vim 编辑。 |
| 滚动模式 | 恒速 | 可选步进、恒速、加速；只显示当前模式的参数。 |
| 滚动步长（px） | 60 px | 步进模式下每次 `j` / `k` / `zh` / `zl` 的距离；count 乘以步长。 |
| 滚动速度（px/s） | 2000 px/s | 恒速模式按住按键时的速度。 |
| 初始速度（px/s） | 2000 px/s | 加速模式起始速度。 |
| 最大速度（px/s） | 2000 px/s | 加速模式最大速度。 |
| 加速度（px/s²） | 2600 px/s² | 按住滚动键后的速度增量。 |
| 减速度（px/s²） | 4200 px/s² | 松开滚动键后的减速量。 |
| 松开按键时立即停止 | 关 | 加速模式松键后立即停止，不再逐渐减速。 |
| 持久化标记 | 关 | marks 存入父条目的 Extra；独立 PDF 使用附件的 Extra。写入失败时回退到不同步的本地偏好。 |
| 默认颜色 | 黄色 | 未明确指定颜色的下划线或 Add note 使用此颜色。 |
| 显示前缀提示 | 开 | 多键命令等待期间显示可用后续按键；Main、Reader 和 Note 默认命令前缀为 `<Space>`。 |
| 显示延迟（ms） | 200 ms | 前缀提示显示前的延迟，范围 0–1000 ms。 |
| 字号（px） | 15 px | 前缀提示字号，范围 12–24 px。 |
| 鼠标单击选择、双击确认 | 关 | 开启后单击选择、双击确认共享选择器结果；悬停不选择。 |
| 语言 | 跟随 Zotero | 本地化设置与命令标签，也可固定为 English 或中文。 |
| 命名空间分隔符 | `/` | 将扁平标签显示为虚拟路径；留空则按平面标签匹配。 |

Neo 面板跟随 Zotero 计算出的浅色或深色配色。快捷键草稿操作见[修改快捷键](SETTINGS_GUIDE.md#修改一个快捷键)。

## 模块

当前目录共 21 个模块：15 个固定启用的核心模块和 6 个可选增强；完整目录见[模块所有权表](MODULE_DESIGN.md#模块目录与所有权)。可选 ID 为 `reader-hints`、`extensions`、`translation`、`ai-qa`、`references` 和 `tab-enhancements`。
模块请求使用 `extensions.zotero-neo.modules.<id>.enabled`。`reader-hints`、`extensions` 和 `references` 默认 `true`；`translation`、`ai-qa` 和 `tab-enhancements` 默认 `false`。`translation` 与 `ai-qa` 依赖固定启用的 `reader-selection`。旧版 `reader-ai` 的偏好不会自动启用 `ai-qa`；必须明确请求启用。已有 `extensions.zotero-neo.modules.<core>.enabled=false` 值会被忽略，不会关闭核心功能。

| 模块 ID | 名称 | 功能与依赖 |
| --- | --- | --- |
| `library` | 文库 | 树导航、条目查找、搜索入口、打开、标识符录入、citekey 和最近回收批次。 |
| `worksets` | 工作集 | Main Persistent Selection、Visual 行范围和 Selection Panel；Main Visual 由此核心分区提供。 |
| `tags` | 标签 | 添加/移除标签及 Main 标签过滤。 |
| `collections` | 分类 | 分类查找、成员关系及结构工作流。 |
| `reader-navigation` | 阅读导航 | 页面、滚动、缩放、搜索、位置遍历、marks 与原生侧栏增强。 |
| `reader-chapters` | 章节查找 | 章节范围选择、字面查找及确认定位，不改写原生 Find。 |
| `reader-figures` | 图表浏览 | 图表筛选、原图预览和确认定位；依赖 `reader-navigation` 提供既有来源与导航。 |
| `document-comparison` | 文档解析对照 | 原生／云端解析对照、缓存和显式解析；打开面板不自动上传。 |
| `reader-selection` | 阅读选区 | Select、范围动作、Flash、复制/搜索所选文本和所选文本操作面板。 |
| `translation` | 翻译增强 | 可选增强：手动翻译、自动译文弹窗保存与侧栏译文角色；依赖 `reader-selection`，新配置默认关闭。准备流程见[设置指南](SETTINGS_GUIDE.md#准备翻译增强)。 |
| `reader-annotations` | 阅读批注 | 批注创建、删除、改色、过滤、复制和评论编辑。 |
| `reader-excerpts` | 对象摘录 | 图表／公式的预览、复制及显式保存为来源笔记。 |
| `chapter-notes` | 章节笔记整理 | 来源内容的章节归属、筛选、预览与显式生成笔记。 |
| `document-preparation` | 文档准备 | Main／Reader 的 PDF 准备入口；界面关闭不停止已接纳的应用级队列。 |
| `reader-hints` | 链接与复制提示 | 可选增强：复制／跟随提示；读取 Zotero 原生批注不依赖阅读批注模块。 |
| `references` | 引用增强 | 可选增强：在本机定位参考文献和已识别的正文提及；按需查询原始学术元数据。默认开启，不调用 AI。操作见[阅读器指南](READER_GUIDE.md#查找和核对参考文献)。 |
| `ai-qa` | AI 问答（实验） | 可选增强：解释当前 Reader 选区、就选区或有限章节证据提问，并准备章节图文导引；仅可选附带相关图表裁图，不检索批注、笔记或其他论文。依赖 `reader-selection`；默认关闭。 |
| `notes` | 笔记 | 笔记查找、打开及可选 Vim 编辑。 |
| `workspace` | 工作区 | 标签页操作、Show in Library、Reader 分屏与方向焦点；不依赖 `library` 或 `reader-navigation`。 |
| `extensions` | 扩展管理面板 | 可选增强：Zotero 扩展的 Plugin Manager，含固定官方 Translate 安装及所选插件更新；不管理 Neo 内部模块。 |
| `tab-enhancements` | 标签页增强 | 可选增强：Main 左侧／右侧垂直栏或上方横向标签显示，以及不支持嵌套的活动标签分组；依赖 `workspace`，默认关闭。分组流程见[标签页增强指南](MAIN_GUIDE.md#用标签页增强管理阅读分组)。 |

| 运行状态 | 含义 |
| --- | --- |
| 已启用（Enabled） | 当前宿主中的模块激活成功。 |
| 已停用（Disabled） | 仅适用于可选增强；当前已应用请求关闭，不创建对应增强实例，其贡献不参与按键、前缀提示或命令面板。 |
| 已阻止（Blocked） | 当前启用图或实际宿主缺少必需依赖；界面列出依赖，不自动修改开关。 |
| 失败（Failed） | 当前宿主实例激活失败，已退休其入口并尝试清理部分资源；显示失败原因，详细日志保留原错误。该实例不自动重试，新宿主实例或重启 Zotero 可重新激活。 |
| 等待主机（Pending host） | 尚未在支持的宿主激活，例如还没有打开 Reader。 |
| 等待重启（Pending restart） | 保存请求与已应用值不同，附加在当前状态后；当前能力不提前变化。 |

草稿、已保存请求与已应用值分别显示。**恢复默认模块请求**会将 `reader-hints`、`extensions` 和 `references` 设为开启，将 `translation`、`ai-qa` 和 `tab-enhancements` 设为关闭，并显式保留 `translation=false`；恢复后仍需完全重启 Zotero。Neo 热重载沿用已应用的启动快照，不能应用新请求；旧启动快照中缺少某个可选模块标记时，该模块按关闭处理。保存与恢复默认都不改动核心模块偏好或其他行为设置。

行为与存储偏好不等于模块开关：`noteEditor.enabled=false` 只关闭 Vim 风格笔记编辑，不关闭笔记查找；`annotationCommentEditor.enabled=false` 不关闭 Select 的添加批注评论或原生评论；`marks.persist=false` 仍允许会话内 marks；`mode.visual.enabled` 等保留各自原义。核心 `worksets` 固定启用，Main Visual 的行为仍可由其专属偏好控制。关闭可选增强不清除绑定、marks、主题、行为偏好或原生数据。

设置、共享焦点、Picker 与后退／前进属于核心交互，不随可选增强停用。即使关闭全部六项可选增强，核心分区仍保持启用；Zotero 原生偏好页中的 **Open Neo Settings** 与 `Zotero.Neo.openSettings` 仍可用于设置。详细步骤见[模块设置指南](SETTINGS_GUIDE.md#开关可选功能)。

## 标签页增强的显示设置

这些控件位于 **Neo 设置 → 模块 → 标签页增强**卡片的**标签页显示**区域，而不是 Zotero 原生偏好页。模块请求仍需完全重启 Zotero；模块启用时，显示位置变更立即生效。显示偏好使用以下键：`extensions.zotero-neo.tabEnhancements.{side,width,collapsed,titleFormat}`。

| 偏好键 | 默认值 | 含义 |
| --- | --- | --- |
| `extensions.zotero-neo.tabEnhancements.side` | `left` | 显示位置；可选 `left`（**最左侧**）、`right`（**最右侧**）或 `top`（**上方**）。默认仍为 `left`。 |
| `extensions.zotero-neo.tabEnhancements.width` | `260` px | 左／右侧栏展开时的宽度，范围 `180`–`520` px。 |
| `extensions.zotero-neo.tabEnhancements.collapsed` | `false` | 左／右侧栏是否收起；已有收起／展开快捷键定义保持不变。 |
| `extensions.zotero-neo.tabEnhancements.titleFormat` | `{title}` | Neo 标签页增强界面中的标签标题模板。 |

标题模板支持以下动态字段：

| 占位符 | 显示内容 |
| --- | --- |
| `{title}` | 所属文献标题。 |
| `{citekey}` | 所属常规条目的真实 citekey；使用 Zotero／Better BibTeX 可用的引用键，不会用 Zotero item key 冒充。 |
| `{author}` | 首位创建者的姓氏或名称。 |
| `{year}` | 日期字段中识别出的四位年份。 |
| `{filename}` | 附件文件名。 |

:::: v-pre

用 `{{` 和 `}}` 分别显示字面左、右花括号。未知占位符或不配对的花括号会校验失败，设置不会保存无效模板。模板只识别上述占位符，不计算表达式。模板含动态占位符但所有对应字段都为空时，整项显示回退为原生标签标题；模板只有字面文本时则按字面文本显示。字面分隔符不会因某个字段为空而自动隐藏：例如 `{citekey} — {title}` 在 citekey 缺失但标题存在时仍会显示分隔号；若所有字段都为空，则回退为原生标题。标题模板不会改写 Zotero 原生标签标题或文献元数据。

::::

阅读分组仅保存在当前 Zotero 配置文件中，`extensions.zotero-neo.tabEnhancements.groups.v2` 是唯一模型；旧 `groups.v1` 原样保留为备份。分组不是 Zotero 标签或分类。停用模块或点击**恢复标签页显示默认值**不会删除分组；完整操作见[标签页增强指南](MAIN_GUIDE.md#用标签页增强管理阅读分组)。


## 引用增强的元数据来源与密钥

本机解析、在 PDF 中跳转和查找当前 Reader 所属文库都不访问元数据服务，也不需要密钥或 AI。打开**论文详情**只检查配置文件内的缓存；未命中显示“没有缓存的元数据。请搜索以获取。”，不会发出请求。点击**搜索元数据**后先按规范化查询词或标识符查缓存（包括已过期的结果）；命中时不联网，未命中时才请求 Semantic Scholar 或 arXiv。点击**刷新元数据**会跳过缓存并请求新结果。请求只包含查询词或标识符，不上传 PDF。

DOI 或标题查询使用 Semantic Scholar 的免费 Graph API，arXiv ID 查询使用免费的 arXiv 接口。Semantic Scholar 可返回题名、作者、年份、刊名、摘要、标识符、来源链接及 API 计数；arXiv 可返回题名、作者、年份、期刊字段和原始摘要，不提供引用计数。来源未给出的字段保持缺失，不会合成摘要或分类。标题查询可能返回候选项，必须手动选择，不会自动采用第一条。

缓存保存在当前 Zotero 配置文件的 `zotero-neo-reference-cache.json`，格式版本为 1，最多 50 条、文件不超过 4 MiB。只保存成功取得的论文元数据；缓存满 30 分钟后标为已过期但不会因此删除。详情显示来源、原始获取时间以及已获取、缓存或已过期状态；刷新失败时显示错误并保留已有结果、来源和原始获取时间。缓存不含 PDF 文本、笔记、坐标或凭据。

Semantic Scholar API 密钥为可选项；没有密钥时仍可匿名查询，但服务可能限流（429）或离线。在 **Neo 设置 → 阅读器 → Semantic Scholar** 中显式保存或忘记密钥；论文详情不提供密钥表单。密钥存入 Zotero 本机 Login Manager，不写入普通偏好、结果或日志，密码框不回显已有值。关闭设置会清空未提交的输入；保存或忘记密钥不会清除元数据缓存。点击**清除元数据缓存**只清缓存，不删除文库条目、已采纳记录或凭据。查询、读取或写入失败会如实显示，不自动重试。完整操作见[阅读器指南](READER_GUIDE.md#查找和核对参考文献)。

## 配置 AI 问答（实验）

Reader Normal 中按 `<Space>aa` 打开 AI 问答面板；只有 `ai-qa` 已明确启用并在 Zotero 完全重启后才提供该入口。Reader Select 的选区操作提供 `neo.ai-qa.explain`（解释选区）。API 协议、基础 URL、模型、最大输出 token 数及是否允许发送图像都在该面板配置，不在 Zotero 原生偏好页中配置。最大输出 token 数默认是 `2048`；发送图像默认关闭。服务地址须使用 HTTPS，或使用回环地址的 HTTP。

协议可选 **OpenAI Chat Completions**（`openai-chat-completions`）或 **OpenAI Responses**（`openai-responses`）；基础 URL 不含 `/chat/completions` 或 `/responses` 后缀。旧配置没有协议字段时仍按 Chat Completions 读取，选择 Responses 时发送无会话续接的请求并设置 `store: false`。协议不会自动探测，也不会在失败后自动切换；服务须支持所选协议和 JSON Schema 结构化输出。

API 密钥按端点存入 Zotero 本机密码管理器，界面只显示是否已有密钥，不提供密钥读回；它与 MinerU、PDFTranslate 凭据分开。正在编辑的密钥或忘记密钥操作绑定当前草稿端点，不因另一 Reader 保存配置而换到别的地址。打开面板只读取本地成果与缓存，不会调用模型；只有显式解释选区、提问或准备章节证据才会准备数据并请求模型。请求仅使用当前 Reader 的选区或有限章节证据；不会检索批注、笔记或其他论文。只有开启发送图像后，才可能附带最多 4 张关联图表局部 PNG。已完成成果保存在本机，不通过 Zotero 同步；请求不会自动跟随重定向、重试或切换其他服务。

关闭模块不会清除现有配置、端点凭据、成果、人工修订或已采纳的 Note。实现改名保留原有持久化身份，包括 `ai.configuration`、附件文件 `.zotero-neo-reader-ai.json`、端点凭据身份及 Note provenance／幂等标记；不会因改名覆盖成果或人工修改。

选区解释与章节提问的操作流程见[AI 问答操作指南](READER_GUIDE.md#解释选区和询问论文)。

## 文档解析对照

Reader Normal 中按 `<Space>rd` 打开对照界面。默认服务是 MinerU 官方云端；服务选择保存为 `extensions.zotero-neo.documentAnalysis.provider`（`mineru` / `oxr`）。MinerU 使用官方 v4 API，需填写官网 Token。OXR API 地址在一次成功解析后保存为 `extensions.zotero-neo.documentAnalysis.oxr.endpoint`；MinerU Token 可在 Neo 设置 → Reader 或解析面板中保存至 Zotero 本机密码管理器，单篇与批量准备共用；支持清除。未保存的输入和 OXR 密钥只用于本次对话框。密钥不写入普通偏好、任务记录、解析缓存或复制报告。默认 OXR 免费接口使用 `dummy`，部署自己的兼容服务时可填写对应地址和密钥。

当前实现包含原生 SDT、MinerU 官方云端和 OXR 完整解析后端。云端解析由界面按钮显式发起；打开论文不会自动上传。接口返回的区域坐标会转换为原 PDF 用户坐标；原生文字批注继续要求精确的来源映射。

当前选定服务的有效缓存会同时用于常规图表导航和原生侧栏增强，不需要 API Token，也不触发上传；更换服务或保存新的分析会退休原有图表目标。对照界面在每个后端的区域列表前列出可识别的图表组。展开后按“定位整组”，使用关联图片、表格和 caption 的真实矩形。报告中的 `objectGroups` 保留成员 ID 和关联状态。MinerU 的显式对象成员关系优先保留，即使题注缺失或被标为脚注，表格仍可定位。其他结果的几何分组依赖后端把 caption 标为图注；普通正文中的 “Figure 2” 引用不会被自动提升为图注。几何关联属于启发式判断，遇到歧义会显示回退状态；跨页对象目前只定位 caption 的第一页，不推断跨页图片关系。

Main／Reader Normal 的 `<Space>ru` 打开增强阅读准备面板。批量范围、进度与任务恢复见[批量准备论文](SELECTION_GUIDE.md#批量准备论文)。
