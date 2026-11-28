# Neo 成果附件格式 v1

本文供需要读取或生成 Neo 成果的工具使用。以 `src/artifacts/contracts.ts`、`src/artifacts/validation.ts` 和各 payload 的实现为准；附件是数据，不是可执行命令。查询缓存和可重算的解析缓存不是审阅历史。

## 存储与身份

Neo 将 UTF-8 JSON 作为 Zotero 原生 `imported_file` 附件导入普通父文献，与 PDF 并列；不把文件放在 PDF 附件下。父文献必须存在且文库允许写入文件。独立 PDF 应先附到普通文献，不能静默创建父条目。正式附件在本机读回后才视为本机保存成功；文件上传与其他条目修改不是一个跨附件事务。群组库继承 Zotero 的访问权限，文件名不提供私密性。

每个文件有以下封套：

| 字段 | v1 内容 |
| --- | --- |
| `format`, `schemaVersion` | 分别为 `"zotero-neo"` 和 `1`。 |
| `kind` | 当前支持 `metadata-review`。 |
| `libraryURI`, `parentItemKey` | Zotero 文库 URI 和普通父条目的 key；发现文件后仍须与实际父条目核对。 |
| `recordID`, `revisionID`, `parentRevisions` | 记录身份、不可变修订身份和父修订 ID 数组。首个修订的数组为空。 |
| `createdAt`, `producer` | 可解析的时间和含 `name`、`version` 的生产者对象；生产者不是认证身份。 |
| `source` | 可选对象：`attachmentKey`、`contentHash: { algorithm, value }`、`precision`，可选 `parserIdentity`。 |
| `payload` | 带 `version: 1` 的类别数据，见下表。 |

`libraryURI` 可为 Zotero 用户、群组或 `users/local/...` URI。local URI 只表明本地身份；代码仅在当前个人库的本地 URI 与父 key 相符时接受它，不能假定旧 local URI 在其他账号或设备自动有效。本机数字 `itemID`／`libraryID` 和文件路径不是跨设备身份。

如果封套含 `source`，摘要须明确标记 `md5` 或 `sha256`，使用相应长度的小写十六进制；`precision` 为 `document` 或 `region`。

| `kind` | `payload` v1 |
| --- | --- |
| `metadata-review` | `stage` 为 `proposal` 或 `applied`；`query` 是书目查询线索，`paper` 是来源记录，`snapshot` 含 `itemKey` 和审阅时的 `values`，`changes` 为含 `field`、`before`、`after`、`selected` 的差异；`selectedFields` 和 `appliedFields` 记录选择与实际应用字段。读取外部建议时还会验证来源记录，并相对当前条目重新计算差异。 |

字段的完整结构与校验见 `src/metadata-review/artifacts.ts` 和 `src/artifacts/validation.ts`。JSON 限 32 MiB，必须是普通 JSON 值，不能含循环引用、非有限数或原型键。消费者应先验证版本、类别、父条目、来源和整个 payload，不执行其中脚本、HTML 或 URL。外部生产者不得写入 API key、授权信息或带秘密的 URL；元数据审阅会保存查询及条目快照，输入的 BibTeX、字段和来源 URL 也可能进入附件，保存前应自行排除秘密或不愿共享的信息。

## 修订、缺失与迁移

有意义的保存产生新附件修订，不按每次按键写入，也不覆盖旧文件。同一 `revisionID` 不得用于不同内容；相同内容的同一修订可复用。`parentRevisions` 表达分支，离线并发可能出现多个 head，不能按时间戳取最后一个，也不能在文件尚未下载时认定全局只有一个 head。缺失父修订、冲突、回收站中的成果、未知 schema、损坏或未下载文件会报告问题并阻止发布，而不是当成空记录覆盖或自动清理。不同成果类别的冲突需要重新载入或明确处理；不要自行删除历史来消除提示。

能通过封套识别的旧 `document-corrections` 和 `ai-qa` 附件不进入元数据审阅的修订历史，即使已在回收站或 schema 不再受支持。Neo 不迁移、修改或清理这些附件，也不读取旧旁路修正文件或解析缓存。无法识别类别的缺失或损坏 Neo 附件仍会阻止发布，避免误判历史完整。

更新书目字段不依赖成果附件，也不会自动创建记录。明确保存审阅结果时，Neo 才发布 JSON，并可创建关联的 Zotero 原生展示笔记；手工修改笔记不会写回 JSON。重复保存同一附件会复用关联笔记，不覆盖人工修改。

## 跨设备可用性

附件和笔记由 Zotero 管理。本机保存不代表文件已上传；另一台设备看到附件条目也不代表文件已下载。按需下载时，先在 Zotero 下载附件，再重新打开 Neo 审阅。文件缺失时不要把空历史当成没有成果。

[两个隔离的 Zotero 10.0.8 配置已实测元数据审阅成果](https://github.com/zhongyangchuwu/Zotero-Neo/issues/292#issuecomment-6980314052)：通过 Zotero Storage 同步 JSON 和展示笔记，断网时下载失败，恢复联网后可按需下载并读取同一修订；两端离线保存的分支也都保留。这项证据不覆盖人工解析修正、AI 问答成果、配额或权限失败，也不证明移动端或网页会原生渲染 Neo JSON。

## 现有 harness 的互通路径与验证缺口

现有 zotero-mcp 的 `get_item_children` 可发现父文献附件；本地模式下 `get_attachment_path` 可返回附件路径，harness 需有权访问同一文件系统并读取已下载的 JSON。生成经校验的新修订后，现有 `attach_file` 可将本地普通文件导入父文献；Neo 中载入后仍须审阅和明确采纳。不要用 PDF 全文工具冒充通用 JSON 读取器，也不要把附件当作可执行队列。

这些是工具接口和预期路径，不是当前环境端到端通过的保证：仍需实际验证路径可达、文件未下载、导入后发现、重复运行及 Neo 审阅。远端 harness 不一定能访问本地路径；权限由现有 Zotero 和 harness 决定，Neo 的审阅流程不能阻止其他有写权限的客户端直接修改条目。无需修改现有 zotero-mcp 或其配置，也不在 Neo 内嵌 Agent。

本机协议链路已在隔离 Zotero 10.0.8 中验证：读取真实保存的 JSON，使用公开校验器检查外部测试修订，再通过原生附件入口导入；重开审阅后可发现该修订，预览不写字段，明确只选择 `volume` 后才更新并保存回执，未选 DOI／citekey 和人工编辑笔记保持不变。此处使用的是原生附件导入，不是既有 MCP 的端到端验收；打包 XPI 重载后也能恢复这些修订。

当前挂载的 zotero-mcp 仅使用 **Web API 模式**，未连接隔离测试文库；`get_attachment_path` 需要本地模式。本机原生导入和 Zotero 文件同步均不能代替 MCP 工具往返。[#291](https://github.com/zhongyangchuwu/Zotero-Neo/issues/291) 单独跟踪真实读取和导入验收。
