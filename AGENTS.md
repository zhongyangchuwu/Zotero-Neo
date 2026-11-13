# Zotero Neo 代理指南

## 项目概览

Zotero Neo 是面向最新稳定版 Zotero 的插件。它通过 Firefox/Gecko Bootstrap API，为 Zotero 阅读器和主窗口提供受 Neovim/LazyVim 启发、以键盘操作为主的交互层。运行时源码使用严格 TypeScript，由 esbuild 打包为普通 JavaScript，再直接打入 XPI。

## 构建、安装与测试

### 构建插件

```bash
./tools/build.sh
```

Windows（无需 bash）可运行：`powershell -ExecutionPolicy Bypass -File tools\build.ps1`

生成 `zotero-neo.xpi`，这是一个确定性归档，包含生成的 JavaScript bundle、AI 问答实验工具窗外壳、偏好页标记、manifest 和图标、项目 `LICENSE`，以及第三方声明和来源记录：`licenses/fuzzysort-LICENSE`、`licenses/ai-sdk-NOTICE`、`licenses/ai-sdk-provenance.json`、`licenses/react-NOTICE` 和 `licenses/react-provenance.json`。

### 安装

1. 打开 Zotero → Tools → Add-ons → Gear icon → “Install Add-on From File...”。
2. 选择 `zotero-neo.xpi`。
3. 重启 Zotero。

### 调试

- 使用 `Zotero.debug('[ZoteroNeo] message')` 记录日志；输出会显示在 Zotero 的 Error Console（Help → Developer → Developer Options → Error Console）中。
- 启动和 Reader 注入状态变化也会写入 Zotero profile 中的 `zotero-neo-startup.log`。

### 测试

`npm run verify` 会运行格式检查、严格 TypeScript 检查、Vitest 契约测试、esbuild 包构建和 XPI 成员检查。GitHub Actions 会运行仓库 CI 工作流；应检查当前工作流定义，不要假定固定的操作系统矩阵。

### 本地开发与 PR 交付

本地开发默认使用功能分支和 PR。完成相关本地检查及必要的 Zotero 界面验证后，等待 PR 的 CI 通过，核对最新 HEAD 并合并，再向用户汇报已合并的结果。除非用户明确要求只准备 PR，不要停在“PR 已创建”或再次等待合并授权。验证失败、合并冲突或需要用户取舍时，先解决可达问题，再说明具体阻碍；不要绕过检查合并。

### 通过 GitHub MCP 开发

通过 GitHub MCP 而不是本地 checkout 进行开发时，仓库写入、工作流执行和 CI 诊断都必须明确进行，并使用 SHA 作为保护条件。

1. **写入前先读取。**
   - 更新文件前，读取当前 PR/base/head 状态和目标文件的确切 SHA。
   - 在分支上进行功能开发；避免直接写入 `main`。
   - GitHub 操作支持时，使用当前 PR head SHA 作为乐观并发保护。

2. **使用 GitHub Actions MCP 操作工作流。**
   - 根据 CI 失败修改代码前，先检查工作流运行、job 和日志。`Build XPI` 步骤失败时，实际原因可能是 `npm run verify` 的格式、类型检查、测试或打包失败。
   - 即使 Linux 和 Windows job 都在相同外层步骤失败，也不要直接推断为平台专属问题；先读内部日志。

3. **使用仓库 Format 工作流，不要通过 MCP 手动格式化。**
   - 规范格式化工作流是 `.github/workflows/format.yml`（`Format branch`）。
   - 从 `main` 分发工作流定义，并传入：
     - `target_ref`：同一仓库中的功能分支；
     - `expected_sha`：该分支的**当前** HEAD。
   - 工作流运行 `npm run format`、校验差异、提交 `style: apply prettier`，并推回目标分支。
   - 读取 SHA 后若有提交进入该分支，先刷新 head，再用新的 `expected_sha` 分发；工作流会有意拒绝过期 SHA。
   - 不要为了修复格式错误而临时在 `tools/build.sh` 中加入 Prettier 写入、诊断用 `git diff` 或无条件 `exit 1`。使用专用格式化工作流或专用诊断工作流。

4. **保持 CI 拓扑一致。**
   - 如果在 `build.yml` 中临时停用某个平台 job，同一更改也要更新下游 `needs` 列表。
   - 将此类操作视为 CI 配置更改，不要据此认定被停用的平台导致了无关失败。

5. **谨慎处理 PR 分支重写。**
   - 将一个开放 PR 分支强制重置到 base，可能会因分支暂时不含提交而使 GitHub 自动关闭 PR。
   - 条件允许时优先正常 rebase/update。如果确需重置，应恢复功能提交，并在继续前确认 PR 已重新打开。

6. **只从已验证的 head 合并。**
   - Formatter/CI 产生新提交后，重新读取 PR 的可合并状态和最新 head SHA。
   - 要求相关 CI job 通过，并在合并时使用 `expected_head_sha`，避免误合并并发推送。

该工作流是 ChatGPT/GitHub-MCP 修改仓库时的参考路径。优先使用现有仓库工作流和范围明确的 GitHub 操作，不要临时修改构建脚本。

Zotero GUI 行为仍需手动验证：

1. 按 `docs/DEVELOPMENT.md` 中的说明，通过 `npm run dev:setup` 配置专用 profile，再用 `npm run dev:start` 启动。
2. 普通本地迭代时，运行 `npm run dev`，通过 Firefox RDP 重建并热重载 Neo，无需重启 Zotero。
3. 操作发生变化的 Reader、主窗口或偏好界面。
4. 当打包或生命周期发生变化时，另外使用打包后的 XPI 执行安装／更新测试。

## 代码风格

### 缩进

使用 **2 个空格**缩进，不要使用制表符。

### 源码布局

```text
assets/
  branding/                仅仓库使用的源 artwork 和 README banner
  package/                 复制到 build/addon 的静态 XPI 骨架
    content/preferences/   偏好页 XHTML
    icons/                 七种尺寸的透明运行时 PNG 图标
src/
  addon.ts                 组合后的插件控制器
  i18n/                    共享应用本地化、动作标签和语言目录
  bootstrap.ts             Gecko Bootstrap 全局生命周期入口
  input/                   规范绑定、动作和匹配器
  modules/                 内置能力模块；可选模块 `reader-hints`、`extensions`、`translation`、`references`、`ai-qa`、`tab-enhancements`
  reader/                  Reader 生命周期与功能
  toolkit/                 内部 Main（含 Note pane）及 Reader 宿主能力，包含 Main 标签页宿主接缝
  platform/                窄范围的宿主边界适配器
vendor/                    固定版本且带许可证的第三方源码／构建快照
```

### TypeScript 约定

- 使用严格 TypeScript；仅用于类型的依赖使用 `import type`。
- 打包后的运行时不得动态依赖 npm/package manager。开发依赖仅限构建／测试工具和类型声明。经批准的运行时库（包括 AI SDK 与本地 React UI）可以作为固定版本、经过审计且自包含的 vendor 构建快照打包。锁定完整依赖闭包、上游来源和完整性信息，保留许可证文本，并将所有可执行代码静态打入 XPI；运行时不得安装或获取包、CDN 脚本或辅助服务。
- 将 Gecko 全局对象保护放在具名 platform adapter 中，将 Zotero SDK/DOM 私有接缝留在 `src/toolkit/`。业务模块导入公开 Toolkit 入口，不导入私有实现类型或原始 pane/tree/PDF/editor 对象。优先采用语义等价的文档化 API；必要的私有能力应由能力契约封装。目标、模式、工作流和历史策略归业务负责方。Bootstrap 全局对象不提供 DOM 构造器；不要使用跨 compartment 的 `instanceof` 检查。
- 使用分号和 2 空格缩进。格式以 Prettier 为准。
- 方法和变量使用 `camelCase`；内部字段使用原生 `#private` 字段。常量使用 `SCREAMING_SNAKE_CASE`。
- 规范绑定示例为 `reader-normal:j`、`reader-select:zy` 和 `main-normal:<Space>ff`；Space 是 Reader/Main/Note 共用的默认语义命令根。
- 不要混淆已保存／显示的按键记法和运行时事件 token。`keyString(event)` 当前返回小写命名键 token，例如 `escape`、`enter`、`home` 和 `arrowdown`；Neovim 形式的 `<Esc>`、`<Enter>` 属于绑定语法／显示层。处理原始按键事件时，参照 Plugin Manager 等现有运行时调用方。

### 格式

- 宿主格式没有特殊要求时使用单引号。
- Prettier 负责格式化所有 TypeScript、测试和构建工具源码；不要手动调整格式。
- 保持代码行易读；宿主边界变得复杂时，提取具名 helper。

### 错误处理

- 预期内或非关键的宿主错误可以使用空 catch。
- 使用共享 logger 通过 `Zotero.debug()` 记录意外错误。

### 状态管理

- `ReaderController` 使用以 `instanceID` 为键的 `Map` 管理 Reader session。
- `MainWindowController` 使用以 window 为键的 `Map` 管理 MainWindow session。
- Session 清理负责监听器、定时器、observer、DOM 和宿主 patch。
- Reader Surface mode 仅为 `normal | visual`。`ReaderCommentEditor` 和 References panel 向 Reader controller 报告精确视图的文本焦点；共享 `featureInputFocused` 谓词连接 Toolkit 的 `_textAnnotationFocused` 接缝。`ReaderNativeInput` 在 Escape／停用之前负责 Reader 范围的原生按键透传。这些是输入负责方，不是 Reader mode 或绑定作用域。

### 跨 compartment 安全（Chrome ↔ Content）

传过 chrome/content 边界的对象和数组**必须**克隆：

```ts
Components.utils.cloneInto(value, targetWindow);
```

不这样做会触发安全错误。

### 文档

项目文档默认只维护中文，不再维护英文版本。现有英文文档在相关任务涉及时按需翻译，更新引用后移除英文副本；没有独立双语文件时直接原位替换正文，保留文件名和 URL。命令、API、配置键与第三方许可证原文保持不变。具体规范见 `docs/DOCUMENTATION_AUTHORING.md`。

为不明显的方法添加 JSDoc 风格块注释，说明参数和副作用。宿主限制或复杂逻辑可以用行内注释解释。

## 架构说明

该插件在 Zotero PDF 阅读器中运行于**三级 iframe 结构**内。架构决策记录在 `docs/DEVELOPMENT.md`。修改批注导航、文本选择、PDF 链接提示或 iframe 注入前，先阅读该指南。

插件会 patch Zotero Reader 的按键转发回调（`PdfView` 实例上的 `_onKeyDown`），避免 Neo 已消费的按键再次由 Zotero 处理（例如 `l`/`r` 对应 Read Aloud，`h`/`s` 对应工具）。`src/toolkit/reader/input-bridge.ts` 中的 `ReaderHostKeyBridge` 负责安装／恢复该私有回调和 `_textAnnotationFocused` 接缝；策略来源仍是 `ReaderSession.readerConsumesKey()`。

`src/toolkit/reader/view-lifecycle.ts` 中的 `ReaderViewLifecycle` 负责发现主／次 PDF window、重扫定时器、视图本地 DOM 监听器和 detached view 释放。`src/modules/reader-navigation/navigation.ts` 中的 `ReaderNavigation` 负责语义遍历和用户反馈；`src/toolkit/reader/navigation.ts` 中的 `ReaderNavigationHost` 负责原生缩放、翻页、搜索、分屏／焦点委托和活动视图解析。

`src/modules/reader-selection/selection-range.ts` 中的 `ReaderSelectionRange` 负责临时 DOM Select anchor/preferred-X 状态、范围移动、端点切换和可逆 Select 样式。`src/modules/reader-selection/` 还负责 Flash 和 Selection Actions；无 DOM 的 registry 保存应用级定义，不随单个 Reader 模块退出而消失。Surface 调用守卫同时捕获 ReaderView 与 Document，并在接纳新资源前退休被替换的视图。输入策略、批注目标与保存接纳仍由各自功能负责方拥有；Toolkit 负责私有原生几何、精确 pane 的 Find 交互能力和 DOM 发现。

`src/modules/reader-annotations/` 按 ReaderSession 拥有批注写入、过滤、复制与评论编辑，并具名提供 Select 贡献。Surface 保留 CurrentTarget、NativeInput 及 `i` / `zb` 的混合路由；评论资源绑定精确 ReaderView / Document，已接纳保存与界面焦点寿命分离。

Main 选择器也遵守相同原则。`src/main/picker/` 负责候选搜索、排序、渲染、预览、焦点、IME、确认／取消和过期工作隔离。普通条目／笔记／标签候选来源只负责数据与展示；打开选择器的语义动作注入确认含义。不要为减少一次分发而在 provider 内加入创建／删除／yank／open 语法，或将领域写入移入 Picker。Command Palette 可以复用候选界面来选择 `ActionId`。标签来源可以限制／投影候选。`TagActions` 负责标签候选和动作编排；`src/operations/item-tags.ts` 执行对明确条目的写入。`MainViewActions` 负责 Main Quick/Advanced/tag View 修改，Zotero 原生过滤界面仍是权威来源。

在发起操作的 Surface 中解析条目目标：`src/main/main-item-target.ts` 应用 Main EffectiveSelection（Persistent Selection 优先于 CurrentTarget），`src/reader/item-target.ts` 解析活动 Reader 条目，`src/main/note-item-target.ts` 解析活动 Note 上下文。只在 `src/core/item-target.ts` 共享结果形状，并在 `src/platform/zotero-items.ts` 共享查找／顶层身份归一化；`src/operations/` 中的具体 Operation 接收明确解析过的条目或 ID。Reader 和 Note 不借用 Main Selection。调用方直接导入类型化的 Surface resolver；不保留共享兼容分发器／重导出。

可选标签页增强由 `src/modules/tab-enhancements/` 按 MainWindow 拥有侧栏、标题格式与窗口级作用域；应用共享分组管理器通过已登记宿主处理跨窗口激活，核心 `workspace` 继续负责原生标签页激活与共享历史。Zotero 原生标签页清单是唯一事实来源：版本化 `viewID` 存在原生 `tab.data`，区分重复的 PDF 视图；`nativeID` 只用于当前原生操作，不作为持久身份。分组保存在 profile-local 键 `tabEnhancements.groups.v1`，与显示偏好分开，不写入 Zotero 标签或分类。Toolkit 的 `src/toolkit/main/tab-enhancements/` 负责私有 Tab API、外层布局、原生工具栏可逆租约及合并后的原生更新和 `item`/`tab` 通知；侧栏位于 `#appcontent` 外侧，不重挂 content deck 或 Reader/PDF iframe，不支持的原生布局保留原生标签页界面。MainWindow controller 等待 `Zotero.initializationPromise` 后再激活，并在回调中核对原 session 是否仍有效。详细设计见 `docs/ARCHITECTURE.md#标签页增强`、`docs/MODULE_DESIGN.md#标签页增强与原生标签页` 和 `docs/DEVELOPMENT.md#标签页增强手动核对`。

## 关键文件

| 文件 | 用途 |
| --- | --- |
| `src/bootstrap.ts` | Gecko Bootstrap 生命周期入口 |
| `src/addon.ts` | 运行时组合与偏好注册 |
| `src/i18n/` | 共享应用本地化、动作标签和语言目录 |
| `src/input/` | 规范绑定与动作元数据 |
| `src/reader/controller.ts` | Reader session 编排、输入、动作、选择、批注和滚动行为 |
| `src/toolkit/index.ts` | 统一宿主能力入口，重导出 Main 和 Reader 能力 |
| `src/toolkit/main/index.ts` | Main 宿主能力公开入口，包含 Note pane 能力 |
| `src/toolkit/reader/index.ts` | Reader 宿主能力公开入口 |
| `src/toolkit/reader/input-bridge.ts` | 私有 PdfView 按键／焦点 patch 生命周期 |
| `src/toolkit/reader/view-lifecycle.ts` | 主／次 PDF 视图发现、监听器和释放 |
| `src/modules/reader-navigation/` | Reader 导航、marks、语义目标、作用域化原生侧栏和平滑滚动行为 |
| `src/modules/reader-selection/` | Select 范围／移动、Flash、选择动作和稳定选择 API 领域 |
| `src/modules/reader-annotations/` | 批注创建／删除／改色／过滤／复制、Select 贡献和精确视图评论编辑 |
| `src/modules/references/` | Reader 模块入口、动作和视图生命周期 |
| `src/references/` | 引用 controller、元数据 provider 和 Reader port |
| `src/operations/references.ts` | 本地引用匹配及明确的 Zotero 添加操作 |
| `src/toolkit/reader/references.ts` | 原生全文快照和 PDF 来源校验 |
| `src/platform/reference-credentials.ts` | 通过 Zotero Login Manager 保存可选 Semantic Scholar key |
| `src/modules/tab-enhancements/` | 可选标签页增强：MainWindow 侧栏、标题格式和可恢复分组 |
| `src/toolkit/main/tab-enhancements/` | 原生 Tab 适配、外层布局及工具栏可逆租约 |
| `src/main/controller.ts` | MainWindow 按键分发与生命周期，包括延迟附着的标签页增强 |
| `src/preferences/index.ts` | 旧式 Preferences 注册与行为 |
| `tools/build.mjs` | esbuild/XPI 打包流水线 |
| `tools/check-package.mjs` | 生成 XPI 的成员契约 |
| `tools/check-release.mjs` | 发布元数据校验器 |
| `.github/workflows/build.yml` | Ubuntu 验证／构建和受保护的 tag 发布 |
| `docs/DEVELOPMENT.md` | 构建、架构、发布和维护约束 |
| `manifest.json` | 扩展 manifest |
| `tools/build.sh` / `tools/build.ps1` | POSIX 和 Windows 验证／构建包装脚本 |

## 重要约束

- **仅支持最新稳定版 Zotero。** 更早版本可能可以运行，但不在兼容性保证和发布测试矩阵内。
- **运行时不得获取软件包。** 不要在运行时加载 npm 包、CDN 脚本、原生辅助二进制文件或网络托管的库。获准使用的运行时库必须具有确切且经过审计的依赖闭包，并在 `vendor/` 下保存对应源码／来源记录；所有可执行代码都必须静态打入生成的 JavaScript，每个 XPI 中都必须包含完整发行声明。
- **源码为 TypeScript，XPI 为 JavaScript。** 只打包生成的 JavaScript 和静态资源；不得将 source map、TypeScript、测试、`node_modules` 或原始 vendor 模块作为单独的 XPI 运行时文件。
- **发行声明。** 每个 XPI 都要包含项目 `LICENSE`、vendor 许可证声明和来源记录；校验实际归档内容，并在已发布资源旁提供对应的 tag 源码。原始 vendor 代码应打入 bundle，不单独分发。
- **CI 覆盖打包和 Node 契约。** Zotero GUI／运行时行为仍需手动验证。
- **不使用 pre-commit hooks。**
