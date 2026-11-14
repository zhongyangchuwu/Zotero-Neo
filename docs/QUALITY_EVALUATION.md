# 核对 PDF 解析质量

本页面向维护者，说明如何复现固定 PDF 的局部质量核验。普通阅读与局部纠错见[选择指南](SELECTION_GUIDE.md#修正图表关联与正文归属)。这些工具不调用 AI 问答，也不自动上传 PDF 到解析服务。

## 区分三种结果

- **处理完成**：适配器返回了可校验的数据。分别保留 `completed`、`failed`、`unsupported` 和 `not-performed`；网络失败、来源不匹配和未授权服务不能从分母中消失。
- **选定核验点通过**：解析结果匹配来源标注中的原文、图表、书目或引文。只报告通过数与实际核验数，不称为全文准确率或召回率。未提供对应数据的能力单独记为未测。
- **实际任务成功**：在 Zotero 中完成定位、复制或保存，并核对结果与原文。通过 `taskOutcomes` 独立记录；静态匹配、缓存命中和接口返回都不能自动产生任务 PASS。

对象核验使用提供的图表组或明确的 provider 成员关系，不由评测器重新猜测题注归属。带来源标注框的对象还要求主体框 IoU ≥ 0.5；没有框的核验点只说明可定位，不能证明题注关联正确。重复候选不能让多个相同核验点重复得分，同一区域内不同的文字片段可以分别核验。

## 固定语料与标注边界

`evidence/document-quality/corpus-a.json` 和 `corpus-b.json` 共包含 24 篇固定 arXiv v1 英文论文、97 个选定核验点：36 个文字、25 个对象、24 个书目和 12 个正文引文。覆盖单／双栏、密集图表、机器学习、文档理解、OCR 和机器人论文。

每份清单记录下载 URL、文件 SHA-256、许可证、物理页序号和标注来源。当前标注均为 `agent-source-verified`：代理对照原始 PDF 核验，**不是人工金标准**。含 OCR 主题的论文不等于扫描 PDF 测试集；当前结果不覆盖中文、扫描页、全文阅读顺序或全文漏检。仅 OmniDocBench 的两个表体提供近似来源框，不能据此推广到整个语料。

新增核验点时先查看原始 PDF，不得把待测解析器的输出当作标注来源。`pageIndex` 从零开始；对象框使用未旋转 PDF 用户坐标 `[left, bottom, right, top]`，排除题注。保留完整来源说明及人工复核状态，不能为了匹配某个解析器而缩短或改写原文。

## 准备并捕获原生结果

需要仓库开发依赖、网络访问公开 PDF，以及一个数据目录也已隔离的 Zotero 开发配置。先按[本地 GUI 迭代](DEVELOPMENT.md#本地-zotero-gui-迭代)配置 RDP。捕获命令会导入每个 PDF，并逐篇打开、关闭 Reader；不要指向个人文库。

```bash
npm run quality:prepare -- \
  --corpus evidence/document-quality/corpus-a.json \
  --corpus evidence/document-quality/corpus-b.json \
  --directory /tmp/neo-quality-pdfs \
  --output /tmp/neo-quality-downloads.json --download yes

npm run quality:capture -- \
  --corpus evidence/document-quality/corpus-a.json \
  --corpus evidence/document-quality/corpus-b.json \
  --directory /tmp/neo-quality-pdfs \
  --profile /tmp/zotero-neo-dev/profile --port 6100 \
  --output /tmp/neo-quality-observations.json
```

Windows Zotero 从 WSL 捕获时，PDF 目录必须位于 `/mnt/<drive>/...`，`--profile` 传该 Zotero 实际使用的 Windows 配置路径。运行前会比对 PDF 字节哈希和 RDP 宿主配置路径；不匹配即拒绝导入。已有捕获输出不会覆盖，请为每轮选择新路径。

`quality:prepare` 仅在显式 `--download yes` 后下载，并逐份核验字节；已有错误文件不当作有效缓存。`quality:capture` 默认打包当前工作树的原生适配器，可用 `--source-root` 指定另一份源码。输出记录源码 HEAD、工作树身份、实际辅助 bundle 哈希、宿主和模型修订；存在未提交修改时，HEAD 本身不等于所执行的源码。

原生捕获分别调用 SDT 与 Reader 引文适配器。`cold` 是新导入附件的第一次显式提取，`warm` 是同一附件的第二次提取；计时不含附件导入与 Reader 初始化。它仍可能受宿主缓存、模型初始化和系统负载影响，不是模型纯计算时间。该命令不会执行 MinerU 或 OXR，会明确写入未执行记录；云端需要另行授权上传并提供真实观测，不能用原生结果代替。

## 生成报告

```bash
npm run quality:evaluate -- \
  --corpus evidence/document-quality/corpus-a.json \
  --corpus evidence/document-quality/corpus-b.json \
  --observations /tmp/neo-quality-observations.json \
  --output /tmp/neo-quality-report.json \
  --markdown /tmp/neo-quality-report.md
```

评测器检查标注、观测身份和数据形状，但不重新读取 PDF；字节来源由捕获／准备步骤保证。输出保留逐核验点结果、未测原因、后端与冷／暖／缓存分组，空分组不表示执行成功。冷暖重复测量不是两份独立质量样本，不应合并后扩大样本数。

要记录真实阅读任务，在对应观测的 `taskOutcomes` 中按 `checkId` 提供 `status` 与 `detail`，说明实际操作、结果与证据位置。状态为 `passed`、`failed`、`unsupported` 或 `not-performed`。没有实际操作时保持未执行。

捕获文件包含整篇提取文字，仅保留于测试环境；仓库只提交来源清单和评分报告，不提交 PDF 或完整提取正文。报告中的少量原文用于核验，不改变原 PDF 的发行许可。

## 已测原生基线

基线源码为 `61bcbdf415c1785fe925cd4d78024fdc2c0c4af1`，宿主 Windows Zotero 10.0.8，使用独立配置。实际捕获辅助 bundle SHA-256 为 `231a7870c04f8aa5077a14a033751c47fa59d950de3e7c4d213448a58ba8e373`。逐项结果保存在 [`native-baseline.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/native-baseline.json)。

| 原生能力 | 冷启动处理完成 | 选定核验点通过 |
| --- | --- | --- |
| SDT 文字 | 24/24 | 33/36 |
| SDT 对象定位 | 同一批 SDT 观测 | 21/25 |
| Reader 书目 | 24/24 | 15/24 |
| Reader 引文关联 | 同一批 Reader 观测 | 3/12 |

暖运行的质量结果与冷运行相同。96 次原生观测均完成，48 次云端观测未执行；后者不能记为成功或并入原生准确率。所有基线观测都没有实际任务记录，因此基线端到端任务成功率**未测**。

| 能力／模式 | 次数 | 最小耗时（ms） | 中位耗时（ms） | 最大耗时（ms） |
| --- | --- | --- | --- | --- |
| SDT 冷 | 24 | 678 | 1192 | 3963 |
| SDT 暖 | 24 | 23 | 46 | 131 |
| Reader 书目／引文冷 | 24 | 4568 | 7734.5 | 43024 |
| Reader 书目／引文暖 | 24 | 2894 | 5521.5 | 27103 |

这些数字不含人工核对成本。Reader 暖提取仍可能耗时数十秒，本轮不声称已优化该成本。人工核对耗时与操作数未测；软件驱动界面的操作时间不能冒充人工耗时。云端首次提交与本地缓存读取的对比见下节。

失败点包括三处文字、四处对象、九处书目及九处引文关联。原生书目输出可能漏条目，或把编号任务／示例材料当成参考文献；例如 OpenVLA 与 OmniDocBench 的输出未命中选定书目。界面中的“已识别编号列表，完整性未核验”仅描述结构，不保证书目完整或内容正确。旧基线的 `bibliographyCoverage: complete` 是原适配器元数据，不能视为质量结论。

OmniDocBench 两个带标注框的表体没有匹配对象，IoU 保留为未测并记录 `no-matched-object`，不填零或据此计算平均值。其余无框对象的定位通过也不证明图注关联正确。局部纠错只改变精确来源上的用户指定归属，不把上述基线失败改写成算法改进。

## 已授权 MinerU 云端与缓存对比

用户另外授权上传这 24 篇固定公开 PDF。Windows Zotero 10.0.8 的独立配置中，OmniDocBench 先通过实际对照界面上传，其余 23 篇通过生产 `DocumentPreparationQueue` 首次提交；批量准备复用已经完成的 OmniDocBench，不再次付费上传。随后逐篇读取本地缓存，没有重传、OXR 或 AI 问答请求。

本轮使用官方 v4 API、`model_version: vlm`、英文、表格和公式识别。服务未返回具体模型修订，不能声称版本完全锁定。生产辅助 bundle SHA-256 为 `5335ad672ffdc05305916e8cfe367d5816f75d012248e7dcf5cad8d083072971`，来源为上述基线提交上的任务工作树，而非未修改的基线。完整配置、PDF 身份和逐项结果保存在 [`mineru-authorized.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/mineru-authorized.json)。

| MinerU 能力 | 首次提交处理完成 | 选定核验点通过 |
| --- | --- | --- |
| 文字 | 24/24 | 34/36 |
| 对象定位／已标框主体匹配 | 同一批观测 | 23/25 |

24 次缓存观测均完成，质量结果与首次提交一致，不作为第二份独立样本。当前观测未提供结构化书目和引文数据，对应核验点保持未测；没有实际任务记录，不能从处理完成或静态匹配推算任务成功率。

| 模式 | 次数 | 最小耗时（ms） | 中位耗时（ms） | 最大耗时（ms） |
| --- | --- | --- | --- | --- |
| 首次云端提交 | 24 | 24121 | 65010 | 152670 |
| 本地缓存读取 | 24 | 255 | 831 | 3103 |

首次提交耗时包含上传、远端排队、处理和下载，无法证明服务端没有内部缓存；本地读取包含准备、精确来源校验及缓存 I/O。二者都不是模型纯计算时间，也不能与不含 Reader 初始化的原生提取耗时直接等同。

失败文字位于 OpenVLA 和 Pix2Struct 的选定原文。两个已标框对象都在 OmniDocBench：Table 2 的题注关联到了 Table 3 的主体，Table 3 的题注关联到了 Table 4 的主体；两处主体 IoU 均为 0，不因题注可定位而记为通过。其余 23 个对象没有来源框，定位通过不证明主体关联正确。缓存保留了这些错误，不能代替原文核对；后续局部纠错须另行记录，不回写这份基线成绩。

## 局部纠错与实际任务

基线完成后，只对 OmniDocBench 第 6 页的两个错误表组保存局部题注关联。独立记录见 [`local-correction-uat.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/local-correction-uat.json)，包含实际安装的 XPI 身份、成员框、缓存哈希和操作结果，不回写基线成绩。

| 核验点 | 原始主体 IoU | 纠错后主体 IoU | 已执行任务 |
| --- | --- | --- | --- |
| Table 2 | 0 | 0.9899 | 查看正确表体与题注，实际定位到第 6 页对应成员框 |
| Table 3 | 0 | 0.9852 | 图表预览与摘录 PNG 一致；实际保存并打开笔记，核对嵌入图片、题注和来源链接 |

这些框仍是代理对照原 PDF 得到的近似标注，不是人工金标准。两项任务通过只说明该论文的两个选定对象，不代表 24 篇 PDF 的端到端成功率，也不是解析模型准确率提高。

另在实际界面把 Table 3 的主体保存为正文：正文过滤开启时，原本整个可见区显示 `No visible text`；修正后 Flash 可以选择原生文字 `0.044`。随后恢复原始归属，并显式重建因正文变更而移除的冲突题注关联。两处题注修正已通过完整重启 Zotero、重开 Reader 的复用检查；原始 MinerU 与 SDT 缓存哈希未改变。

失效检查包括两层：界面已准备的 Table 2 摘录在切换为 OXR 后不能新建笔记；在实际 Zotero 中读取既存侧车时，改变内存里的 PDF 指纹、解析文字、区域几何、页面旋转或模型修订，均不再接纳旧修正。仅改变耗时仍接纳两个修正。后者是实际存储边界的身份检查，**不是替换真实 PDF 文件的 GUI 实验**；没有调用 OXR、付费重解析或 AI 问答。

本轮软件驱动的“保存为正文并回读有效来源”为 669 ms。该时间包括保存和来源回读，不含人类阅读、核对、决策或选择候选的时间；人工核对成本仍未测，不能与云端／缓存耗时相减后声称节省了人工时间。
