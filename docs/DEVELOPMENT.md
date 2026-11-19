# 开发指南

## 兼容范围与验证

当前 `manifest.json` 支持 Zotero `10.0.*`（`strict_min_version: 10.0`、`strict_max_version: 10.0.*`）。修改宿主接缝时，既要运行仓库验证，也要在 Zotero 中操作受影响的工作流。

需要 Node.js 24 和 npm。插件与 VitePress 文档站使用同一个仓库根目录，命令统一定义在根 `package.json`。先在该目录安装锁定依赖，再运行任一构建：

```bash
npm ci
```

如果 npm 12 以 `EALLOWGIT` 拒绝锁定的 Git 依赖，在同一根目录改用 `npm ci --allow-git=all --ignore-scripts`。这只影响本次共享依赖安装，不修改全局 npm 策略。

两种 XPI 构建入口都会调用 `npm run verify`，依次检查 Prettier、严格 TypeScript、Vitest、包构建与 XPI 成员。

固定 PDF 的来源清单、原生捕获命令、逐核验点评分和冷／暖耗时见[解析质量评测](QUALITY_EVALUATION.md)。评测分别记录解析正确率和实际任务成功率；契约测试、缓存命中与处理完成不能代替这两项结果。

## 构建

在仓库根目录运行：

```bash
./tools/build.sh
```

Windows 可使用：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

构建同时产出 `zotero-neo.xpi` 和独立的 `build/zotero-neo-translate.xpi`。CI 分别上传两个构建产物；适配器不进入 Neo 主包，使用独立扩展 ID 和更新清单。目前该清单不发布自动更新，适配器从文件安装和更新。

### 发布小版本

稳定版按完整、可验收的用户改进发布；修复用补丁版本，新增能力或改变交互契约时提升次版本。每周保留一个发布窗口，有已验收内容才发布；严重回归及时修复，不把每个合并提交自动推给用户。正式版本号不得重复使用，也不得覆盖已公布的 XPI。

#### 准备候选

1. 在功能分支同步 `manifest.json`、`package.json` 和 `package-lock.json` 的版本。扩展 ID 与 `update_url` 保持不变，兼容范围只声明实际支持的 Zotero。
2. 构建确切候选，运行适用检查，并按[安装升级验收](ACCEPTANCE.md#3-安装和升级)验证持久包。记录源码提交、包 SHA-256、宿主版本和真实结果；热重载不代替升级。
3. 从该包准备候选清单，例如：

   ```bash
   node tools/prepare-release.mjs v0.3.0 zotero-neo.xpi --output updates.candidate.json
   node tools/check-release.mjs v0.3.0
   ```

   准备工具保留正式 `updates.json` 的历史，不继承未发布的旧候选，也不修改正式更新清单。代码或包版本变化后必须重新准备哈希；文档与候选清单本身不进入 XPI。
4. 通过 PR 合并候选，要求最新 HEAD 的 CI 通过。取得同一源码的 CI 包并核对已验收哈希；不把相同版本号当作相同包的证据。

#### 发布与推广

获得发布授权后，从已验收的 `main` 运行 **Build and release**，填写 `release_tag`。工作流固定本轮源码 SHA，验证候选与规范包；只在标签不存在时创建标签，不重定向旧标签。发布器先创建草稿、上传 XPI 与 SHA-256 文件、下载回验，再公开 Release。已存在的同字节资产可幂等复用，冲突或不完整的资产拒绝覆盖。

为 Release 填写中文用户说明：主要改进、影响现有设置的变化、宿主兼容范围、已知限制与是否需要重启。GitHub 自动提交清单不能代替这些说明。

公开 Release 不等于已向用户推送。取得该标签的完整源码 SHA 后，执行：

```bash
GITHUB_REPOSITORY=zhongyangchuwu/Zotero-Neo node tools/promote-release.mjs v0.3.0 <完整源码SHA> --output /tmp/neo-updates.json
```

该命令只读取远端，核对稳定版标签、公开 Release、包身份、哈希、下载可达性及正式清单，输出待审查的新清单；不会直接推送或更改 `main`。将输出作为独立 PR 的 `updates.json` 变更，在合并前再次核对 Release 与版本单调递增。正式清单只接纳稳定版，不把候选或预发布自动推给普通用户。

清单合并后，从保留旧版本的独立 profile 使用 Zotero 原生更新检查完成真实网络升级，并核对安装字节、设置和重启后的行为。发布前的本地持久升级与发布后的网络发现分别记录，不把其中一个称作另一个。

#### 失败与恢复

包验收、发布或下载校验失败时，不推广清单。先保留错误和确切身份，再解决原因；不要移动已发布标签、重传同号不同字节或跳过哈希。若用户已安装有问题的版本，发布更高的补丁版本修复；从清单移除版本只会停止后续分发，不会让已安装用户自动降级。GitHub 没有跨标签、Release、资产与 Git 提交的原子事务，工具的末次核对不能防止所有外部并发改动，发布期间应避免其他写入者修改同一发行。

### 文档站

仓库根目录也是 VitePress 文档站根目录，配置位于 `.vitepress/config.ts`。Markdown 来源包括根页面和 `docs/*.md`，静态构建输出到 `.vitepress/dist/`。文档默认只维护中文；现有英文按需迁移，不建立双语副本，具体要求见[文档编写规范](DOCUMENTATION_AUTHORING.md)。

安装上述共享依赖后，在根目录运行：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

编辑时使用 `docs:dev`。`docs:preview` 提供最近一次静态构建；重新构建后要重启预览服务，避免缓存的文件信息继续指向旧 HTML 或资源名。在 GitHub Pages 的 base 路径 `/Zotero-Neo/` 下检查构建结果。

仓库管理员需要将 Pages 构建来源设为 GitHub Actions。PR 只构建和检查站点，不发布；部署仅允许 `main`。文档站输出独立于 XPI 和插件运行时。

### Zotero 原生 React 界面

设置中心、Picker 和引用详情在实际 Zotero 窗口中使用静态打包的 React 界面。`src/platform/native-ui.ts` 按精确 Window／Document 管理运行时和视图，跨 compartment 只传递克隆的数据模型和显式命令；业务控制器继续负责输入、提交及异步工作。界面关闭时先卸载 React，再释放宿主节点。共享 React bundle 也供 AI 问答界面使用；打开这些界面本身不会发起模型请求。

按下文使用隔离配置在 Zotero 中验证受影响的设置、Picker 和 Reader 工作流，包括焦点、重开与释放。真实界面截图及历史设计图见[仓库 UI 评审资料](https://github.com/zhongyangchuwu/Zotero-Neo/tree/main/assets/ui-review)。

### 本地 Zotero GUI 迭代

使用专用 Zotero 开发 profile，并将其数据目录与个人文献库分开。开发工具只选择 profile，不会自动隔离数据目录。

#### Linux

可以直接使用未注册到 `profiles.ini` 的独立 profile。例如，先创建一次性测试目录：

```bash
mkdir -p /tmp/zotero-neo-dev/profile /tmp/zotero-neo-dev/data
```

在 `/tmp/zotero-neo-dev/profile/user.js` 中显式隔离数据目录，并跳过会触及个人文字处理器配置的插件安装：

```js
user_pref('extensions.zotero.dataDir', '/tmp/zotero-neo-dev/data');
user_pref('extensions.zotero.useDataDir', true);
user_pref('extensions.zoteroWinWordIntegration.skipInstallation', true);
user_pref('extensions.zoteroOpenOfficeIntegration.skipInstallation', true);
user_pref('extensions.zoteroMacWordIntegration.skipInstallation', true);
```

指定实际安装目录中的 `zotero` 启动程序，完成一次配置：

```bash
ZOTERO_NEO_ZOTERO_EXE=/path/to/Zotero_linux-x86_64/zotero \
  npm run dev:setup -- --profile /tmp/zotero-neo-dev/profile
```

可执行文件路径会写入本地配置，后续命令无需重复设置环境变量。`/tmp` 只适合一次性测试；长期开发时，把 profile、data 及上述路径一起换到自己的持久目录。

#### WSL 与 Windows Zotero

关闭该开发 profile 的 Zotero 后，只需配置一次：

```bash
npm run dev:setup -- --profile /mnt/c/Users/YOU/AppData/Roaming/Zotero/Zotero/Profiles/DEV.default
```

工具会把 WSL 的 `/mnt/<drive>/...` 转为 Windows 路径；Linux 原生 Zotero 则直接使用本地路径。

#### 启动、重载与检查

setup 开启本地远程调试，将 profile 和 Zotero 可执行文件路径记录到被 Git 忽略的 `.zotero-neo-dev.json`，并将 `build/addon/` 镜像到 profile 下的 `zotero-neo-rdp`。配置完成后，先关闭仍使用该 profile 的 Zotero，再启动开发实例：

```bash
npm run dev:start
```

该命令启动配置的 profile，并从解包镜像安装临时扩展。不要同时在这个 profile 中安装同 ID 的 Neo XPI；重复安装可能使 Main/Reader 处理器竞争，并显示旧版 Command Palette。

保持开发实例运行，使用以下命令迭代：

```bash
npm run dev
npm run dev:status
```

`dev` 重建并重载临时扩展；`dev:status` 报告 profile、RDP 连接、镜像和启动日志位置。卸载 Neo 不会清除 `extensions.zotero-neo.*` 偏好或条目标签、持久化 marks 等 Zotero 数据，因此重装不等于干净偏好测试。原生验证只创建并清理明确归本次测试所有的数据，不修改个人条目。

## 品牌与资源

- `assets/branding/` 保存 README 和文档站使用的品牌原图。
- `assets/package/` 是 XPI 的静态骨架，包含运行时图标、偏好页和 AI 问答工具窗文档；包内路径保持 `icons/*` 和 `content/*`。VitePress 不发布此目录。
- `assets/docs/media/` 保存文档站的截图、视频和字幕，发布路径为 `/media/`。只有这里的媒体会作为站点公共文件发布。
- `assets/ui-review/screenshots/` 保存实机评审截图、历史基线与设计稿；索引和采集记录见 `assets/ui-review/README.md`。它们不发布到文档站，也不进入 XPI。


### 静态 AI、React 与加密 bundle

`tools/build.mjs` 将 `src/ai/runtime.ts` 打包为 `content/ai-runtime.js`，将 `src/ai-qa/ui/index.tsx` 打包为 `content/ai-qa-ui.js`，并把 AI 问答工具窗静态文档复制到 `content/ai-qa-window.xhtml`。`vendor/ai-sdk/` 固定 `ai@7.0.162`、`@ai-sdk/openai-compatible@3.0.84` 与 `@ai-sdk/openai@4.0.108`，分别通过兼容 Chat 模型和 Responses 模型支持显式协议选择；完整闭包、tarball integrity、上游来源和许可证记录在该目录的 `package-lock.json` 与 `provenance.json`。`vendor/react/` 固定 `react@19.3.1`、`react-dom@19.3.1` 和 `scheduler@0.28.0`，完整闭包记录在对应的 lockfile 和 provenance 文件中。

AI 问答工具窗使用生产 URI `chrome://zotero-neo-ai-qa/content/ai-qa-window.xhtml`，不直接以 file/jar URI 加载。`src/platform/ai-qa-ui.ts` 在首次打开时惰性注册已打包的 `content/` 资源并持有 `destruct()` 句柄；`src/toolkit/reader/ai-qa-panel.ts` 负责精确 Reader 的工具窗，窗口类型为 `zotero-neo:ai-qa`。Addon/Toolkit 退出时先关闭所拥有的窗口，再释放共享注册。

Neo 文献表格复用 `zotero-neo-ui` 的 chrome 注册，静态外壳为 `content/literature-table-window.xhtml`。一个主窗口最多持有一个表格窗口；关闭主窗口或卸载 Neo 时先退休读取与订阅，再释放 UI 注册。Toolkit 单独读取原生文库、分类和条目；表格不修改主窗口的过滤器和树布局。

文献表格单独打包为 `content/literature-ui.js`，不把表格用的 Base UI 控件加载到其他 Neo 面板。`vendor/base-ui/` 固定 `@base-ui/react@1.9.0` 及其依赖，用 `node tools/vendor-runtimes.mjs base-ui` 重新生成。控件复用工具窗已有的 React、ReactDOM 和 JSX runtime，不打入第二份 React。React 保存弹层、焦点和编辑草稿；`src/literature-table/` 控制筛选、排序、分页、命名视图及编辑基线，通过可序列化命令与结果交互。保存沿用 `setItemAttribute`，以事务回执判定成功，不以 Zotero 的变更通知代替回执。

XPI 收录项目 `LICENSE`、`licenses/fuzzysort-LICENSE`，以及 AI SDK、React、age-encryption 和 Base UI 各自的 `*-NOTICE`、`*-provenance.json`。版本、完整性和上游来源记录在各 vendor 目录；`NOTICE` 保留许可证文本。可执行依赖静态进入生成的 bundle，不在运行时安装或下载，也不以原始 vendor 包作为单独的 XPI 成员。`tools/check-package.mjs` 对成员清单和打包后的 notice/provenance 内容作精确校验。

### 配置迁移格式与加密边界

用户入口与操作见[设置快照](SETTINGS_GUIDE.md#导出和恢复配置)。`src/settings-snapshots/` 持有版本化语义文档、服务、模板目录、托管发布和展示控制器。Zotero／Neo 使用内置验证模板；其他插件只能由本机审核过的字段模板生成偏好适配器，不是从快照装载执行代码的插件 SDK。常规发现只读取由 Toolkit 核对归属的静态标记和默认值声明。对短键名，显式扫描由 Zotero 加载目标插件的原生设置页，Toolkit 仅取已绑定的完整键名。短声明、静态控件、与插件 ID 对应且无冲突的命名空间、默认类型和原生绑定需相互印证；扫描不读取字段值，不向控件发送输入。无原生绑定的动态配置与代码型字段仍不支持。

模板按确切插件 ID 的稳定摘要独立存储，记录插件版本、声明来源与修订。导入模板始终是草稿，便携性和敏感性必须在本机确认；版本、来源或模板变化使旧审核失效。原生、Neo 私有及共享命名空间有字段归属保护，不能仅凭前缀把某个插件归入全部 `extensions.zotero.*`。模板最多 512 KiB，只保存受限字段元数据，不携带配置值或执行逻辑。

v1 明文封套标识为 `format: zotero-neo-settings`、`schemaVersion: 1`，包含 `createdAt`、`producer`、`zoteroVersion` 和 `sections`。每个 section 记录 `adapterID`、`schemaVersion`、`sourceVersion` 与 `entries`；entry 的 `state` 为 `{ kind: set, value: … }` 或 `{ kind: reset }`。缺席字段不表示恢复默认，`false`、`0` 和空字符串不丢弃。文件不决定执行代码、字段秘密属性、标签或可执行适配器；未知封套版本拒绝，未知适配器报告并跳过。

容器能力由共享 `SETTINGS_CONTAINERS` 登记：默认 age 加密；显式 JSON 明文禁止包含已知秘密。导入按实际内容识别，不信任扩展名或文件自报的秘密属性。`content/settings-snapshots-crypto.js` 是静态打包的 classic worker，兼容既有 age 文件。密码模式由固定 age 库完成：scrypt factor 18，约 256 MiB KDF 内存，不自建密码学协议、用户密钥文件或运行时依赖。完整认证后才解析 UTF-8／语义格式；16 KiB 未认证 header 入场上限先于库的 stanza 分配，单 scrypt identity 准入再限制 KDF 成本。技术上限为 32 MiB UTF-8 明文、20,000 entries，单字符串最多 2,097,152 个 UTF-16 code units；密文限制另计 armor／STREAM 开销，不是 1 MB 产品目标。

已安装 XPI 中的 worker 通过现有 `chrome://zotero-neo-ui/content/settings-snapshots-crypto.js` 映射加载，不把 `jar:` 资源根直接交给 `Worker`；注册和退休沿用原生 UI 的插件级生命周期。

服务在 profile 范围串行操作。预览计划由服务签发；恢复前复查原值和来源字节，核对适配器身份，适配器在实际写入前再核对当前性及原值。保留旧值通过原有导出完成，与恢复写入分离；确认恢复时不创建文件。导出使用系统文件选择器授予当次覆盖权限，文件同目录暂存并在发布后读回。部分提交按回执保留，不宣称跨适配器回滚。密码与明文只限操作内存；React 模型只接收脱敏预览，worker 在取消、失效、窗口退出和销毁时退休。JavaScript 字符串释放不等于可证明的内存清零。

托管层每个目标仅发布一个插件，目标由明确选择的文库、分类及可见存储附件承载。绑定和内容指纹只在本机 profile 保存，不导出、不保存密码。JSON 无秘密时可约每 5 分钟检查本机语义变化，仅变化时自动写入；比较忽略 `createdAt`，实际写入的快照保留本次生成时间。本机绑定的 `updatedAt` 在成功写入时刷新。age 禁止自动更新。写入核对稳定文库／条目身份与已知字节摘要，保留原生已同步 hash／mtime，通过原生待上传状态交还文件同步。仅元数据变化且字节一致时跟随原生改名／移动；内容冲突、删除、未下载或只读时暂停，不自动覆盖、重建或应用远端配置。失败后保留可恢复文件并报告，不将文件已发布但绑定未保存谎报为成功。实际跨设备传输仍须独立验证 Zotero 数据同步与文件同步。

## 运行时架构

交互模型与当前功能所有权见[架构](ARCHITECTURE.md)。Neo 使用严格 TypeScript，通过打包生成 Gecko Bootstrap 运行时；内部 Toolkit 不新增运行时依赖。

`src/toolkit/main/private-types.ts` 和 `src/toolkit/reader/private-types.ts` 将宿主结构类型限制在 Toolkit 内。`src/toolkit/index.ts` 汇总 Main/Reader 入口；Main 包含 Note-pane 能力，无单独 Note Toolkit。功能代码使用这些能力入口，原生结构类型和私有实现留在 Toolkit 内。没有等价公开 API 时，保留契约后必需的私有能力。

Zotero 管理 Items、视图、标签页、Notes 和 Reader 状态。功能负责目标选择、基数、确认与反馈；Toolkit 负责宿主查找、原生协议、DOM 接缝、跨 compartment 载荷和资源退休。公开 API 能保留行为时优先使用；必要的私有依赖即使经过包装，仍属于私有能力。公开条目 API 和 `src/platform/zotero-items.ts` 可以直接使用，无需逐个套一对一包装。

学术来源及应用用例的依赖方向见[架构：引用增强](ARCHITECTURE.md#引用增强)。`src/scholarly/` 是共享查询、来源适配、限速与缓存的规范位置；`src/metadata-review/` 管理差异和审阅界面，文库写入属于 `src/operations/metadata.ts`。成果封套、各 payload、原生附件与旧旁路迁移见[成果附件格式](ARTIFACT_FORMAT.md)；缓存不能代替审阅回执。

元数据审阅的双端同步、按需下载与离线分支已有实测；外部 harness 的附件读取／导入仍需用实际 MCP 工具单独核验。具体范围与证据见[成果附件格式](ARTIFACT_FORMAT.md#跨设备可用性)，不以本机保存或复制附件替代同步验收。

**来源选择与社区参考**

本轮公开样本探测中，Crossref、arXiv、INSPIRE 和 OpenAlex 返回 HTTP 200；Semantic Scholar 匿名精确查询返回 429，没有自动重试。生产接入 Semantic Scholar、arXiv、Crossref 和 INSPIRE；OpenAlex 仅作调研，尚未接入。免费公开来源已覆盖当前候选、发表字段和 INSPIRE 引用键需求，没有登录或付费试用。认证／付费访问的额度与可靠性未验证；只有出现实际覆盖或吞吐缺口时才另行确认授权和费用。OpenAlex 的密钥、预算与收费以[官方文档](https://help.openalex.org/api/authentication/)为准，不把调研成功当作已配置订阅。

| 社区项目 | 本轮参考及取舍 |
| --- | --- |
| [Zotero INSPIRE v4.1.2](https://github.com/fkguo/zotero-inspire/releases/tag/v4.1.2) | 参考发表检查和 TeX-key／BibTeX 工作流；Neo 直接查询公开 INSPIRE API，不依赖该插件或其本地读 token。 |
| [arXiv Workflow v0.4.2](https://github.com/AllanChain/zotero-arxiv-workflow/releases/tag/v0.4.2) | 参考多来源发表关联；不自动合并条目、替换 PDF 或搬迁批注。 |
| [Zotero Metadata Refresh v0.5.0](https://github.com/ZhiboRao/zotero-meta-refresh/releases/tag/v0.5.0) | 参考逐字段预览及明确确认；沿用 Neo Operations 的写入边界，不引入插件依赖。 |
| [Better BibTeX](https://retorque.re/zotero-better-bibtex/citing/index.html) | 保留既有可选桥接和 Zotero 原生 Citation Key；INSPIRE `texkeys[0]` 是来源建议，不替代本地生成规则。 |

这些项目仅作公开文档和源码调研，未安装试用，也未复制其代码。来源字段和版本日期可能不同；不能因多个服务聚合了同一条记录，就把它们当作独立权威证明。

按位置定位的章节和图表跳转显式采用原生 `behavior: 'instant'`：宿主 `navigate()` 的 Promise 不等待相邻页平滑滚动完成，不能据此认为已到达目标。连续 `j/k` 滚动仍沿用原有平滑滚动策略。

`readerRegionPreview()` 默认保留成员遮罩，用于精确区域；图表列表和对象摘录显式传入第四参数 `'bounds'`，保留每页整组外框的连续原图。两种方式都先校验全部原始成员并通过 PDF viewport 变换，沿用来源退休、取消、显示图层与像素上限；连续截图只分配一张画布。截图不改变成员位置、正文排除或解析缓存身份。对象笔记的内容身份包含截图表示版本，避免新表示复用旧遮罩图片，同时保留旧笔记。

### 本地规则内核与配置

`src/document-analysis/local-rules/` 是纯 TypeScript 模块。公开入口为 `index.ts`：接收未旋转 PDF 用户坐标中的 `LocalFigurePage[]`，返回纯数据区域；不读取 Zotero、DOM、偏好或磁盘。共享布局事实、题注识别、图形与表格证据、标签、组件连接、题注关联和段落构建各有负责方。段落构建接收明确的文字排除集合，不自行调用图表推断。

候选规则只提供自己的证据、文字成员或组件连接，不修改另一规则的内部集合；共享合并与归属仲裁处理重复和争用。题注／正文阻隔、坐标有效性及歧义退出始终生效，不是可任意关闭的规则。阶段顺序固定，不支持运行时脚本、任意排序或动态插件注册。宿主采集仍在 Toolkit，`local.ts` 负责解析器、来源与缓存适配；所有运行时代码继续静态打入 XPI。

算法指令须同时有作者写出的 Algorithm 标题、重复编号步骤和对齐原生横线证据；面板组装后复用同一成员判据，保留共享定义，不把空框当主体。短居中题注可借最近原生分隔线确定表格搜索宽度，但仍须证明重复单元格和归属，不能借远处通栏页眉跨正文栏扩张。文字分轨优先匹配字号；局部数学脚标只在可连接的轨道间选择，不能被远处图轴标签夺走。

图内普通文字先归属，再用固定的已证标签边界关联 `(a)`／`(b)` 子图说明，避免仅按裸绘图路径漏掉说明，或由先处理的子图说明向相邻面板扩张。同字号、相隔足够远的面板前缀可分开窄栏缝中的文字，后续换行仍受原字号、左对齐和行距约束。小型原生矢量字形／标签只在一个估计行距内关联唯一最近主体，使用实际绘制边界；`maxGapEm` 仍控制普通文字的横向邻接，不扩大所有图形的连通距离。表格框架的竖线可由在既有端点容差内对齐且连续覆盖的多段原生细线共同证明，断裂或错列的短线不能仅凭总包围框充当整列分隔线。

`profile.ts` 定义输入 `LocalRuleOptions` 与解析后的不可变 `LocalRuleProfile`。先调用 `resolveLocalRuleProfile()`，再把同一个 profile 传给 `localFigureRegions()` 或 `localDocumentRegions()`；不要在逐页循环中重新解析配置。所有规则默认开启：

| 配置 | 参数与默认值 | 控制的行为 |
| --- | --- | --- |
| `rules.unruledTables` | `enabled: true`、`minRows: 3`、`minColumns: 2` | 从重复单元格和稳定列识别少线／无框表。行列数须为至少 2 的整数。 |
| `rules.graphicLabels` | `enabled: true`、`maxFontSizeEm: 1.4`、`maxGapEm: 0.8` | 文字标签归属和图内扩张；不会取消表格规则已证明的单元格归属。 |
| `rules.ruledTables` | `enabled: true`、`endpointToleranceEm: 0.2` | 连接端点对齐、具有单元格证据的离散横线；关闭不等于隐藏所有表格。 |
| `rules.compoundPanels` | `enabled: true`、`maxGapEm: 1.5`、`minOverlapRatio: 0.4`、`maxRepeatedGapRatio: 0.25` | 构建复合图的面板带。至少三个边缘对齐、尺寸相近且间隔一致的纵向面板，另允许间距不超过最短面板高度的指定比例；正文、题注阻隔和归属争用仍生效。两个比例范围均为 `(0, 1]`。 |
| `association` | `maxDistanceLines: 5`、`minWidthEm: 3`、`minHeightEm: 2` | 限制题注关联距离及主体最小尺寸。 |

`Em` 按该页估计的文字尺度计算，`Lines` 按估计行距计算，不是屏幕像素。其余数值参数必须为有限正数。未知键、错误类型和不支持的版本均会报错，不忽略拼写错误或静默换用默认规则。

放宽参数不会取消正文／题注阻挡。标签扩张与正文排除共用边界约束，不能借较大留白吞入普通段落；换行标签也受所选字号上限约束。

在 TypeScript 调用方通过公开入口使用配置和可选诊断：

```ts
import {
  localDocumentRegions,
  resolveLocalRuleProfile,
  type LocalFigurePage,
  type LocalRuleDiagnostic,
  type LocalRuleOptions,
} from './src/document-analysis/local-rules';

export function inspectPages(pages: readonly LocalFigurePage[]) {
  const options = {
    version: 1,
    rules: { unruledTables: { minRows: 4 } },
  } satisfies LocalRuleOptions;
  const profile = resolveLocalRuleProfile(options);
  const diagnostics: LocalRuleDiagnostic[] = [];
  const regions = localDocumentRegions(pages, profile, (event) => diagnostics.push(event));
  return { regions, diagnostics };
}
```

不传第三个参数时不收集诊断事件。事件中的 `ruleId`、`outcome`、`reason` 和可用的候选／题注引用用于解释候选、正文阻挡、缺少主体及关联争用；没有证据时不能从空结果伪造精确原因。诊断不写入区域缓存，也不作为解析策略的输入。

实际 Reader 使用高级字符串偏好 `extensions.zotero-neo.documentAnalysis.local.rules`，值为上述输入配置的 JSON；空字符串表示默认组合，操作见[设置参考](SETTINGS_REFERENCE.md#本地规则配置高级)。有效参数、启用规则及引擎／几何／规则修订进入规范化指纹，等价 JSON 的缓存身份相同。本地适配器代次为 4，当前引擎修订为 3、几何修订为 2；配置变化使在途和已展示结果退休，但普通读取仍不自动保存缓存。旧槽与绑定旧解析身份的纠错保留，不按区域 ID 强行迁移。

#### 回放原生几何与规则消融

`tools/replay-local-rules.mjs` 回放已有的原生几何，不下载 PDF、不调用 Zotero 或模型。输入目录内每篇为 `<documentId>.json`，含 `documentId`、`pdfSha256`、`sourceFingerprint` 和完整的 `pages`；每页含 `pageIndex`、`viewBox`、`text`、`graphics`。此捕获格式限定未旋转坐标，不能用显示截图或公开标注框代替输入证据。文件元数据须与语料清单一致；工具不重新读取 PDF 字节验证身份。

先将 `GEOMETRY_C` 指向已有 C 集捕获目录，并选择尚不存在的输出路径。默认组合示例：

```bash
node tools/replay-local-rules.mjs \
  --corpus evidence/document-quality/corpus-c.json \
  --geometry "$GEOMETRY_C" \
  --output /tmp/neo-local-default.json
```

可重复传入 `--corpus`、`--geometry`，合并不重叠的语料。`--profile <JSON文件>` 选择规则配置，`--diagnostics <新文件>` 保存决策事件；`--baseline <旧观测文件>` 可重复传入，逐文档比较完整区域与对象组，不能只比较通过数。工具记录输入／源码／bundle 哈希与实际配置；输出可直接交给现有 `quality:evaluate`。这里的耗时只含分组回放，不是完整解析或 Reader 延迟。

指定 `--baseline` 后，每篇输入都必须有相同 PDF 哈希的旧观测；空或缺失的对照会报错。未指定时明确记录未比较，不把空对照列表视为输出相等。

新增规则先说明适用证据、来源和参数单位，再增加真实行为正例、负例及必要的变换检查。按规则组合消融，分别检查误题注、错误合并、裁图边界与未关联原因；不按论文 ID、题号或 gold 框写分支。固定核验点全过不能代替额外对象审查或未见样本验证，质量口径见[解析质量评测](QUALITY_EVALUATION.md)。

### 模块基座与启动配置

`src/core/module-host.ts` 提供按 MainWindow 或 ReaderSession 隔离的模块宿主及独立模块作用域。同步激活失败会释放部分资源并保留原错误；动作贡献按 `(BindingContext, ActionId)` 唯一登记，返回有类型的调用入口。退出先使全部回调失效，再完成其余释放，即使某次清理失败也不会中断其他模块。

`src/modules/index.ts` 是静态内置清单，启动校验 ID、依赖图和精确上下文贡献。完整能力目录见[模块所有权表](MODULE_DESIGN.md#模块目录与所有权)；16 个核心模块固定启用，7 个可选增强为 `reader-hints`、`extensions`、`translation`、`references`、`ai-qa`、`tab-enhancements` 与 `item-attributes`。`ai-qa` 依赖核心 `reader-selection`，`references` 不依赖 AI 问答，`tab-enhancements` 依赖核心 `workspace`。

MainWindow 组合标签、扩展、分类、工作集、Library、Notes、Workspace、文档准备与配置迁移入口；启用时，标签页增强会在 Zotero 初始化完成后按该窗口的有效 session 延迟激活。ReaderSession 直接组合导航、章节查找、图表浏览、解析对照、选择、批注、对象摘录、章节笔记、文档准备、hints、引用增强、可选翻译与 AI 问答、独立 Library citekey 贡献及 Workspace 分屏/焦点。各模块仅接收具名端口；Operations 与 Toolkit 保持各自负责方。

`src/core/module-runtime.ts` 根据七项可选请求应用增强；`reader-hints`、`extensions` 与 `references` 默认开启，其余四项对新配置默认关闭。`src/platform/module-startup.ts` 在 Zotero 应用对象上保留请求的 JSON 快照，因此 Neo 热重载不会应用新请求，完全退出并重启 Zotero 后才会应用。旧启动快照缺少可选字段时，已应用值按关闭处理；旧版 `reader-ai` 启用偏好不构成启用 `ai-qa` 的同意；旧核心键 `extensions.zotero-neo.modules.<core>.enabled=false` 不会关闭核心功能。

实机核对模块配置时使用专用 profile 和自有数据，确认七项可选请求保存、Neo 热重载与 Zotero 完全退出／重启的差异；确认默认引用增强已启用、其本地分析和文库查找不发起元数据请求，只有用户明确查询才访问来源；确认默认状态下 AI 问答无入口／选区动作，且不挂载面板 runtime、不读取凭据或发送请求；确认新配置默认关闭翻译、标签页增强和条目自定义属性。手动启用 `ai-qa` 并重启后入口可用，关闭再重启后入口撤除且既有成果仍保留。恢复默认后 `reader-hints`、`extensions`、`references` 开启，其余四项关闭，其中 `translation=false` 显式保留；关闭全部七项后核心模块仍须可用，旧核心 `false` 偏好无效，恢复默认不改变行为偏好（包括 `noteEditor.enabled`）。故障只注入自有宿主并恢复原方法；回读自有数据与偏好，确认进程状态。不要把“关闭全部模块”作为配置场景。完整用户状态说明见[设置参考](SETTINGS_REFERENCE.md#模块)。

#### 条目自定义属性手动核对

在隔离配置中启用 `item-attributes` 并完全重启 Zotero。未选条目或位于只读文库时，`<Space>pa` 仍须能管理定义。创建文本和数字定义，验证原生列菜单、负数／小数／零／大整数／长小数／极小数的排序与原始显示、Info 单条目失焦保存；Info 的 Escape 沿用主窗口失焦策略，Neo 编辑窗的 Escape 则取消未提交值。在只读文库中加载插件后切回可写文库，仍须能编辑保存。原生多选不得只改第一条。通过 `<Space>ia` 核对 Neo 选择集优先、临时 Visual、目标固定、混合值、批量确认与清除，回读 Extra 和原生撤销结果。覆盖同键变化、无关行变化、重复键、未保存编辑及只读目标；取消或拒绝不能部分写入。

批量保存故障只注入自有条目：第一条保存后让第二条失败，核对 SQL 与内存缓存回到原值、原始错误未被替换、无脏状态残留且可重试；另测保存等待期间发生的无关脏编辑仍保留。重命名、类型变更、删除定义、双 MainWindow、热重载及停用重启后，列身份与数据保留应符合[主窗口指南](MAIN_GUIDE.md#给文献添加自定义属性)。生命周期改动还需用 XPI 安装／更新验证，不修改个人文库或文字处理器配置。

用选择型属性核对选项改名不改写 Extra，删除选项后显示旧值但不自动修复，重新选择才写入。测试单选和多选的单条与批量设置，确认混合值不会在未提交时合并。设置快照迁移定义及选项 ID，不迁移条目值。表格核对原生标签、部分发表日期、添加与修改日期、跨条目类型的书目列及选择型属性筛选；重新打开已命名视图后条件仍生效，原生主列表不受影响。

#### 翻译与安装手动核对

在隔离 profile 中使用真实 Translate for Zotero 2.4.8，覆盖首次准备的确认／取消、已有用户偏好保留及完整重启。确认自动译文完成后保存用户修订内容，原生便签位于发起选区；主／次分屏、Reading Mode、相同原文的任务复用、替换 popup、关闭视图及外部修改 PDF 均不得写错来源。重开 Reader 后核对原生持久化、侧栏角色与原有颜色筛选。安装／更新路径还需核对下载前确认、校验失败、取消和重启提示；未实际执行的路径不记录通过。

#### 标签页增强手动核对

使用专用 profile，按实际界面核对下列行为：

- 默认关闭时，原生标签栏、工具栏与核心 Workspace 操作仍可用。保存启用请求后只热重载 Neo，标签页增强仍沿用原已应用状态；完全退出并重启 Zotero 后才应用新请求。保存停用请求并再次完整重启后，原生标签栏和工具栏恢复。
- 在已启用的模块卡片中选择**最左侧**、**最右侧**和**上方**；确认默认位置为左侧，位置切换立即生效，当前 Reader／Note、活动视图和分组不丢失，Reader、PDF 和 Note 不重挂或重载。上方模式由 Neo 绘制标签栏并保留 Zotero 原生工具栏；验证挂载失败时原生界面恢复。
- 在上方模式用鼠标执行最终界面提供的基础标签／分组操作；核对原生键盘输入仍由 Zotero 处理，且没有新增顶部模式快捷键。原生标签操作逐项适配；未实际验证的拖放、菜单或其他操作不记录为已支持。
- 左／右侧栏宽度下限为 `180`、上限为 `520`，默认 `260`；确认原有宽度和收起设置仍适用于侧栏模式。
- 核对标题模板保留现有字段、citekey 与空值回退行为；切换位置和停用模块都不改 Zotero 原生标签标题、条目标题或文献元数据。
- 建立阅读组后，从原生路径关闭成员并核对其立即移除、空组仍保留；解散组不关闭文档。相同 PDF 的两个视图保持独立；两窗口中激活转到所属窗口，关闭组只影响发起窗口，不在当前窗口伪造其他窗口的原生标签。
- 完全退出并重启 Zotero 后，核对原生会话恢复的视图可关联分组，旧 `tabEnhancements.groups.v1` 备份不变，当前分组只保存在 `tabEnhancements.groups.v2`。停用并重启后再次确认原生界面恢复且分组、标题设置仍保留。
- 在 Main 普通模式验证 `<Space>bc`／`<Space>ba` 固定发起时的目标，多 PDF 时明确选择，缺失目标显示数量。取消各提示不改变分组；确认后核对成功打开并分组的视图及成功数量，不修改 Zotero 标签、分类或元数据。

结构不可用的绑定在 matcher/count/前缀、Guide 和 Palette 前过滤，不能改写保存的用户绑定或全局删除同名动作。Navigation 的 marks/侧栏获取必须在激活事务内，Base 启动失败释放未完成 session；失败实例不由定时重扫循环重建。模块清理错误通过显式 `CleanupFailure` 收集，不登记到会吞异常的通用清理层。

工作集拥有 SelectionStore、Visual 范围及 Selection Panel。Main Surface 继续初始化和取消原生 Cursor/多目标，持有共享行渲染，并向模块注入刷新、主题和现有 Reveal 导航端口。目标解析与 Library Trash 接收明确 Selection 端口；来源为空或退休后沿用当前目标。共享导航通过局部界面端口捕获原面板，避免读取已退休的 Selection 或 session 的 Selection Panel 状态。

Library 按 Main session 拥有 Local Find 查询/界面及最近回收批次。可见行查找保留原生 View；条目选择器显式注入 Library 候选，范围与个人库回退保持原义。Main 保留目标策略、焦点和唯一历史；历史通过 `MainViewOperations` 使用原生查询/标签过滤能力，Workspace 和工作集 Reveal 独立于 Library 动作。Reader citekey 仍可直接处理当前 Reader 条目。

共享 Picker 使用实际 Main session 的当前性端口；关闭先退休并清空运行时引用，再逐项释放资源。清理重入、异常或晚到的获取只能处理本次界面，不能关闭替换 Picker 或恢复旧焦点。Local Find 的主题句柄归单次界面，长期模块作用域不累计保留已关闭 DOM。

Notes 按窗口拥有候选、选择后的打开编排及可选 Vim 编辑的模式、寄存器和 caret 样式。`NoteSurfaceRuntime` 只保留精确编辑器身份、输入 runtime 和退休代次；Surface 继续决定原生/IME 输入、count、前缀及焦点。Note 普通动作和 Insert 退出登记到原上下文；候选必须显式传给 Picker。共享导航提供选择完成后的宿主委托，沿用现有历史栈。

输入缓冲和计时器由 `InputRuntime` 管理，Surface 负责原生输入／IME 仲裁与状态反馈；`PrefixGuideRuntime` 根据精确上下文和当前有效绑定投影后续键，支持 Space 以外的前缀。`keyGuideTimeout()` 只为不带独立动作的命令前缀提供 5 秒阅读时间，歧义短动作继续使用 matcher 超时，数字计数沿用现有解析器和指南时序。Escape 清除整条待完成输入，退格保留尚未删去的计数，并使被取消的动作计时器失效。

Reader 导航拥有页面/滚动/缩放/搜索、语义与批注位置遍历、marks、按需 captions、原生侧栏增强及平滑滚动状态，登记 Normal 与四个侧栏上下文的实际处理器。Surface 保留输入和精确视图、CurrentTarget、共享导航历史与 Toolkit 导航宿主；Workspace 复用该宿主处理分屏与方向焦点。marks 保存完成后重查发起交互，不能覆盖新的输入或界面状态；销毁视图时先清空 RAF/完成回调的所有权，再尝试原生取消，即使取消失败也不保留旧视图或阻塞下一次滚动。

Reader 选择拥有 DOM 范围、文本 motions、Flash 输入/标签、复制/搜索及动作面板；Surface 仍保留模式、输入仲裁、精确视图和共享滚动。交互同时捕获 ReaderView 与 Document，新的动作/原生选择接纳前先退休替换视图；旧输入、可用性判断和晚到结果不能操作后继界面。临时样式、anchor、主题与监听均随所属交互释放，具体边界见[架构](ARCHITECTURE.md#reader)。

Reader 批注模块拥有创建/删除/改色/过滤/复制及评论编辑，Surface 保留 CurrentTarget、NativeInput 和混合按键路由。评论输入、系统按键、主题、popup guard 与计时器属于精确 ReaderView / Document；退休先释放界面，已接纳的保存可以完成，但不抢回后继界面的焦点。

批注改动需用专用 profile 的自有附件验证 Select 高亮、下划线、Add note、Normal 改色/过滤/删除确认，以及评论输入实际挂载和聚焦、Escape 保存、两秒自动保存和数据库回读。另查 `i` 的 NativeInput 偏好分支、无批注时 `zb` 的滚动回退、自动保存前换标签页仍保存最终评论，以及晚到保存不覆盖后继 Reader 或 Settings 焦点。程序化设置 DOM 选择后应让 selectionchange 与渲染帧完成，再发送下一次按键；原生模型字段已变不代表 `saveTx()` 已提交。

Workspace 按 MainWindow 拥有标签页来源、确认与 Reader/Note 的 Show in Library，ReaderSession 拥有分屏切换和方向焦点。基座保留唯一历史、原生标签页重扫、精确视图发现、NativeInput 以及 Main/Note 通用面板焦点（含 Note Insert）。实机需确认三个 Surface 的标签页选择、关闭后的历史重开、主次分屏实际焦点及 Palette 路由；按键只有实际完成方向焦点移动才消费。Picker 应等待输入框实际聚焦后再发送 Enter；验证独立 Main 行选择时从 `itemsView.getSelectedItems(true)` 回读，`ZoteroPane.getSelectedItems(true)` 在 Reader 活跃时可能投影 Reader 条目，不能据此认定底层行选择相同。

### 宿主能力 Toolkit

| 能力 | Toolkit 负责方 | 边界与原因 |
| --- | --- | --- |
| Main 条目、标签页、Note 上下文与过滤 | `src/toolkit/main/host.ts` | 提供宿主事实与操作，不选择 Surface 目标。只在恰好一个原生 Scope 时调用 `getSelectedCollection()`；零个或多个 Scope 先用外层复数 API，再回退到原生 tree 的复数 API。分离的 Scope Cursor 不代替已选分类。 |
| Main 原生标签与外层侧栏布局 | `src/toolkit/main/tab-enhancements/` | 从当前 MainWindow 的原生清单投影标签页，并在 Toolkit 内适配私有 Tab API；合并原生 `_update` 与 `Notifier` 的 `item`/`tab` 通知。只在受支持布局中将侧栏放在整个 `#appcontent` 外侧，并以可逆租约移动原生工具栏；不重挂内容 deck 或 Reader/PDF iframe。 |
| Main tree 焦点、ScopeSet 与行 Cursor | `src/toolkit/main/tree.ts`、`host.ts` | 保留原生 Scope 选择与仅焦点的条目行操作；generation 令牌隔离替换或尚未稳定的行视图回调。 |
| 分类身份、条目搜索与 Scope 选择 | `src/toolkit/main/collections.ts` | 提供稳定分类 ID、路径与库可写性；先限制原生搜索 ID 数量再加载候选；等待 `onCollectionSelected()` 和 Main 条目视图加载，并核对已选及已渲染 Scope ID 后才报告完成。 |
| 分类事务回调屏障 | `src/toolkit/main/collection-transactions.ts` | 只在进入的事务体内捕获回调，按实际所属 ID 分发一次。局部观察原生 10.0.6 在 SQL 提交后的 `_commitCount` 增量，在共享回调执行前确认该事务结果，区分 SQL 回滚与提交后回调失败。仅恢复自有临时 registrar/counter descriptor，保留外部替换，不清空共享队列，也不安装宿主常驻 patch。 |
| Main 渲染行装饰 | `src/toolkit/main/rendered-items.ts` | 管理行标记与观察者；安装失败时先退休回调，再释放资源，保留原错误。 |
| 已安装扩展与偏好 | `src/toolkit/main/plugins.ts` | 将 Mozilla AddonManager 和 Zotero 偏好注册表投影为元数据/能力；扩展管理策略仍属于 Plugin Manager。 |
| Reader 注册、清单与身份 | `src/toolkit/reader/host.ts` | Reader 身份就是原生句柄；只有权威原生清单才能据此退休缺失 session。 |
| Reader 按键转发 | `src/toolkit/reader/input-bridge.ts` | 包装私有 `PdfView._onKeyDown` 与 `_textAnnotationFocused`。Zotero 会在普通 DOM 传播之外转发 PDF 按键；ReaderSession 决定消费策略，Reader controller 将评论编辑器与引用控件的精确焦点汇总为 `featureInputFocused`，包括位于 Reader UI 文档中的原生预览按钮。模块不各自安装宿主 patch。 |
| PDF 视图监听与发现 | `src/toolkit/reader/view-lifecycle.ts` | 管理主/次 PDF 视图的附着与释放；注册绑定 ReaderView、Window 与 Document，复用 Window 不复活旧监听，部分获取失败仍释放先前句柄。 |
| Reader 原生导航、搜索、缩放、分屏与焦点 | `src/toolkit/reader/navigation.ts` | 在当前原生视图执行操作，并将载荷克隆进其 realm。`prepareReaderSelectionSearch()` 返回精确 pane/原生 Find 状态的一次写入能力，不覆盖后续输入或重开的 Find；语义与历史仍由业务负责。 |
| 跳转捕获、重开与完成桥接 | `src/toolkit/reader/jump-host.ts`、`history-bridge.ts` | 在宿主边界保留视图/历史身份与完成来源；共享历史策略属于 `src/navigation/`。 |
| PDF 文本与选择几何 | `src/toolkit/reader/text-source.ts`、`selection-geometry.ts` | 读取文本层和 viewport 几何；不完整几何拒绝保存，不生成部分批注。 |
| 可见标识符文本与几何 | `src/toolkit/reader/identifier-text.ts` | 将可见 PDF.js 文本读成保留来源的同行片段，将文本范围映射成 viewport 矩形；不猜跨行拼接，不使用 OCR。 |
| PDF 链接 overlay 与原生委托 | `src/toolkit/reader/links.ts` | 读取 Zotero overlay 映射，并委托捕获的原生视图激活链接。 |
| Reader 目标 frame 可见性 | `src/toolkit/reader/visibility.ts` | 批注、标识符与原生链接共享窗口关闭及包含 frame 的可见性检查；Reading Mode 下隐藏的 PDF 不能成为操作目标。 |
| 原生 Reader 侧栏 | `src/toolkit/reader/sidebar.ts` | 为 Zotero 管理的 pane/行提供可逆展示与监听机制；绑定和目标策略在 `src/modules/reader-navigation/native-sidebar.ts`，Surface 独立使用 Toolkit 判断原生侧栏输入目标。 |
| 批注选择、过滤与 popup | `src/toolkit/reader/annotations.ts` | 适配 Reader 私有操作；条目写入继续使用公开 Zotero API。 |
| 可见批注模型与几何 | `src/toolkit/reader/annotation-targets.ts` | 只接纳当前过滤视图中、具有支持锚点且与 viewport 相交的原生批注；隐藏、已过滤、屏外及不支持的目标不进入候选。 |
| marks 几何与旧存储 | `src/toolkit/reader/marks.ts` | 提供宿主存储/几何；父条目或附件的存储策略由 `ReaderMarks` 决定。 |
| Zotero 结构化文档块 | `src/toolkit/reader/structured-document.ts` | 原生冷处理可能覆盖整个 PDF 且无法取消；请求保持显式，语义分类属于 `ReaderCaptionTargets`。 |
| Reader 引用快照 | `src/toolkit/reader/references.ts`、`reference-contracts.ts` | 读取 Zotero 原生 PDF 全文 overlay，包括未渲染页面；快照捕获精确 PDF、presentation、Window、Document 与已加载 PDF 字节指纹，异步阶段持续验证来源。SDT 块只有在 `metadata.source.hash` 与该 PDF 指纹相同时才参与补充或上下文映射。唯一、明确的 `References`/`Bibliography` 标题下，可完整解析的连续编号条目补入未被原生 overlay 覆盖的条目；引用上下文来自原 PDF 字符或唯一映射的原文段落。不完整时界面标记 `partial` 并显示遗漏警告；零条识别不是未引用的证明。只返回不含 SDK/DOM 句柄的数据和来源守卫；不使用 OCR，也不声称对所有 PDF 均能完整识别。 |
| 原生引文预览、右键与工具栏挂载 | `src/toolkit/reader/reference-interactions.ts`、`reference-interaction-contracts.ts` | 在各 presentation 的原生预览行内挂载控件，以原文及位置核对行归属；在 `createViewContextMenu` 同步追加菜单，工具栏使用既有 `custom-sections`。DOM observer 处理挂载与替换，不以常驻轮询扫描预览。原生引用逐项投影到插件 realm，避免把特权对象交给 content 数组回调。交互当前性与来源当前性分开，关闭原预览后仍保留精确来源；旧菜单不能在窗格或标签页切换后重获目标。 |
| PDF 原图局部裁剪 | `src/toolkit/reader/region-preview.ts` | 使用不依赖后台动画帧的打印调度，并将默认显示图层的有效可见性复制到独立打印配置，不修改 Reader。当前 SDK 没有完整组枚举接口，`GetOptionalContentConfig` 窄通道补齐所有图层，不能用 `/Order` 代替。原生 Promise 直接归还所属 realm，不跨域克隆。 |

引用增强由 `src/modules/references/` 和 `src/references/controller.ts` 拥有逐文献上下文动作、搜索清单、引用位置、本地匹配及单篇详情。Reader Normal 的 `openReferences` 使用 `<Space>fr`，与工具栏共用只含清单的查找入口；原生悬停不查询或聚焦。明确操作先记录锚点，再捕获并固定发起 ReaderView，通过既有导航端口跳转，不另建历史。原生预览内的按钮与浮层均按实际 ownerDocument 的焦点和精确来源窗格处理输入；没有全局 Tab 陷阱或全屏遮罩。退出或来源视图退休时取消在途工作，不能向后继文档发布结果。用户操作见[Reader 指南](READER_GUIDE.md)。

`src/references/metadata.ts` 仅在用户明确查询时请求 Semantic Scholar Graph 或 arXiv Atom，并展示来源原始字段与原始摘要；缺失摘要保持为空。查询支持取消，Semantic Scholar 与 arXiv 分别至少间隔 1 秒和 3 秒；429、离线或服务错误如实显示，不自动重试。候选需由用户选择，API 引用/被引计数与本地识别位置数分开显示。`src/main/settings-reader.ts` 在 Neo 设置的阅读器分类中管理可选 Semantic Scholar key，React 设置界面只投影是否存在密钥；论文详情不包含凭据表单。`src/platform/reference-credentials.ts` 通过 Zotero Login Manager 显式读取、保存或忘记密钥，不写入偏好、查询结果或日志，也不参与本地分析。该功能不调用 AI、生成摘要或判断引用意义。

`src/references/cache.ts` 负责元数据缓存策略：同一进程中的 Reader／服务实例共用串行化、带代次保护的缓存；只持久化成功取得的记录，保留来源原始字段和检索时间，不保存 PDF 文本、笔记、坐标或凭据。缓存使用版本 1 JSON，最多 50 条、文件不超过 4 MiB；记录满 30 分钟后标记为过期但不删除，DOI／arXiv 身份经过校验，坏记录单独忽略。`src/platform/reference-cache.ts` 负责 Gecko 文件读写，将数据保存到 `<Zotero profile>/zotero-neo-reference-cache.json`，并通过暂存文件替换。读取、保存和清除失败会返回可见错误；清除会递增代次，阻止旧在途工作重新填充缓存，且只清除元数据缓存。

`src/operations/references.ts` 拥有按当前 Library 查询本地匹配和用户明确添加论文的操作；只按 DOI/arXiv 身份去重，不覆盖已有条目，同名但身份未确认时拒绝自动添加，并拒绝只读 Library。

分类工作流由 `src/modules/collections/` 拥有。Main/Reader 在发起 Surface 提供自己的目标解析器；模块固定来源、库与条目身份，并负责确认、草稿和工作流权限，不直接读取 Main session。`src/operations/collections.ts`、`item-collections.ts` 接收明确条目和分类 ID，在写入前重新验证身份、库与可编辑性。模块内的 Picker provider 只提供同库候选和直接成员覆盖率，不选择操作目标或写入数据。组合根提供精确交互代次与释放句柄；原生对话框返回后也必须重查当前性。

Neo 分类写入共享 Toolkit 接纳屏障，直到自有回调及 Operations 的回滚恢复完成。重载策略仍由 Operations 决定；前一操作恢复缓存成员/分类状态期间，后一 Neo 分类写入不能开始。SQL 已提交时不运行回滚恢复。外部原生回调失败而自有提交回调完成时，返回真实保存回执并通过共享 logger 记录原错误；自有提交回调失败仍是可见拒绝，不能卸载已提交对象或在后续事务重放旧回调。

分类条目 provider 每次查询最多通过 Toolkit 的原生标题/作者/年份搜索取得 100 个顶层条目。Toolkit 只加载这些有界候选的 creators、item data 和 memberships。只有 Enter 确认后才调用 `loadAllData()` 完整加载该条目，满足原生 Main 渲染对子条目数据的要求；该路径不枚举 `Items.getAll()`。

Reader 目标发现与交互由以下功能负责，上述 Toolkit 提供宿主数据和几何：

| 负责方 | 职责 |
| --- | --- |
| `src/identifiers/` | 纯 DOI、arXiv 和 HTTP(S) 识别，保留原始偏移。 |
| `src/modules/reader-hints/identifier-targets.ts` | 合并文本识别与原生链接，将复制内容和跟随目的地分开。 |
| `src/modules/reader-hints/copy-targets.ts` | 将 Excerpt/Comment 作为独立角色，按批注分组，省略空角色；不与标识符去重合并。 |
| `src/modules/reader-hints/copy-hints.ts`、`link-hints.ts` | 在精确活跃视图接纳复制/跟随；链接保留原生目的地与历史语义，导航当前性同时受模块作用域约束。 |
| `src/modules/reader-hints/target-hints.ts` | 管理临时提示、字母输入、分组布局、防碰撞与清理；保留可见提示状态，使旧视图确认仍能进入取消路径。 |

Zotero 10.0.6 的标识符工具提供 DOI/arXiv 匹配与清理基线，不决定 Reader 扫描策略。Reader 增加 HTTP(S)，保留每次可见出现和 arXiv `vN` 版本，只扫描当前视图可见同行片段，不猜跨行拼接或使用 OCR。批注目标遵守 Zotero 可见性/过滤状态，并要求支持的当前视图几何。摘录里的 DOI 仍是独立复制意图。裸 DOI/arXiv 跟随时构造解析 URL；HTTP(S) 字面量保留原始路径、查询、fragment 与大小写。

原生 Reader 按页、按矩形转换批注几何，并将载荷克隆进所属 realm。跨屏外片段的总包围盒不代表存在可见锚点。确认前重新验证原生模型身份、字段/过滤/视图快照；有界布局无法放下不重叠标签时，退休该交互，不提供被遮挡但仍能选择的目标。

绑定 schema 20 将 Select 的 `h/l/j/k` 默认映射到独立的词元动作，`H/L` 提供字符级退路。旧字符与行动作的 ID 和自定义绑定语义保留；显式取消 `h/l` 时，也取消尚未自定义的 `H/L` 退路，不重新启用已取消的动作。迁移写入失败不前进 schema，可安全重试。此前的 `copyIdentifier` / `followIdentifier` 仍在解析前迁移为 `copyTarget` / `followLink`，旧 ID 不作为运行时别名。

词元动作按需读取精确 PDF 视图已存在的文本层，复用 Flash 的来源映射与视觉 span 边界；不持有常驻全文索引。DOM Selection 的半开端点投影为锚词与活动词，跨锚点时改变端点所用边缘并保留锚词，接管的原生半词锚点保持精确。视觉行移动只考察可选的词元端点，保留吸附前的水平偏好；活动词元轮廓随选择样式、视图和模块清理，不改变原生批注几何安全校验。

Bootstrap chrome 与 Zotero content 之间传递对象时，必须克隆到接收窗口。`src/platform/cross-compartment.ts` 统一处理 `Components.utils.cloneInto`、wrapper 身份及 dead-wrapper；PDF 视图句柄保留原生身份，不在每个事件中分配包装器。

异步宿主工作在应用结果前检查捕获的 Reader/session/view 身份和 generation。退出先退休回调，再移除监听器；只在 wrapper 仍自有时恢复被 patch 的方法，并防护已销毁 Gecko wrapper。活宿主上的失败必须可观测。

标签过滤读取当前渲染 Scope 的完整行结果，包括原生多行选择，不扩大到全库。分类动作目标与确认见[交互模型](INTERACTION_MODEL.md#动作目标契约)。

## 诊断

Bootstrap 将诊断写入 profile 下的 `zotero-neo-startup.log`，并通过 `Zotero.debug()` 报告运行时消息。`npm run dev:status` 显示日志路径。

## Reader 选择 API

`Zotero.Neo.reader.getSelection()` 返回当前 `ReaderSelectionContext` 或 `null`；`Zotero.Neo.reader.registerSelectionAction(action)` 注册扩展动作并返回 disposer。API 由 `src/addon.ts` 公开、`src/core/contracts.ts` 定义类型；`src/modules/reader-selection/` 负责选择上下文和动作运行时，`registry.ts` 的定义随应用存活，关闭一个 Reader 后仍保留。disposer 只删除自己的注册，同 ID 的后继注册受保护；选择模块退休后，旧上下文和回调均不可用。集成方继续使用原接口，Reader session 和 PDF.js 私有对象留在内部。

## 原生阅读视图与文档解析接口

`src/toolkit/reader/presentation.ts` 是当前显示视图的唯一解析入口：每个分屏优先使用 SDT Reading Mode 覆盖视图，操作目标始终指向可见呈现。`ReaderViewLifecycle` 在两种呈现间统一附着和释放监听器，并为精确 Window / Document 安装来源映射能力租约。租约释放只影响自身，后继租约继续有效。Reading Mode 沿用 Normal／Select 及既有绑定上下文，`ReaderMode` 保持不变。

`src/toolkit/reader/text-source.ts` 返回两种呈现的真实 Text 节点。词元、Flash、选择范围和视觉行移动共用业务实现；重排文本的视觉行来自 Range 客户矩形，段落来自原生 HTML 结构。词元快照仅覆盖锚点、活动端和相邻段落，并可在同一同步动作中复用于提示；远端锚点保持完整，不常驻全文索引。`selection-geometry.ts` 将重排选区交给原生 SDT 映射，保留 Zotero 的 sortIndex、pageLabel 和 PDF 几何。图像裁图区不被冒充为可选文字。

`reader/document-cache.ts` 的 `readReaderDocument()` 为句段、章节、图表和笔记提供缓存优先的来源契约。默认未命中时调用本地无模型解析；明确选用云端但没有匹配缓存时保留原生 SDT 退路。读取过程均不自动上传，云端上传由用户明确操作触发。`reader-selection/structured-text.ts` 只缓存区域快照；`paragraph-mapping.ts` 在一次动作中对原文字符建立临时映射，必须唯一、完整、无替字且起点源页一致；同一段落的完整原文可证实邻页续段端点，其他页面的独立出现不能作为证据。Reading Mode 限制在焦点附近段落，映射仅供当前动作使用。`text-boundary-motion.ts` 共享句段端点与常见缩写处理；PDF 缺映射时使用词元退路。异步准备后必须复查原选区端点和精确视图，保留后续输入。

`document-analysis/sections.ts` 只确定编号章节范围与字面匹配；`modules/reader-chapters/chapter-search.ts` 拥有范围选择与跳转，`ui/search-dialog.ts` 只提供可复用的查询／候选界面、IME 和生命周期。该流程保留原生 Find 和既有导航历史。区域结果用于定位段落，不能直接保存为字符高亮。

`modules/chapter-notes/index.ts` 按 ReaderSession 创建独立的 `chapter-notes` 实例，拥有章节整理、筛选、预览与显式保存，不由 Main 的 `notes` 模块转发。Toolkit 的 `sourceNoteEntries()` 读取精确 PDF 的公开批注 SDK、相关笔记及原生嵌图来源；HTML 在惰性 template 中解析，外部资源不插入活文档。模块内 `chapter-plan.ts` 用唯一原文或无歧义位置归属章节，跨章节／不确定内容保留待归类。对象副本按来源内容去重，独立批注保持身份。保存前重新读取来源内容，生成笔记用内容身份串行接纳并复用已有条目，手工修改不覆盖；新内容另建带时间的版本，生成结果不递归收集。

来源 Note 的幂等身份由 `platform/note-relations.ts` 定义，保留 `urn:zotero-neo:chapter-note:v1:<32 个小写十六进制字符>` 的原值，但存入 Zotero 标签，不写入任何关系谓词。新标记使用 `type: 1`，已有同名 `type: 0` 保留原类型；内部身份只按完整名称判断。`dc:relation` 保留真实来源 PDF 的 Zotero URI；写入方按该 URI 查找相关 Note，再核对身份标签、文库和所属条目。章节整理按身份标签排除生成结果。标记随 Note 同步，不受原生笔记编辑器的 HTML 规范化影响；用户边界见[来源笔记的内部标记](NOTE_GUIDE.md#来源笔记的内部标记)。

读取已有图表摘录时，`src/toolkit/main/source-notes.ts` 为本次读取延迟创建一个无浏览上下文的 HTML 文档，在其 `template.content` 中解析 Zotero 原生笔记 HTML。主窗口是 XHTML，不能直接使用其片段解析器；模板内容不插入活文档。解析后仍逐张核对来源 PDF URI、页内位置和嵌图附件归属，坏图片只隔离自身，生成 Note 在解析前排除。

启动在数据库初始化后扫描所有文库及回收站，仅迁移 Note 上符合完整身份格式的旧 `dc:relation` 对象。迁移通过公开 `addTag`、`removeRelation` 和 `saveTx` 提交，保留正文、条目身份、修改时间、其他关系及已有同名人工标签类型，并正常标记待同步。只读文库不绕过权限，数量写入诊断日志；来源读取时可在恢复写权限后完成单向迁移，也处理启动后到达的旧数据。启动和来源读取按 Note 合并在途保存；早期 Main 注入不等待数据库，迁移较晚完成也不能复活已关闭的控制器。

`toolkit/main/managed-tags/` 按附加组件寿命保护内部标记：通过 `platform/chrome-windows.ts` 观察 Main、独立 Reader 和 Note 等顶层窗口，按精确 Document 管理标签框、原生选择器和标签补全输入。选择器投影最终 React 候选，包含仅有颜色设置的合成条目；补全只把 `fieldName: 'tag'` 的控件路由到独立原生代理。普通业务候选按名称去重，不显示手动／自动区别；底层类型和原生普通标签偏好不变。

保护不覆盖或过滤 `Item.getTags()`、`hasTag()`、同步序列化等数据读取。标签框只投影可见行和计数，“移除全部”提交原有内部记录而不是删除后重加；全库写入口按名称排除内部 ID，自动清理保留原生类型过滤。旧的内部标签筛选条件在接管时清除，普通筛选保留。Gecko 补全控制器跨窗口共享，并在绑定输入时缓存提供器；路由切换需核对原生输入代理，只重绑当前输入，不能因关闭不活动窗口而停止另一窗口的搜索。停用按所有权恢复方法、控件与原生显示并注销代理，旧回调不得接管后继控制器。

`modules/reader-excerpts/object-excerpts.ts` 拥有显式图表／公式摘录与预览接纳，复用共享文档快照、对象成员和原 PDF 渲染，不恢复一般文字 Capture，也不由 Select 构造或关闭。`ui/search-dialog.ts` 只负责可取消预览与显式动作；操作前重查来源和精确视图。Reader 解析固定 `SourceNoteTarget`，`operations/source-note.ts` 负责可编辑性、来源哈希、嵌图保存及失败时清理自有半成品；已接纳写入独立于 Reader 界面寿命。Toolkit 使用 Zotero 原生序列化保留区域来源，平台层负责安全表格 HTML、PNG 与多格式剪贴板。新笔记保留指向 PDF 的 `dc:relation`，不创建伪批注或修改既有笔记。

`reader-selection/body-selection.ts` 拥有会话级正文选择开关、显式异步准备与退休结果隔离；缓存键由 `document-analysis/settings.ts` 统一确定。PDF 的有效缓存及默认本地提取均不请求 SDT；Reading Mode 按需读取原生块并验证同一来源。`body-text.ts` 只决定正文接纳策略，Toolkit 的 `text-admission.ts` 将精确视图的 Text 映射为 PDF 来源矩形或 SDT 顶层块 ID，并安装可逆属性租约；业务代码不读取 PDF.js 或 SDT 私有 DOM。

正文选择排除 `excluded` 和非公式的 `auxiliary` 区域，未知来源保留可选。PDF 按文字 Range 的中心落入排除区域且水平覆盖至少 90% 分类（旋转 90° 的页边标签短轴允许字体行距，覆盖至少 70%），边缘容差 0.5 点；原生非图表文字优先采用 textMap 行墨迹框，避免粗框吞掉正文。明确正文覆盖优先于冲突排除，不扩大到对象分组包围框。Reading Mode 按真实原生块身份判断；非 SDT 布局只有在完整原生块的所有已知来源片段均被排除时接纳，部分或未知映射保留，本地 `sourceBlock` 不能冒充 SDT ID。复制和批注前由 `validateReaderSelection()` 重查精确租约、选区端点和文件身份，旧缓存／后端通知同步退休过滤。`user-select:none` 只在 Neo Select 样式租约内生效；复制保留布局序列化，批注另按接纳文字拆分连续 Range，所有片段必须完整映射，不能只过滤文本却保存包含图表的矩形。

`src/document-analysis/contracts.ts` 定义 `DocumentParser`、来源和版本化区域结果。`local.ts`、`native.ts`、`oxr.ts`、`mineru.ts` 各自提供适配；本地规则为默认，已保存的显式云端选择保留。`DocumentRegion` 保留格式、正文归属和区域锚点精度；布局框不提供字符级批注保证。本地规则处理数字 PDF，OCR、表格单元格和公式 LaTeX 不在其输出范围内。

`document-source.ts` 单独读取页面几何，不依赖 SDT。`toolkit/pdf-source.ts` 统一加载 Zotero 自带 PDF.js；`pdfSourceFigurePages()` 读取原始文字及实际绘图操作，并使用 Zotero 已安装的 `reader/pdf/web/wasm/` 解码资源。未配置该路径时，CCITT 内嵌图像可能使 Form 的后续绘图指令丢失；不另行安装或下载解码器。Chrome 侧不可见的 PDFPageProxy getter 仅在 Toolkit 内通过 `_pageInfo` 适配；共享 `geometry.ts` 负责云端坐标转换，缺页、重复页、非法尺寸和越界矩形拒绝接纳，不静默裁剪。

`pdf-figure-geometry.ts` 的 `pdfFigureGeometry()` 将字体度量、路径和图像单位方框经过 CTM 转为未旋转 PDF 用户坐标，不使用栅格像素尺寸当作页面尺寸。`clip`／`eoClip` 在路径被消费后生效，当前绘制仍使用旧裁剪；save／restore、Form 和 Group 保留各自裁剪范围，再与实际绘制包围框求交。Form 的 bbox 使用 Form 矩阵；Group 矩阵仅变换其裁剪 bbox，不重复施加到内容 CTM。空裁剪不产生图像，裁剪路径本身也不是绘制。原生文字提取不遵守这些裁剪，因此仅当某字体的所有已观测使用均受裁剪、且文字框与全部对应裁剪范围都不相交时，才移除该文字。共用未裁剪字体、未知字体和部分重叠保守保留，不按字号或文字渲染模式推测可见性。轴对齐包围框不是任意路径的逐像素可见性。

`local-rules/` 拥有题注、分栏、段落和视觉区域规则，使用独立本地身份。少线／无框表先由至少三行、两个稳定列起点的原生单元格识别，再合并正文；原生细线的 L／T 形表格骨架也须有单元格证据。完整算法面板须具有明确 Algorithm 编号与至少三行指令，不能仅凭边框豁免普通正文；小字号共享数学定义另需多算法引用、等式及相邻较高面板约束。图内标签按字符加权字号与最近无争用对象归属。复合面板先合并横向行，再比较整行边界连接纵向行，避免宽面板与分块面板无法组成一组。题注、正文和相邻对象限制扩张，竞争题注不按距离瓜分同一面板带。图形主体仍需实际绘制证据，不把题注附近的空白制造成主体。

`src/platform/document-analysis.ts` 封装文件快照和可取消 HTTP；日志与结果均排除请求体和凭据。`ReaderDocumentComparison` 拥有显式处理、对照与迟到结果隔离。本地模式打开时准备来源和缓存，单独点击读取才运行 SDT；本地解析使用本地适配器，其他后端保留独立原生对照。SDK 提取不可真正中止，云端取消也不承诺远端停止。表格 HTML 只作为纯文本展示，后端 HTML 和外部资源不会加载到界面。

`document-analysis/cache.ts` 定义 Neo 后端缓存、非秘密配置身份及完整校验；`platform/document-analysis-cache.ts` 使用 Zotero 文件 API 和 `IOUtils.move` 原子提交附件目录中的 `.zotero-neo-analysis-<配置摘要>.json`，不写链接 PDF 的外部源目录。每项配置保留最后一次成功结果，包含 PDF 哈希、页面几何、后端、适配器版本、已知模型版本和时间。本地键使用 `local-rules`、适配器代次 4 和规范化规则指纹；当前引擎／几何修订均为 2，规则或采集语义改变后不能复用旧身份。旧槽及绑定旧解析身份的纠错保留，不强行迁移。格式、区域种类、唯一身份和完整坐标均校验，限制 32 MiB／100000 区域；损坏视为未命中，不因此自动上传。

写入按目标串行，暂存后重查调用寿命与来源再原子替换；已开始的最终提交继续完成，即使界面已经关闭。缓存只保存 `ParsedDocument` 已知字段，读取后按当前算法重算图表关系；凭据、原始响应和派生分组均不保存。本地与云端的显式对照解析负责持久写入；普通 `readReaderDocument()` 按需提取只供会话使用，避免保存通知退休其调用方正在打开的界面。通知仍正常退休已有布局和纠错快照，并反映版本变化。原生 SDT 缓存继续由 Zotero 管理，PDF 内嵌缓存和跨设备同步不在此链路范围。

后续阶段后端应继续消费这些显式产物及来源坐标，原生 Reading Mode 继续使用真实映射，保持全局 SDT 缓存和 textMap 原样。当前尚未实现外部结构替换、跨后端布局／识别阶段编排和跨页图表关联。

`analyze.ts` 在解析后执行共享图表关联；`object-groups.ts` 消费规范区域，输出 caption 身份、成员 ID 和 `backend`／`geometry`／`caption-only`／`ambiguous` 状态。本地规则可提供已判断的成员关系，但 `backend` 只表示该关系来自适配器，不等于人工验证正确。`sourceBlock` 保存同一来源块的矩形及顺序，不能跨越无效块留下的缺口；本地块身份与 SDT 块身份严格分开。

几何关联使用 PDF 用户坐标：候选限于同页、同列的连通图片或表格，图片在图注上方，表格支持 caption 在上或在下；caption 间距上限 72 点，纵向子图连接间距上限 24 点，同列要求较窄水平区间至少 90% 重叠，比较容差 0.01 点。正文、其他纵向 caption 和不完整原生块阻断关联；图片内部已分类为辅助／排除的文字可成为成员。多个 caption 争用同一视觉区域时一起回退，避免遍历顺序决定归属。此规则不承诺模型级语义正确性。

定位使用成员的真实矩形集合，不制造覆盖空白、正文或双栏内容的联合锚点；相同几何只在传给宿主时去重。对照界面的区域与整组条目共享展示和定位入口，定位前沿用来源版本校验、精确视图接纳和跨 compartment 克隆。匹配的整组可以替换同顶部的原生 Table 书签，避免表格本体再次丢失。

MinerU 官方云端适配器通过 `DocumentParser` 接入相同对照、缓存和定位链路。它使用 v4 本地文件批量上传协议提交单篇 PDF，随后轮询并下载 ZIP；`transport.ts` 只定义 JSON 请求、原始上传、下载、归档 JSON 读取和等待能力，Gecko 实现在平台层。API Bearer Token 仅发送给官方 API，不转发到签名存储地址；Zotero.HTTP 会自动补 Content-Type，签名上传因此单独使用原始 XHR 发送二进制。归档只读取有界的 `layout.json`，不解压其他路径，临时文件在成功、失败和取消后清理。当前明确支持官方云端已验证的 `pdf_info` 布局协议，协议变化时拒绝结果，不把新版自部署 `docvortex.middle` 当成相同格式。生产者版本不是模型版本，因此 `modelRevision` 保留 null。

MinerU 的 table/image/chart 父对象归一化为成员区域上的 `sourceObject`，公共图表关联先保留该显式关系，不要求 caption 或编号成功，也不再按距离扩大它。显式关系保留模型原意，不代表语义已验证；密集表格中仍可能错配题注，因此独立区域定位始终保留。其他无显式对象的区域继续使用原几何关联。当前覆盖单篇 Reader 显式解析、状态进度、缓存复用、对照面板定位及常规图表导航／侧栏增强；批量准备／恢复由共享 Document Preparation 负责，正文过滤由 Reader Selection 消费缓存；外部 Reading Mode 与跨后端阶段编排仍不在此链路范围。

`reader/document-cache.ts` 的 `readReaderDocumentCache()` 仅读取所选后端的有效附件缓存；`readReaderDocument()` 在未命中时按所选策略准备。缓存读取不会上传或运行 SDT。`ReaderCaptionTargets` 消费该共享入口并保留来源守卫，纠错不可读时不会绕回未经修正的图表。目标携带稳定身份、显式类型和来源，类型不按缺失编号猜测，同页对象保持独立。原生标题由 `loadHeadings()` 单独准备，缓存图表无需等待原生全文分析。

缓存导航在使用前重查 PDF 版本、服务配置和 Reader 所有权；目标被替换后，旧侧栏选择随之失效。当前 Reader 的分析成功提交以及服务偏好变化会退休并按需重载已准备的图表目标。所有缓存和原生目标继续通过同一原生位置／导航历史能力跳转，PDF.js 滚动位置由宿主处理。

`src/modules/reader-figures/` 拥有图表查询、类型／整组筛选、裁图预览和确认；它依赖 Navigation 已成功启动，但只接收既有 caption 来源与定位端口。章节、图表和对象摘录各自持有缓存／服务失效订阅，订阅随各自作用域释放。精确视图、输入和唯一历史策略继续由 Reader Surface 提供。

`src/modules/document-preparation/controller.ts` 由 Addon 创建一次；`createDocumentPreparationModule()` 分别绑定 Main／Reader 的 `prepareDocuments`。服务返回绑定精确 presentation 的释放句柄，旧作用域退出时只退休自己的界面，后来的同窗口界面继续运行。应用级队列由应用持有；局部模块借用队列，显式开始、继续和停止、任务记录及缓存仍沿用原契约。实机核对 Main 目标与 Reader 附件分别解析、替换后关闭旧 Reader 时新界面仍在；真实上传及已接纳任务继续执行需单独使用受控数据验证。
