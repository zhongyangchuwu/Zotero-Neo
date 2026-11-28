# 开发指南

## 兼容范围与验证

当前 `manifest.json` 支持 Zotero `10.0.*`（`strict_min_version: 10.0`、`strict_max_version: 10.0.*`）。修改宿主接缝时，既要运行仓库验证，也要在 Zotero 中操作受影响的工作流。

需要 Node.js 24 和 npm。插件与 VitePress 文档站使用同一个仓库根目录，命令统一定义在根 `package.json`。先在该目录安装锁定依赖，再运行任一构建：

```bash
npm ci
```

如果 npm 12 以 `EALLOWGIT` 拒绝锁定的 Git 依赖，在同一根目录改用 `npm ci --allow-git=all --ignore-scripts`。这只影响本次共享依赖安装，不修改全局 npm 策略。

两种 XPI 构建入口都会调用 `npm run verify`，依次检查 Prettier、严格 TypeScript、Vitest、包构建与 XPI 成员。

固定 PDF 的来源清单和历次核验记录见[解析质量评测](internal/QUALITY_EVALUATION.md)。其中旧解析器、云端、缓存及捕获命令是历史证据，不能据此推断当前实现或工具仍可运行。评测分别记录解析正确率和实际任务成功率；处理完成不能代替这两项结果。

## 构建

在仓库根目录运行：

```bash
./tools/build.sh
```

Windows 可使用：

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

构建产出单个 `zotero-neo.xpi`，CI 上传该主包。

### 获取开发构建

在 [main 分支的 GitHub Actions 构建记录](https://github.com/zhongyangchuwu/Zotero-Neo/actions/workflows/build.yml?query=branch%3Amain)中选择成功的运行，从 **Artifacts** 下载 `zotero-neo-linux`，解压取得 `zotero-neo.xpi`。下载通常需要登录 GitHub，旧构建附件可能过期；产物名称不限制系统。日常安装请用[正式发布包](GETTING_STARTED.md#获取-xpi-安装包)。

### 发布小版本

稳定版按完整、可验收的用户改进发布；修复用补丁版本，新增能力或改变交互契约时提升次版本。每周保留一个发布窗口，有已验收内容才发布；严重回归及时修复，不把每个合并提交自动推给用户。正式版本号不得重复使用，也不得覆盖已公布的 XPI。

#### 准备候选

1. 在功能分支同步 `manifest.json`、`package.json` 和 `package-lock.json` 的版本。扩展 ID 与 `update_url` 保持不变，兼容范围只声明实际支持的 Zotero。
2. 构建确切候选，运行适用检查，并按[安装升级验收](internal/ACCEPTANCE.md#_3-安装和升级)验证持久包。记录源码提交、包 SHA-256、宿主版本和真实结果；热重载不代替升级。
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

仓库根目录也是 VitePress 文档站根目录，配置位于 `.vitepress/config.ts`，静态构建输出到 `.vitepress/dist/`。七篇日常用户文档位于 `docs/` 根目录；[内部归档](internal/README.md)不进用户侧边栏或搜索。GitHub 的 `README.md` 与站点首页 `index.md` 各有一处入口。中文文档规范见[文档编写规范](internal/DOCUMENTATION_AUTHORING.md)。

安装上述共享依赖后，在根目录运行：

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

编辑时使用 `docs:dev`。`docs:preview` 提供最近一次静态构建；重新构建后要重启预览服务，避免缓存的文件信息继续指向旧 HTML 或资源名。在 GitHub Pages 的 base 路径 `/Zotero-Neo/` 下检查构建结果。

仓库管理员需要将 Pages 构建来源设为 GitHub Actions。PR 只构建和检查站点，不发布；部署仅允许 `main`。文档站输出独立于 XPI 和插件运行时。

### Zotero 原生 React 界面

设置中心、Picker 和引用详情在实际 Zotero 窗口中使用静态打包的共享 React 界面。`src/platform/native-ui.ts` 按精确 Window／Document 管理运行时和视图，跨 compartment 只传递克隆的数据模型和显式命令；业务控制器继续负责输入、提交及异步工作。界面关闭时先卸载 React，再释放宿主节点。

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
- `assets/package/` 是 XPI 的静态骨架，包含运行时图标和偏好页；包内路径保持 `icons/*` 和 `content/*`。VitePress 不发布此目录。
- `assets/docs/media/` 保存文档站的截图、视频和字幕，发布路径为 `/media/`。只有这里的媒体会作为站点公共文件发布。
- `assets/ui-review/screenshots/` 保存实机评审截图、历史基线与设计稿；索引和采集记录见 `assets/ui-review/README.md`。它们不发布到文档站，也不进入 XPI。


### 静态 React 与加密 bundle

`vendor/react/` 固定 `react@19.3.1`、`react-dom@19.3.1` 和 `scheduler@0.28.0`，完整闭包记录在对应的 lockfile 和 provenance 文件中。共享 React bundle 供设置中心、Picker 和引用详情等界面使用；age 加密使用静态打包的 Worker。

XPI 收录项目 `LICENSE`、`licenses/fuzzysort-LICENSE`，以及 React 和 age-encryption 各自的 `*-NOTICE`、`*-provenance.json`。版本、完整性和上游来源记录在各 vendor 目录；`NOTICE` 保留许可证文本。可执行依赖静态进入生成的 bundle，不在运行时安装或下载，也不以原始 vendor 包作为单独的 XPI 成员。`tools/check-package.mjs` 对成员清单和打包后的 notice/provenance 内容作精确校验。

### 配置迁移格式与加密边界

用户入口与操作见[设置快照](SETTINGS_GUIDE.md#导出和恢复配置)。`src/settings-snapshots/` 持有版本化语义文档、服务、模板目录、托管发布和展示控制器。Zotero／Neo 使用内置验证模板；其他插件只能由本机审核过的字段模板生成偏好适配器，不是从快照装载执行代码的插件 SDK。常规发现只读取由 Toolkit 核对归属的静态标记和默认值声明。对短键名，显式扫描由 Zotero 加载目标插件的原生设置页，Toolkit 仅取已绑定的完整键名。短声明、静态控件、与插件 ID 对应且无冲突的命名空间、默认类型和原生绑定需相互印证；扫描不读取字段值，不向控件发送输入。无原生绑定的动态配置与代码型字段仍不支持。

模板按确切插件 ID 的稳定摘要独立存储，记录插件版本、声明来源与修订。导入模板始终是草稿，便携性和敏感性必须在本机确认；版本、来源或模板变化使旧审核失效。原生、Neo 私有及共享命名空间有字段归属保护，不能仅凭前缀把某个插件归入全部 `extensions.zotero.*`。模板最多 512 KiB，只保存受限字段元数据，不携带配置值或执行逻辑。

v1 明文封套标识为 `format: zotero-neo-settings`、`schemaVersion: 1`，包含 `createdAt`、`producer`、`zoteroVersion` 和 `sections`。每个 section 记录 `adapterID`、`schemaVersion`、`sourceVersion` 与 `entries`；entry 的 `state` 为 `{ kind: set, value: … }` 或 `{ kind: reset }`。缺席字段不表示恢复默认，`false`、`0` 和空字符串不丢弃。文件不决定执行代码、字段秘密属性、标签或可执行适配器；未知封套版本拒绝，未知适配器报告并跳过。

容器能力由共享 `SETTINGS_CONTAINERS` 登记：默认 age 加密；显式 JSON 明文禁止包含已知秘密。导入按实际内容识别，不信任扩展名或文件自报的秘密属性。`content/settings-snapshots-crypto.js` 是静态打包的 classic worker，兼容既有 age 文件。密码模式由固定 age 库完成：scrypt factor 18，约 256 MiB KDF 内存，不自建密码学协议、用户密钥文件或运行时依赖。完整认证后才解析 UTF-8／语义格式；16 KiB 未认证 header 入场上限先于库的 stanza 分配，单 scrypt identity 准入再限制 KDF 成本。技术上限为 32 MiB UTF-8 明文、20,000 entries，单字符串最多 2,097,152 个 UTF-16 code units；密文限制另计 armor／STREAM 开销，不是 1 MB 产品目标。

已安装 XPI 中的 worker 通过现有 `chrome://zotero-neo-ui/content/settings-snapshots-crypto.js` 映射加载，不把 `jar:` 资源根直接交给 `Worker`；注册和退休沿用原生 UI 的插件级生命周期。

服务在 profile 范围串行操作。预览计划由服务签发；恢复前复查原值和来源字节，核对适配器身份，适配器在实际写入前再核对当前性及原值。保留旧值通过原有导出完成，与恢复写入分离；确认恢复时不创建文件。导出使用系统文件选择器授予当次覆盖权限，文件同目录暂存并在发布后读回。部分提交按回执保留，不宣称跨适配器回滚。密码与明文只限操作内存；React 模型只接收脱敏预览，worker 在取消、失效、窗口退出和销毁时退休。JavaScript 字符串释放不等于可证明的内存清零。

托管层每个目标仅发布一个插件，目标由明确选择的文库、分类及可见存储附件承载。绑定和内容指纹只在本机 profile 保存，不导出、不保存密码。JSON 无秘密时可约每 5 分钟检查本机语义变化，仅变化时自动写入；比较忽略 `createdAt`，实际写入的快照保留本次生成时间。本机绑定的 `updatedAt` 在成功写入时刷新。age 禁止自动更新。写入核对稳定文库／条目身份与已知字节摘要，保留原生已同步 hash／mtime，通过原生待上传状态交还文件同步。仅元数据变化且字节一致时跟随原生改名／移动；内容冲突、删除、未下载或只读时暂停，不自动覆盖、重建或应用远端配置。失败后保留可恢复文件并报告，不将文件已发布但绑定未保存谎报为成功。实际跨设备传输仍须独立验证 Zotero 数据同步与文件同步。

## 运行时架构

交互模型与当前功能所有权见[架构](internal/ARCHITECTURE.md)。Neo 使用严格 TypeScript，通过打包生成 Gecko Bootstrap 运行时；内部 Toolkit 不新增运行时依赖。

`src/toolkit/main/private-types.ts` 和 `src/toolkit/reader/private-types.ts` 将宿主结构类型限制在 Toolkit 内。`src/toolkit/index.ts` 汇总 Main/Reader 入口；Main 包含 Note-pane 能力，无单独 Note Toolkit。功能代码使用这些能力入口，原生结构类型和私有实现留在 Toolkit 内。没有等价公开 API 时，保留契约后必需的私有能力。

Zotero 管理 Items、视图、标签页、Notes 和 Reader 状态。功能负责目标选择、基数、确认与反馈；Toolkit 负责宿主查找、原生协议、DOM 接缝、跨 compartment 载荷和资源退休。公开 API 能保留行为时优先使用；必要的私有依赖即使经过包装，仍属于私有能力。公开条目 API 和 `src/platform/zotero-items.ts` 可以直接使用，无需逐个套一对一包装。

学术来源及应用用例的依赖方向见[架构：引用增强](internal/ARCHITECTURE.md#引用增强)。`src/scholarly/` 是共享查询、来源适配、限速与缓存的规范位置；`src/metadata-review/` 管理差异和审阅界面，文库写入属于 `src/operations/metadata.ts`。成果封套、各 payload、原生附件与旧旁路迁移见[成果附件格式](internal/ARTIFACT_FORMAT.md)；缓存不能代替审阅回执。

元数据审阅的双端同步、按需下载与离线分支已有实测；外部 harness 的附件读取／导入仍需用实际 MCP 工具单独核验。具体范围与证据见[成果附件格式](internal/ARTIFACT_FORMAT.md#跨设备可用性)，不以本机保存或复制附件替代同步验收。

**来源选择与社区参考**

本轮公开样本探测中，Crossref、arXiv、INSPIRE 和 OpenAlex 返回 HTTP 200；Semantic Scholar 匿名精确查询返回 429，没有自动重试。生产接入 Semantic Scholar、arXiv、Crossref 和 INSPIRE；OpenAlex 仅作调研，尚未接入。免费公开来源已覆盖当前候选、发表字段和 INSPIRE 引用键需求，没有登录或付费试用。认证／付费访问的额度与可靠性未验证；只有出现实际覆盖或吞吐缺口时才另行确认授权和费用。OpenAlex 的密钥、预算与收费以[官方文档](https://help.openalex.org/api/authentication/)为准，不把调研成功当作已配置订阅。

| 社区项目 | 本轮参考及取舍 |
| --- | --- |
| [Zotero INSPIRE v4.1.2](https://github.com/fkguo/zotero-inspire/releases/tag/v4.1.2) | 参考发表检查和 TeX-key／BibTeX 工作流；Neo 直接查询公开 INSPIRE API，不依赖该插件或其本地读 token。 |
| [arXiv Workflow v0.4.2](https://github.com/AllanChain/zotero-arxiv-workflow/releases/tag/v0.4.2) | 参考多来源发表关联；不自动合并条目、替换 PDF 或搬迁批注。 |
| [Zotero Metadata Refresh v0.5.0](https://github.com/ZhiboRao/zotero-meta-refresh/releases/tag/v0.5.0) | 参考逐字段预览及明确确认；沿用 Neo Operations 的写入边界，不引入插件依赖。 |
| [Better BibTeX](https://retorque.re/zotero-better-bibtex/citing/index.html) | 保留既有可选桥接和 Zotero 原生 Citation Key；INSPIRE `texkeys[0]` 是来源建议，不替代本地生成规则。 |

这些项目仅作公开文档和源码调研，未安装试用，也未复制其代码。来源字段和版本日期可能不同；不能因多个服务聚合了同一条记录，就把它们当作独立权威证明。

按位置定位的标题和图表跳转显式采用原生 `behavior: 'instant'`：宿主 `navigate()` 的 Promise 不等待相邻页平滑滚动完成，不能据此认为已到达目标。连续 `j/k` 滚动仍沿用原有平滑滚动策略。

### 本地规则内核

`src/document-analysis/local-rules/` 是纯 TypeScript 内核：输入未旋转 PDF 用户坐标中的页面文字与绘图几何，返回纯数据区域；不读取 Zotero、DOM、偏好或磁盘。题注识别、正文阻隔、组件连接、图表关联和段落构建使用固定默认规则，保留无歧义证据要求，不按论文或题号特判。对外的 TypeScript 入口和规则类型仍位于 `index.ts`；Reader 不再读取高级 JSON 规则偏好。

`src/reader/local-layout.ts` 按 ReaderSession 管理页面和图表结果。首次图表导航筛查全文文字，仅对题注候选页读取绘图指令并执行本地规则；打开侧栏不启动扫描，图表路径不调用 Zotero 全文 SDT。正文选择只准备可见页；Reading Mode 复用已加载视图能明确映射到 PDF 的可见文本块，不启动全文解析。页面缓存有界，图表目标在会话内复用，Reader 关闭或插件停用时释放；不写入附件目录。来源或视图退休时，异步结果不能应用到后继视图。

历史本地规则回放和质量数据保留在评测记录中，不把旧工具链或旧缓存身份当作当前运行时契约。

### 模块基座与启动配置

`src/core/module-host.ts` 提供按 MainWindow 或 ReaderSession 隔离的模块宿主及独立模块作用域。同步激活失败会释放部分资源并保留原错误；动作贡献按 `(BindingContext, ActionId)` 唯一登记，返回有类型的调用入口。退出先使全部回调失效，再完成其余释放，即使某次清理失败也不会中断其他模块。

`src/modules/index.ts` 是包含 13 个模块的静态内置清单，启动校验 ID、依赖图和精确上下文贡献；可选增强为 `reader-hints`、`extensions` 和 `references`。

MainWindow 组合标签、扩展、分类、工作集、Library、Notes、Workspace 和配置迁移入口。ReaderSession 组合导航、选择、批注、hints、引用增强、独立 Library citekey 贡献及 Workspace 分屏/焦点。各模块仅接收具名端口；Operations 与 Toolkit 保持各自负责方。

`src/core/module-runtime.ts` 根据三项可选请求应用增强；`reader-hints`、`extensions` 与 `references` 默认开启。`src/platform/module-startup.ts` 在 Zotero 应用对象上保留请求的 JSON 快照，因此 Neo 热重载不会应用新请求，完全退出并重启 Zotero 后才会应用。旧启动快照缺少可选字段时，已应用值按关闭处理；旧核心键 `extensions.zotero-neo.modules.<core>.enabled=false` 不会关闭核心功能。

实机核对模块配置时使用专用 profile 和自有数据，确认三项可选请求保存、Neo 热重载与 Zotero 完全退出／重启的差异。默认引用增强已启用，本地分析和文库查找不发起元数据请求，只有用户明确查询才访问来源。恢复默认后 `reader-hints`、`extensions`、`references` 开启；关闭全部三项可选增强后核心模块仍须可用，旧核心 `false` 偏好无效，恢复默认不改变行为偏好（包括 `noteEditor.enabled`）。故障只注入自有宿主并恢复原方法；回读自有数据与偏好，确认进程状态。完整用户状态说明见[模块设置](SETTINGS_GUIDE.md#开关可选功能)。

结构不可用的绑定在 matcher/count/前缀、Guide 和 Palette 前过滤，不能改写保存的用户绑定或全局删除同名动作。Navigation 的 marks/侧栏获取必须在激活事务内，Base 启动失败释放未完成 session；失败实例不由定时重扫循环重建。模块清理错误通过显式 `CleanupFailure` 收集，不登记到会吞异常的通用清理层。

工作集拥有 SelectionStore、Visual 范围及 Selection Panel。Main Surface 继续初始化和取消原生 Cursor/多目标，持有共享行渲染，并向模块注入刷新、主题和现有 Reveal 导航端口。目标解析与 Library Trash 接收明确 Selection 端口；来源为空或退休后沿用当前目标。共享导航通过局部界面端口捕获原面板，避免读取已退休的 Selection 或 session 的 Selection Panel 状态。

Library 按 Main session 拥有 Local Find 查询/界面及最近回收批次。可见行查找保留原生 View；条目选择器显式注入 Library 候选，范围与个人库回退保持原义。Main 保留目标策略、焦点和唯一历史；历史通过 `MainViewOperations` 使用原生查询/标签过滤能力，Workspace 和工作集 Reveal 独立于 Library 动作。Reader citekey 仍可直接处理当前 Reader 条目。

共享 Picker 使用实际 Main session 的当前性端口；关闭先退休并清空运行时引用，再逐项释放资源。清理重入、异常或晚到的获取只能处理本次界面，不能关闭替换 Picker 或恢复旧焦点。Local Find 的主题句柄归单次界面，长期模块作用域不累计保留已关闭 DOM。

Notes 按窗口拥有候选、选择后的打开编排及可选 Vim 编辑的模式、寄存器和 caret 样式。`NoteSurfaceRuntime` 只保留精确编辑器身份、输入 runtime 和退休代次；Surface 继续决定原生/IME 输入、count、前缀及焦点。Note 普通动作和 Insert 退出登记到原上下文；候选必须显式传给 Picker。共享导航提供选择完成后的宿主委托，沿用现有历史栈。

输入缓冲和计时器由 `InputRuntime` 管理，Surface 负责原生输入／IME 仲裁与状态反馈；`PrefixGuideRuntime` 根据精确上下文和当前有效绑定投影后续键，支持 Space 以外的前缀。`keyGuideTimeout()` 只为不带独立动作的命令前缀提供 5 秒阅读时间，歧义短动作继续使用 matcher 超时，数字计数沿用现有解析器和指南时序。Escape 清除整条待完成输入，退格保留尚未删去的计数，并使被取消的动作计时器失效。

Reader 导航拥有页面/滚动/缩放/搜索、语义与批注位置遍历、marks、按需 captions、原生侧栏增强及平滑滚动状态，登记 Normal 与四个侧栏上下文的实际处理器。Surface 保留输入和精确视图、CurrentTarget、共享导航历史与 Toolkit 导航宿主；Workspace 复用该宿主处理分屏与方向焦点。marks 保存完成后重查发起交互，不能覆盖新的输入或界面状态；销毁视图时先清空 RAF/完成回调的所有权，再尝试原生取消，即使取消失败也不保留旧视图或阻塞下一次滚动。

Reader 选择拥有 DOM 范围、文本 motions、Flash 输入/标签、复制/搜索及动作面板；Surface 仍保留模式、输入仲裁、精确视图和共享滚动。交互同时捕获 ReaderView 与 Document，新的动作/原生选择接纳前先退休替换视图；旧输入、可用性判断和晚到结果不能操作后继界面。临时样式、anchor、主题与监听均随所属交互释放，具体边界见[架构](internal/ARCHITECTURE.md#reader)。

Reader 批注模块拥有创建/删除/改色/过滤/复制及评论编辑，Surface 保留 CurrentTarget、NativeInput 和混合按键路由。评论输入、系统按键、主题、popup guard 与计时器属于精确 ReaderView / Document；退休先释放界面，已接纳的保存可以完成，但不抢回后继界面的焦点。

批注改动需用专用 profile 的自有附件验证 Select 高亮、下划线、Add note、Normal 改色/过滤/删除确认，以及评论输入实际挂载和聚焦、Escape 保存、两秒自动保存和数据库回读。另查 `i` 的 NativeInput 偏好分支、无批注时 `zb` 的滚动回退、自动保存前换标签页仍保存最终评论，以及晚到保存不覆盖后继 Reader 或 Settings 焦点。程序化设置 DOM 选择后应让 selectionchange 与渲染帧完成，再发送下一次按键；原生模型字段已变不代表 `saveTx()` 已提交。

Workspace 按 MainWindow 拥有标签页来源、确认与 Reader/Note 的 Show in Library，ReaderSession 拥有分屏切换和方向焦点。基座保留唯一历史、原生标签页重扫、精确视图发现、NativeInput 以及 Main/Note 通用面板焦点（含 Note Insert）。实机需确认三个 Surface 的标签页选择、关闭后的历史重开、主次分屏实际焦点及 Palette 路由；按键只有实际完成方向焦点移动才消费。Picker 应等待输入框实际聚焦后再发送 Enter；验证独立 Main 行选择时从 `itemsView.getSelectedItems(true)` 回读，`ZoteroPane.getSelectedItems(true)` 在 Reader 活跃时可能投影 Reader 条目，不能据此认定底层行选择相同。

### 宿主能力 Toolkit

| 能力 | Toolkit 负责方 | 边界与原因 |
| --- | --- | --- |
| Main 条目、标签页、Note 上下文与过滤 | `src/toolkit/main/host.ts` | 提供宿主事实与操作，不选择 Surface 目标。只在恰好一个原生 Scope 时调用 `getSelectedCollection()`；零个或多个 Scope 先用外层复数 API，再回退到原生 tree 的复数 API。分离的 Scope Cursor 不代替已选分类。 |
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
| Zotero 结构化文档块 | `src/toolkit/reader/structured-document.ts` | 原生冷处理可能覆盖整个 PDF 且无法取消；引用增强等独立消费者按其自身条件使用，图表导航不请求全文 SDT。 |
| Reader 引用快照 | `src/toolkit/reader/references.ts`、`reference-contracts.ts` | 读取 Zotero 原生 PDF 全文 overlay，包括未渲染页面；快照捕获精确 PDF、presentation、Window、Document 与已加载 PDF 字节指纹，异步阶段持续验证来源。SDT 块只有在 `metadata.source.hash` 与该 PDF 指纹相同时才参与补充或上下文映射。唯一、明确的 `References`/`Bibliography` 标题下，可完整解析的连续编号条目补入未被原生 overlay 覆盖的条目；引用上下文来自原 PDF 字符或唯一映射的原文段落。不完整时界面标记 `partial` 并显示遗漏警告；零条识别不是未引用的证明。只返回不含 SDK/DOM 句柄的数据和来源守卫；不使用 OCR，也不声称对所有 PDF 均能完整识别。 |
| 原生引文预览、右键与工具栏挂载 | `src/toolkit/reader/reference-interactions.ts`、`reference-interaction-contracts.ts` | 在各 presentation 的原生预览行内挂载控件，以原文及位置核对行归属；在 `createViewContextMenu` 同步追加菜单，工具栏使用既有 `custom-sections`。DOM observer 处理挂载与替换，不以常驻轮询扫描预览。原生引用逐项投影到插件 realm，避免把特权对象交给 content 数组回调。交互当前性与来源当前性分开，关闭原预览后仍保留精确来源；旧菜单不能在窗格或标签页切换后重获目标。 |

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

标签过滤读取当前渲染 Scope 的完整行结果，包括原生多行选择，不扩大到全库。分类动作目标与确认见[交互模型](internal/INTERACTION_MODEL.md#动作目标契约)。

## 诊断

Bootstrap 将诊断写入 profile 下的 `zotero-neo-startup.log`，并通过 `Zotero.debug()` 报告运行时消息。`npm run dev:status` 显示日志路径。

## Reader 选择 API

`Zotero.Neo.reader.getSelection()` 返回当前 `ReaderSelectionContext` 或 `null`；`Zotero.Neo.reader.registerSelectionAction(action)` 注册扩展动作并返回 disposer。API 由 `src/addon.ts` 公开、`src/core/contracts.ts` 定义类型；`src/modules/reader-selection/` 负责选择上下文和动作运行时，`registry.ts` 的定义随应用存活，关闭一个 Reader 后仍保留。disposer 只删除自己的注册，同 ID 的后继注册受保护；选择模块退休后，旧上下文和回调均不可用。集成方继续使用原接口，Reader session 和 PDF.js 私有对象留在内部。

## 原生阅读视图与本地布局

`src/toolkit/reader/presentation.ts` 解析当前显示视图：分屏各自使用实际可见呈现。`ReaderViewLifecycle` 按精确 Window / Document 附着和释放监听器及来源映射租约；Reading Mode 沿用 Normal／Select 及既有绑定上下文。

`src/toolkit/reader/text-source.ts` 返回实际 Text 节点，词元、Flash、选择范围和视觉行移动共用业务实现。重排文本的视觉行来自 Range 客户矩形，段落来自原生 HTML 结构；`selection-geometry.ts` 将重排选区交给原生 SDT 映射，保留 Zotero 的 sortIndex、pageLabel 和 PDF 几何。图像裁图区不被冒充为可选文字。

图表跳转由 `reader-navigation` 消费会话本地布局。首次 `[f` / `]f`、`[t` / `]t` 或显式图表目标请求读取全文文字，宽筛题注候选页，仅对候选页读取绘图指令并调用固定默认的本地规则。没有题注的图不会成为目标；这是候选定位，不是完整图表识别。原生大纲独立于图表准备。正文选择的可见页处理是另一条按需路径，不启动图表全文扫描。

`src/toolkit/pdf-source.ts` 使用 Zotero 自带 PDF.js 和其 `reader/pdf/web/wasm/` 解码资源；`pdf-figure-geometry.ts` 将路径、图像与字体度量经 CTM 转为未旋转 PDF 用户坐标，并处理绘制裁剪与 Form／Group。页面与图表结果只保存在当前 Reader 会话内，关闭会话或停用插件时释放，不写附件目录缓存。异步工作必须复查 PDF 来源、精确视图和作用域，不能向替换视图发布结果。

`reader-selection/body-selection.ts` 拥有默认关闭的会话级 `<Space>rb` 开关，仅按需准备当前可见 PDF 页；`body-text.ts` 决定正文接纳，Toolkit 的 `text-admission.ts` 管理精确视图的可逆过滤租约。它只影响 Neo Select，普通鼠标拖选及 Zotero 原生复制、高亮路径不变。Reading Mode 中，完整的可见原生文本块须经当前视图同步、明确地映射到单个源 PDF 页面，且本地几何确认应排除，才会被过滤；不完整、有歧义或跨页的映射保留可选。句段扩展在 Reading Mode 使用原生 DOM 段落；这两项操作都不触发 SDT 冷读取。PDF 视图的句段扩展优先使用已有内存页面结果，无可靠映射时回退到原生段落或词元；异步准备后重新检查选区端点和精确视图。

不再提供文档准备、解析对照、图表筛选、对象摘录、章节笔记或章节内查找；MinerU／OXR 后端、附件目录解析缓存、规则纠错及相关配置均已移除。旧 `documentAnalysis.*` 偏好、已移除命令绑定和旧备份中的相关字段被忽略，不对既有 Zotero 笔记、标签或缓存做迁移写入。引用增强自己的元数据缓存和原生引用能力不属于上述移除范围。
