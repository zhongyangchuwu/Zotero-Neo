# 核对 PDF 解析质量

维护者可用固定 PDF 复现局部质量核验，并分别记录解析结果与实际阅读任务。工具在隔离配置中读取数据；云端上传另需授权。普通阅读与局部纠错见[选择指南](SELECTION_GUIDE.md#修正图表关联与正文归属)。

## 区分三种结果

- 处理完成：适配器返回了可校验的数据。`completed`、`failed`、`unsupported` 和 `not-performed` 分别统计，网络失败、来源变化和授权状态都保留在记录中。
- 选定核验点通过：结果匹配来源标注中的原文、图表、书目或引文，报告列出通过数和实际核验数。缺少对应数据的能力标为未测；全文准确率和召回率需要完整标注另行评估。
- 实际任务成功：在 Zotero 中完成定位、复制或保存，再核对原文。`taskOutcomes` 按已执行操作记录 PASS，静态匹配和缓存命中各自记录。

对象评分采用待测解析器提供的图表组或明确成员关系。主体框要求 IoU ≥ 0.5；提供 `captionRect` 时，题注框也须达到 IoU ≥ 0.5，题注文字可保留上游的部分转录。旧核验点沿用原文匹配，其结果说明可定位，关联正确性需结合主体框核对。相同候选按唯一资源分配，避免重复得分。

## 固定语料与标注边界

`evidence/document-quality/corpus-a.json` 和 `corpus-b.json` 共包含 24 篇固定 arXiv v1 英文论文、97 个选定核验点：36 个文字、25 个对象、24 个书目和 12 个正文引文。覆盖单／双栏、密集图表、机器学习、文档理解、OCR 和机器人论文。

A/B 清单记录下载 URL、SHA-256、许可证、物理页序号和标注来源。标注类型为 `agent-source-verified`，表示代理对照原始 PDF 核验；人工金标准复审需单独完成。当前范围是数字版英文论文，中文、扫描页、全文阅读顺序和全文漏检保留为未测。OCR 主题是论文题材，扫描页识别需使用相应样例。A/B 中 OmniDocBench 的两个表体有近似来源框，几何结论限于这两项。

新增核验点时，以原始 PDF 或独立发布的标注为来源，保留原文、来源说明和人工复核状态。`pageIndex` 从零开始，主体框使用未旋转 PDF 用户坐标 `[left, bottom, right, top]`，题注框单独记录。标注内容在评测前固定，解析器输出只作为待测结果。

### 公开图表标注扩展

`corpus-c.json` 采用 [PDFFigures2 Conference150 v2 的公开标注](https://github.com/allenai/pdffigures2/blob/3d7ad46753d4a315cccd1c2bcab398380e88c534/evaluation/datasets/conference/annotations.json)，包含 10 篇 ICML 论文、20 个选定页面、47 组对象（30 图、17 表）。每项都有独立主体框和题注框。上游标注者圈选区域后按页面前景裁切；本仓库完成坐标转换和来源核对，本次额外人工金标准复审保持未测。

所选页面的全部已发布标注均纳入，论文、年份和页面按版式需要挑选。C 的 47 项用于局部回归与规则校准；本轮另审阅 C/D/E 所选页的额外候选，全文精确率、召回率和其他页面保持未测。

`corpus-d.json` 另收录 12 篇 ICML／NeurIPS 论文、22 个选定页面和 30 组对象（20 图、10 表），与 C 的 PDF 字节身份不重叠。D 的页面与标注在代次 2 首次预测前固定，同样纳入所选页面的全部已发布标注。其独立首测结果继续保留；本次代次 3 已使用 D 修正规则，因此 D 转为回归与校准集。

`corpus-e.json` 是本次另留的独立验证集：12 篇论文、23 页、31 组对象（24 图、7 表），PDF 身份与 C/D 均不重叠。选择时分别按年份和数字后缀排序，取前六篇未使用且符合条件的 ICML／NeurIPS 论文，纳入各篇前两个有标注页面的全部对象。清单在预测前固定，最终代码冻结后才提取 E 的来源几何并运行新旧版本，所有失败均保留，之后未按 E 调参。这是确定性非随机切片，不代表全部论文。

PDF 下载自原会议站，并固定本次实际字节哈希。上游提供的身份信息是题注与页面几何，本次据此核对文档；历史 PDF 字节哈希缺失。C 与 D 的大多数标注从 72 dpi 左上原点转换到未旋转 PDF 用户坐标；D 中 `d-icml10_1` 的标注为 100 dpi，先缩放至 PDF 点。E 还包含 A4 页面和分数 DPI，按各页 CropBox 与标注 DPI 转换。主体和题注保持分开。版本、许可、选择规则和其他数据集取舍见 [`figure-datasets.json`](../evidence/document-quality/figure-datasets.json)。仓库保存来源清单和评分，PDF 与完整正文留在测试环境；论文版权按各自声明处理。


## 准备并捕获原生结果

准备仓库开发依赖、公开 PDF 网络访问和一个文库／数据目录均已隔离的 Zotero 配置，再按[本地 GUI 迭代](DEVELOPMENT.md#本地-zotero-gui-迭代)配置 RDP。捕获命令会导入 PDF，并逐篇打开、关闭 Reader，因此请使用专门的测试文库。

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

从 WSL 连接 Windows Zotero 时，将 PDF 放在 `/mnt/<drive>/...`，`--profile` 填写该 Zotero 实际使用的 Windows 配置路径。导入前会核对 PDF 哈希和宿主配置路径，匹配后才继续。每轮选择新的输出路径，已有捕获文件会保留。

`quality:prepare` 在传入 `--download yes` 后下载并逐份校验字节，只复用校验有效的文件。`quality:capture` 默认打包当前工作树的原生适配器，也可用 `--source-root` 指定源码。执行身份由源码 HEAD、工作树状态、辅助 bundle 哈希、宿主和模型修订共同记录；有未提交修改时，以工作树与实际 bundle 为准。

原生捕获分别调用 SDT 和 Reader 引文适配器。`cold` 是新附件的首次显式提取，`warm` 是同一附件的第二次提取；计时范围是提取流程，附件导入与 Reader 初始化另计。宿主缓存、模型初始化和系统负载都可能影响结果。此命令将 MinerU／OXR 记录为未执行，授权后的云端观测另行提供。

### 捕获本地无模型结果

`--backend local` 调用生产本地规则，每篇新附件提取一次 PDF 原有文字和绘图几何，计算全部在本机完成。评估范围是本地布局，书目、引文和 OCR 保留为未测。省略参数时使用 `native` 流程，报告按后端分别统计。

```bash
npm run quality:prepare -- \
  --corpus evidence/document-quality/corpus-c.json \
  --directory /tmp/neo-local-pdfs \
  --output /tmp/neo-local-downloads.json --download yes

npm run quality:capture -- --backend local \
  --corpus evidence/document-quality/corpus-c.json \
  --directory /tmp/neo-local-pdfs \
  --profile /tmp/zotero-neo-dev/profile --port 6100 \
  --output /tmp/neo-local-observations.json
```

评分使用同一份 `corpus-c.json` 和对应观测。主体缺失时记录 `no-matched-object`，IoU 保持未测，该项仍计入 47 个核验点；通过要求题注和主体同时匹配。

复现本次独立验证时，将本节准备、捕获命令的 `--corpus` 改为 `evidence/document-quality/corpus-e.json`，并使用新的输出名。评分也传入同一份 E 清单；C、D 则分别保留为回归观测与报告。


## 生成报告

```bash
npm run quality:evaluate -- \
  --corpus evidence/document-quality/corpus-a.json \
  --corpus evidence/document-quality/corpus-b.json \
  --observations /tmp/neo-quality-observations.json \
  --output /tmp/neo-quality-report.json \
  --markdown /tmp/neo-quality-report.md
```

准备和捕获步骤负责 PDF 字节身份，评测器负责校验标注、观测身份与数据形状。报告保留逐项结果、未测原因和后端／冷／暖／缓存分组。空分组显示执行状态；同一附件的冷暖观测用于复用对照，独立质量样本仍按文档计数。

真实阅读任务按 `checkId` 写入对应观测的 `taskOutcomes`，使用 `status` 和 `detail` 记录操作、结果与证据位置。状态为 `passed`、`failed`、`unsupported` 或 `not-performed`；尚未执行的任务使用最后一项。

完整捕获文字保留在测试环境，仓库提交来源清单和评分报告。报告只引用核验所需的少量原文，论文的发行许可继续适用。

## 已测本地规则

当前本地规则使用适配器代次 3，C/D 用于回归与校准，E 用于实现冻结后的独立验证。通过要求主体和题注 IoU 均 ≥ 0.5。逐项报告分别为 [C](../evidence/document-quality/local-rules-v3-calibration.json)、[D](../evidence/document-quality/local-rules-v3-regression.json) 和 [E](../evidence/document-quality/local-rules-v3-validation.json)；E 的旧版对照见 [`local-rules-v2-holdout-e.json`](../evidence/document-quality/local-rules-v2-holdout-e.json)。

| 语料 | 完成提取的文档 | 代次 2 配对通过 | 代次 3 配对通过 | 代次 3 主体可计算 IoU | 代次 3 主体未关联 |
| --- | --- | --- | --- | --- | --- |
| C：回归与校准 | 10/10 | 42/47 | 47/47 | 47/47 | 0/47 |
| D：回归与校准 | 12/12 | 17/30 | 26/30 | 27/30 | 3/30 |
| E：独立验证 | 12/12 | 19/31 | 25/31 | 25/31 | 6/31 |

所有旧配对通过项均保留。三项原本已失败的主体改为未关联：`d-icml10_6` Figure 1 原 IoU 0.2260、`e-nips09_5` Figure 2 原 IoU 0.4838、`e-nips09_6` Table 1 原 IoU 0。这不表示每项几何都没有退化；逐项增减、冻结身份与原生几何来源见 [`local-rules-v3-comparison.json`](../evidence/document-quality/local-rules-v3-comparison.json)。

本次先用重复的原生单元格位置识别表体，再合并正文，补足少线／无框表；图形分组保留小字号标签和换行子图说明，同时用题注、正文及相邻对象阻隔限制扩张。PDF 绘图解码按实际路径、Form 和 Group 裁剪范围约束绘制区域。裁剪使用保守轴对齐包围框，不是任意路径的逐像素掩膜。

D 仍有三项主体未关联：`d-icml10_6` Figure 1／3 和 `d-nips09_1` Figure 3；`d-icml10_6` Table 1 的主体 IoU 仍为 0.2933。E 的六项未关联分别是 `e-icml11_3` Figure 1／2／3、`e-nips09_5` Figure 2、`e-nips09_6` Table 1 和 `e-nips09_7` Figure 1。算法图、密集数学表和复合线图仍需对照原页，缺失主体的 IoU 保持未测。

额外候选审阅覆盖 34 篇文档的 65 个选定页，共 113 个图表候选，其中 99 个有主体、14 个仅有题注。对照原页确认五个额外题注均未绑定主体：四个是正文引用，一个是 `e-icml11_3` 原生提取中在原页不可见的 Figure 1 文字，原因未确定。该文真正的 Figure 3 题注框 IoU 为 0.3505，属于题注范围偏大，不把它另算成误报。相对于所选页的已发布标注，未发现额外主体候选；这不等于全文零误报或完整召回率。

宿主为 Windows Zotero 10.0.8／PDF.js 5.7.0，源码是基于 `da0875ec5ffdbfc4098b7335593b42a404f50065` 的任务工作树，最终辅助 bundle SHA-256 为 `67f179955165d38b36f8e42d158fb9a00c4d4948db1def270a63776ca7036d60`。旧版和候选分别保留相同 PDF 字节上的版本化原生几何；C/D 复用解码器未变化的捕获，E 在最终冻结后重新提取。评分调用生产分组函数，`durationMs` 只计分组重放，不含 PDF 提取、Reader 初始化或人类核对。108 个静态核验点的实际任务仍各自标为未执行。

另在专用 Zotero 配置中核验了少线表的浏览／原文跳转、对象摘录保存／打开／重复复用，以及含子图说明的复合图预览与定位。真实旧代次 2 缓存保持原样：普通浏览跳过旧槽且不保存新缓存；显式本地解析写入代次 3，重开后复用。截图、完整 PNG、嵌图与缓存哈希见 [`local-rules-v3-uat.json`](../evidence/document-quality/local-rules-v3-uat.json)。表格本地解析时 SDT 读取计数为 0；整轮宿主交互另拦截了一次 `SDT.getReader` 和两次 `SDT.getPack`，未发生远端 HTTP，调用栈未记录。物理键盘与输入法保持未测。

### 代次 2 历史记录

代次 2 的 C 校准结果为 42/47，D 独立首测为 17/30，分别保存在 [`local-rules-v2-calibration.json`](../evidence/document-quality/local-rules-v2-calibration.json) 和 [`local-rules-v2-validation.json`](../evidence/document-quality/local-rules-v2-validation.json)。当轮修正狭长层级连接干、英文段首图表引用与题注字号边界，未按 D 的首测结果继续调参。

当轮宿主同为 Windows Zotero 10.0.8／PDF.js 5.7.0，源码基于 `834e40ce5f2ee2574020dd355b9d54115c5fb77b`，辅助 bundle SHA-256 为 `8c92430d1b87c443ca9062492c398dd2c4328b75e06275f798ed35e386c5c421`。代次 1 → 2 的缓存升级、预览与定位记录继续保留在 [`local-rules-v2-uat.json`](../evidence/document-quality/local-rules-v2-uat.json)，与本次代次 2 → 3 核验分开。

### 首轮历史记录

首轮 C 基线保留在 [`local-rules-baseline.json`](../evidence/document-quality/local-rules-baseline.json)：配对通过 39/47，40 项主体可计算 IoU，7 项主体未关联。同篇 `c-icml14_9` Figure 3 的题注 IoU 为 0.9720、主体 IoU 为 0.3723；其余七项保留已识别题注，主体待关联。正文引用也曾被误列为题注，额外误报需单独审阅。

该轮宿主同为 Windows Zotero 10.0.8／PDF.js 5.7.0，源码是基于 `d4129d4dd038232b32b728a52b55fe191813a34a` 的任务工作树，实际辅助 bundle SHA-256 为 `a13be636ef4d2d92c96dd119750ff86cc702a1d498db11a656dacc0cb72f024f`。47 项静态评分与界面流程分别记录。

首轮专用配置已走通图表列表、预览、原文跳转、解析缓存保存／复用及图文笔记保存／打开，记录见 [`local-rules-uat.json`](../evidence/document-quality/local-rules-uat.json)。这些操作通过 Firefox RDP 驱动真实界面，并逐张检查截图；物理键盘与输入法的手动验收按[验收指南](ACCEPTANCE.md)另行执行。

## DeepSeek OCR API 小样本对照

本轮按用户授权，使用环境变量 `DEEPSEEK_API_KEY` 调用[官方 OCR 接口](https://api-docs.deepseek.com/zh-cn/guides/ocr)。Attention、ResNet 和 OmniDocBench 的原始 PDF 字节与先前实验相同，六个核验对象位于三个选定页；另用 Attention 第 4 页的复合图作独立诊断。四页分别调用 `rich_layout_recognition` 与 `text_recognition`，共 8 次成功请求，未重试。请求身份、来源哈希、配对规则和逐项结果见 [`deepseek-ocr-api-comparison.json`](../evidence/document-quality/deepseek-ocr-api-comparison.json)。

本节保留当轮 API 与代次 2 本地规则的对照；本次代次 3 改进未重新调用该接口。

| 方法 | 六对象主体与题注配对 | 结果来源 |
| --- | --- | --- |
| Neo 当轮本地规则（代次 2） | 2/6 | 当轮生产路径，读取相同三份完整 PDF |
| DeepSeek rich-layout 加固定几何关联 | 3/6 | 本轮单页 API 响应 |
| figure-extractor 0.4.0 | 6/6 | 保留的历史实测，未重跑 |
| PDFFigures2，提交 `3d7ad467…` | 6/6 | 保留的历史实测，未重跑 |
| Docling 2.150.1 | 6/6 | 保留的历史实测，未重跑 |

rich-layout 独立匹配到 5/6 主体与 4/6 题注，原始响应未提供主体与题注关系。表中的 API 配对结果使用预先固定的同类、水平重叠和最近垂直距离规则。OmniDocBench Table 2／3 的题注坐标偏移，Table 4 的主体框跨过相邻表格，最佳主体 IoU 为 0.3114。ResNet 主体通过阈值，左侧公式仍有裁切；该轮 Neo 在同一对象的主体 IoU 为 0.5050，也处于阈值边缘。复合图诊断中，API 框包含左右两组图，底部 V/K/Q 仍被裁切。

`text_recognition` 返回文字、公式和表格转写，本次四页均未提供定位框。逐字符、公式与表格单元格准确率保持未测。六个对象沿用代理对照原页得到的近似框，人工金标准复审尚未完成；这些结果与 C/D 公开标注评分分别报告。

8 个成功响应均为 `finish_reason: stop`，单次请求耗时 2.58 至 8.60 秒。按[公布价格](https://api-docs.deepseek.com/zh-cn/guides/ocr#计费)每千成功页 1.5 元估算，本轮为 0.012 元，实际账单未核对。API 单页时间与旧工具全篇处理时间范围不同，未做速度排名。服务未提供可锁定的模型版本；这轮测试保留本地默认路线，运行时服务选择保持现状。


## 已测原生基线

基线源码为 `61bcbdf415c1785fe925cd4d78024fdc2c0c4af1`，宿主 Windows Zotero 10.0.8，使用独立配置。实际捕获辅助 bundle SHA-256 为 `231a7870c04f8aa5077a14a033751c47fa59d950de3e7c4d213448a58ba8e373`。逐项结果保存在 [`native-baseline.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/native-baseline.json)。

| 原生能力 | 冷启动处理完成 | 选定核验点通过 |
| --- | --- | --- |
| SDT 文字 | 24/24 | 33/36 |
| SDT 对象定位 | 同一批 SDT 观测 | 21/25 |
| Reader 书目 | 24/24 | 15/24 |
| Reader 引文关联 | 同一批 Reader 观测 | 3/12 |

冷暖运行的质量结果相同。96 次原生观测均完成，48 次云端观测记为未执行，质量统计按各自状态分列。所有基线实际任务均为未执行，端到端任务成功率保持未测。

| 能力／模式 | 次数 | 最小耗时（ms） | 中位耗时（ms） | 最大耗时（ms） |
| --- | --- | --- | --- | --- |
| SDT 冷 | 24 | 678 | 1192 | 3963 |
| SDT 暖 | 24 | 23 | 46 | 131 |
| Reader 书目／引文冷 | 24 | 4568 | 7734.5 | 43024 |
| Reader 书目／引文暖 | 24 | 2894 | 5521.5 | 27103 |

表中记录程序处理时间，Reader 暖提取仍可能耗时数十秒。本轮描述现有成本，人工核对时间和操作数另行测量。软件驱动界面的耗时按自动化操作记录，云端首次提交与缓存读取的流程对照见下节。

失败点包括三处文字、四处对象、九处书目和九处引文关联。书目输出需逐条核对，可能存在漏项或将编号任务／示例当成参考文献；OpenVLA 与 OmniDocBench 的输出均有选定书目缺失。界面中的“已识别编号列表，完整性未核验”说明已得到列表结构。旧 `bibliographyCoverage: complete` 保留适配器当时的元数据，书目完整性以逐条核验为准。

OmniDocBench 两个标框表体均记录 `no-matched-object`，IoU 保持未测，均值只统计实际匹配项。其余对象的通过结果说明可定位，题注关联质量需要主体框核验。局部纠错按精确来源调整用户指定归属，效果在独立任务记录中展示，原始基线保留。

## 已授权 MinerU 云端与缓存对比

这轮授权覆盖 24 篇固定公开 PDF，使用 Windows Zotero 10.0.8 的独立配置。OmniDocBench 先经实际对照界面上传，其余 23 篇由生产 `DocumentPreparationQueue` 首次提交；批量准备复用已有 OmniDocBench 结果。后续观测均读取本机缓存，涉及的服务限于本轮已授权的 MinerU。

请求使用官方 v4 API、`model_version: vlm`、英文及表格／公式识别设置，服务响应中的具体模型修订缺失。生产辅助 bundle SHA-256 为 `5335ad672ffdc05305916e8cfe367d5816f75d012248e7dcf5cad8d083072971`，来源是上述基线提交上的任务工作树。完整配置、PDF 身份和逐项结果见 [`mineru-authorized.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/mineru-authorized.json)。

| MinerU 能力 | 首次提交处理完成 | 选定核验点通过 |
| --- | --- | --- |
| 文字 | 24/24 | 34/36 |
| 对象定位／已标框主体匹配 | 同一批观测 | 23/25 |

24 次缓存观测均完成，质量与首次提交一致，用于验证复用行为，独立样本仍是这 24 篇 PDF。结构化书目、引文和实际任务在本轮观测中保持未测。

| 模式 | 次数 | 最小耗时（ms） | 中位耗时（ms） | 最大耗时（ms） |
| --- | --- | --- | --- | --- |
| 首次云端提交 | 24 | 24121 | 65010 | 152670 |
| 本地缓存读取 | 24 | 255 | 831 | 3103 |

首次提交记录上传、远端排队、处理和下载，本地读取记录准备、来源校验与缓存 I/O。服务端内部缓存状态未测。这些是各自流程的耗时，原生提取表的计时范围还省略了 Reader 初始化，比较时需保留这一区别。

文字失败点位于 OpenVLA 和 Pix2Struct。OmniDocBench 的 Table 2 题注关联到 Table 3 主体，Table 3 题注关联到 Table 4 主体，两处主体 IoU 均为 0，按关联失败计分。其余 23 个无框对象通过定位核验，主体关联仍需原文确认。缓存保留服务当时的输出，后续纠错效果独立记录，基线继续保留。

## 局部纠错与实际任务

基线完成后，对 OmniDocBench 第 6 页的两个错误表组保存了局部题注关联。实际安装 XPI、成员框、缓存哈希和操作结果见 [`local-correction-uat.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/evidence/document-quality/local-correction-uat.json)，与原始基线分别保存。

| 核验点 | 原始主体 IoU | 纠错后主体 IoU | 已执行任务 |
| --- | --- | --- | --- |
| Table 2 | 0 | 0.9899 | 查看正确表体与题注，实际定位到第 6 页对应成员框 |
| Table 3 | 0 | 0.9852 | 图表预览与摘录 PNG 一致；实际保存并打开笔记，核对嵌入图片、题注和来源链接 |

这些是代理对照 PDF 得到的近似框，人工金标准复审另行完成。两项任务验证了该论文两个对象的纠错和操作结果，结论范围限定于这两个对象。

另在实际界面把 Table 3 的主体保存为正文：正文过滤开启时，原本整个可见区显示 `No visible text`；修正后 Flash 可以选择原生文字 `0.044`。随后恢复原始归属，并显式重建因正文变更而移除的冲突题注关联。两处题注修正已通过完整重启 Zotero、重开 Reader 的复用检查；原始 MinerU 与 SDT 缓存哈希未改变。

来源失效验证包括两种情形：Table 2 摘录在切换为 OXR 后退休，保存入口随之关闭；读取已有侧车时，分别改变内存中的 PDF 指纹、解析文字、区域几何、页面旋转或模型修订，旧修正均失效。仅改变耗时仍接纳两个修正。后者检查的是实际存储边界与内存输入身份，真实文件替换需另做 GUI 核验；本次使用已有结果完成检查。

软件驱动的“保存为正文并回读有效来源”耗时 669 ms，计时覆盖保存和来源回读。人类阅读、核对、决策及选择候选的时间需单独测量，人工核对成本保持未测。
