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

项目有 12 个内部功能分区，但不表示有 12 个可选开关。`library`、`worksets`、`tags`、`collections`、`reader-navigation`、`reader-selection`、`reader-annotations`、`notes`、`workspace` 九个核心分区固定启用；只有 `reader-hints`（链接与复制提示）、`extensions`（扩展管理面板）和 `ai-qa`（AI 问答（实验））可配置。
模块偏好键分别为 `extensions.zotero-neo.modules.reader-hints.enabled`、`extensions.zotero-neo.modules.extensions.enabled` 与 `extensions.zotero-neo.modules.ai-qa.enabled`。前两项默认 `true`，`ai-qa` 默认 `false`。`ai-qa` 依赖固定启用的 `reader-selection`。旧版 `reader-ai` 的偏好不会自动启用 `ai-qa`；必须明确请求启用。已有 `extensions.zotero-neo.modules.<core>.enabled=false` 值会被忽略，不会关闭核心功能。

| 模块 ID | 名称 | 功能与依赖 |
| --- | --- | --- |
| `library` | 文库 | 树导航、条目查找、搜索入口、打开、标识符录入、citekey 和最近回收批次。 |
| `worksets` | 工作集 | Main Persistent Selection、Visual 行范围和 Selection Panel；Main Visual 由此核心分区提供。 |
| `tags` | 标签 | 添加/移除标签及 Main 标签过滤。 |
| `collections` | 分类 | 分类查找、成员关系及结构工作流。 |
| `reader-navigation` | 阅读导航 | 页面、滚动、缩放、搜索、位置遍历、marks 与原生侧栏增强。 |
| `reader-selection` | 阅读选区 | Select、范围动作、Flash、复制/搜索所选文本和所选文本操作面板。 |
| `reader-annotations` | 阅读批注 | 批注创建、删除、改色、过滤、复制和评论编辑。 |
| `reader-hints` | 链接与复制提示 | 可选增强：复制／跟随提示；读取 Zotero 原生批注不依赖阅读批注模块。 |
| `ai-qa` | AI 问答（实验） | 可选增强：解释当前 Reader 选区、就选区或有限章节证据提问，并准备章节图文导引；仅可选附带相关图表裁图，不检索批注、笔记或其他论文。依赖 `reader-selection`；默认关闭。 |
| `notes` | 笔记 | 笔记查找、打开及可选 Vim 编辑。 |
| `workspace` | 工作区 | 标签页操作、Show in Library、Reader 分屏与方向焦点；不依赖 `library` 或 `reader-navigation`。 |
| `extensions` | 扩展管理面板 | 可选增强：已安装 Zotero 扩展的 Plugin Manager；不管理 Neo 内部模块。 |

| 运行状态 | 含义 |
| --- | --- |
| 已启用（Enabled） | 当前宿主中的模块激活成功。 |
| 已停用（Disabled） | 仅适用于 `reader-hints`、`extensions` 或 `ai-qa`；当前已应用请求关闭，不创建对应增强实例，其贡献不参与按键、前缀提示或命令面板。 |
| 已阻止（Blocked） | 当前启用图或实际宿主缺少必需依赖；界面列出依赖，不自动修改开关。 |
| 失败（Failed） | 当前宿主实例激活失败，已退休其入口并尝试清理部分资源；显示失败原因，详细日志保留原错误。该实例不自动重试，新宿主实例或重启 Zotero 可重新激活。 |
| 等待主机（Pending host） | 尚未在支持的宿主激活，例如还没有打开 Reader。 |
| 等待重启（Pending restart） | 保存请求与已应用值不同，附加在当前状态后；当前能力不提前变化。 |

草稿、已保存请求与已应用值分别显示。**恢复默认模块请求**会将 `reader-hints`、`extensions` 设为开启，将 `ai-qa` 设为关闭；恢复后仍需重启 Zotero。保存与恢复默认都不改动核心模块偏好或其他行为设置。

行为与存储偏好不等于模块开关：`noteEditor.enabled=false` 只关闭 Vim 风格笔记编辑，不关闭笔记查找；`annotationCommentEditor.enabled=false` 不关闭 Select 的添加批注评论或原生评论；`marks.persist=false` 仍允许会话内 marks；`mode.visual.enabled` 等保留各自原义。核心 `worksets` 固定启用，Main Visual 的行为仍可由其专属偏好控制。关闭可选增强不清除绑定、marks、主题、行为偏好或原生数据。

设置、共享焦点、Picker 与后退／前进属于核心交互，不随可选增强停用。即使关闭全部三项可选增强，九个核心分区仍保持启用；Zotero 原生偏好页中的 **Open Neo Settings** 与 `Zotero.Neo.openSettings` 仍可用于设置。详细步骤见[模块设置指南](SETTINGS_GUIDE.md#开关可选功能)。

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
