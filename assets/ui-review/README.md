# UI 评审工作台

这里保存设置中心、Picker 和参考文献详情的 React 交互设计样例，以及当前 Zotero 的对应实机截图。设计采用紧凑列表、分组表单、中性底色和单一强调色。

**本轮不切换生产界面。** 工作台始终显示“交互设计样例 · 尚未接入 Zotero”；它只修改当前网页会话中的示例状态，不读写 Zotero 配置、文库、凭据或缓存，也不请求模型或元数据服务。重新加载页面会恢复示例初始状态。

## 运行

在仓库根目录，准备好 `package-lock.json` 对应的开发依赖后运行：

```bash
npm run ui:review
```

打开 `http://127.0.0.1:6217/`。指定其他端口：

```bash
npm run ui:review -- --port 6218
```

服务只监听回环地址，在内存中用已有 esbuild 和 `vendor/react` 构建示例；不生成需要提交的 JavaScript。结束时按 `Ctrl+C`。类型检查：

```bash
npm run ui:review:check
```

这项检查也已加入 `npm run typecheck` 和仓库验证流程。源码位于 [examples](examples/)，预览入口为 `tools/ui-review.mjs`。此目录是仓库评审资料，不加入 XPI；现有 `assets/branding` 和 `assets/package` 保持原用途。

## 可操作的样例

- **设置中心**：分类导航与搜索、外观预览、会话内保存／取消、快捷键文本编辑、模块草稿／已保存请求／本次应用状态、带确认的重置。
- **Picker**：按公开文献的标题、作者、年份和标识符筛选，箭头移动、Enter 选择、Escape 关闭与焦点返回，组合输入期间不确认或移动结果，包含无结果状态。选择只在样例内生效，不打开 PDF。
- **参考详情**：公开论文元数据与原始摘要开头、来源与固定示例日期、缓存／离线错误／空缓存场景。离线刷新是明确标记的本地演示，不伪装真实请求；清除只清除示例状态。

工作台中的统一保存／取消是设计提案，**不是当前全部设置都支持事务回滚的承诺**。示例字段和快捷键文本也不建立新的生产配置或默认绑定。当前生产设置的提交时机并不统一，迁移边界见[架构审查](ARCHITECTURE_REVIEW.md)。

## 截图索引

所有 PNG 均来自实际运行的窗口或网页捕获，没有用绘图替代功能界面。桌面设计图为 1440 × 1000，窄屏图为 760 × 1000；实机图为 1424 × 992。来源、路由、主题、尺寸与 SHA-256 记录在 [capture-manifest.json](capture-manifest.json)。

| 界面 | 当前 Zotero 实机 | React 设计：浅色 | React 设计：深色 |
| --- | --- | --- | --- |
| 设置中心 | [当前界面](screenshots/zotero/settings-current.png) | [浅色方案](screenshots/design/settings-light.png) | [深色方案](screenshots/design/settings-dark.png) |
| Picker | [当前界面](screenshots/zotero/picker-current.png) | [浅色方案](screenshots/design/picker-light.png) | [深色方案](screenshots/design/picker-dark.png) |
| 参考文献详情 | [当前界面](screenshots/zotero/references-current.png) | [浅色方案](screenshots/design/references-light.png) | [深色方案](screenshots/design/references-dark.png) |

补充状态：[刷新错误并保留内容](screenshots/design/references-error-dark.png)、[清除后的空缓存](screenshots/design/references-empty-light.png)、[窄屏设置布局](screenshots/design/settings-narrow.png)。

设计截图可从以下路由重现；浏览器中设定对应视口尺寸并等待字体加载后截取完整页面：

```text
/?surface=settings&theme=light
/?surface=picker&theme=dark
/?surface=references&theme=light
/?surface=references&theme=dark&state=error
/?surface=references&theme=light&state=empty
```

实机截图基线是 `e84f16301dce` 的 XPI，在 Zotero 10.0.8 独立临时配置中运行。资料为公开论文和预置测试条目，不是日常文库。参考详情确实通过显式搜索取得 arXiv `1706.03762v7` 的原始数据；采集后正常退出并删除本次独立配置，没有关闭或修改已被占用的其他实例。设计样例的 `2024-01-15` 则是固定展示日期，不能当成本次获取时间。

## 验证与限制

已在实际浏览器中检查保存／取消、主题预览、模块提交状态、确认重置、Picker 搜索／选择／焦点返回／组合事件与普通文字输入，以及参考详情错误保留和清除。已检查浅深色和窄屏捕获；这些检查不等于物理键盘、真实 OS 输入法或全部无障碍条件认证。

当前设置页另有一个已复现的键盘可达性问题，单独跟踪于 [#237](https://github.com/zhongyangchuwu/Zotero-Neo/issues/237)；本轮没有修改生产设置页来掩盖它。

## 设计与资料来源

布局与交互参考 [shadcn/ui](https://ui.shadcn.com/blocks)、[Linear](https://linear.app/features) 和 [Raycast](https://www.raycast.com/)，但未复制它们的应用代码、图片或整套后台工程。示例组件和 CSS 是本仓库代码，复用已审计的 React 构建，许可说明见 `vendor/react/NOTICE`。

文献样例使用公开书目事实；摘要开头引自 [Attention Is All You Need](https://arxiv.org/abs/1706.03762v7)。它仅用于界面评审，不提供新的书目匹配、网络查询或文库写入能力。
