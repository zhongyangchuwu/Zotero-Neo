---
layout: home
hero:
  name: Zotero Neo
  text: 面向 Zotero 的键盘交互层
  tagline: 用键盘浏览文献、阅读 PDF、处理选区与标注，并在需要时回到 Zotero 原生界面输入。
  actions:
    - theme: brand
      text: 下载公开版 v0.1.0
      link: https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi
      target: _blank
      rel: noopener noreferrer
    - theme: alt
      text: 开始使用
      link: /docs/GETTING_STARTED
    - theme: alt
      text: 命令参考
      link: /docs/COMMAND_REFERENCE
features:
  - title: 文献库与 Main
    details: 在当前视图中浏览项目，用明确的 Selection 管理多项目目标，并查找当前可见项目。
  - title: Reader 阅读
    details: 导航 PDF 页面、原生侧栏与分栏，在可见文本上建立选区并执行标注操作。
  - title: 选区与笔记
    details: 将摘录捕获到已有 Zotero Note；笔记内容仍由 Zotero 原生编辑器负责。
---

## 了解 Zotero Neo

Zotero Neo 为 Zotero 主窗口和 Reader 提供可配置的键盘交互。它受 Vim/Neovim 启发，但不是完整仿制品；它尊重 Zotero 的文献数据和原生编辑器，并根据当前窗口、焦点、模式与操作目标决定按键如何生效。

当前可公开安装的是 **v0.1.0**：

- [下载官方 v0.1.0 XPI](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi)
- [查看 v0.1.0 发布说明](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)
- [阅读项目介绍与安装说明](./README.md)

支持范围为当前最新稳定版 Zotero；请从 Zotero 的 **Tools → Plugins → Install Plugin From File…** 安装 XPI，并按提示重启。

## 从常见任务开始

### 在文献库中定位项目

在 Main 的项目列表中，`j` / `k` 可移动 Cursor；`s` 可将当前目标加入或移出 Neo Selection。`/` 用于查找当前可见项目，不会替代 Zotero 的 Quick Search 或 Advanced Search。

[了解 Main、Cursor 与 Selection](./docs/INTERACTION_MODEL.md) · [查看 Selection 与标签](./docs/TAGS.md)

### 阅读和处理 PDF

Reader 提供页面导航、查找、分栏及原生侧栏工作流。需要选取可见 PDF 文本时，可进入 Select 流程，调整选区后执行高亮、复制、搜索或其他可用动作。

[阅读 Reader 工作流](./docs/USER_GUIDE.md) · [核对准确按键与上下文](./docs/COMMAND_REFERENCE.md)

### 将摘录捕获到已有笔记

从 Reader 选中文本后，可选择把摘录追加到已有 Zotero Note。确认目标前可以检查笔记预览；此流程不自动创建笔记。Note 编辑仍在 Zotero 的原生笔记编辑器中完成。

[开始使用与首次操作](./docs/GETTING_STARTED.md) · [查看输入法与焦点边界](./docs/INPUT_METHODS.md)

## 文档入口

- [用户指南](./docs/USER_GUIDE.md)：按任务了解浏览、Reader、选区、笔记与设置工作流。
- [完整命令参考](./docs/COMMAND_REFERENCE.md)：查询 ActionId、默认绑定、上下文和限制；这是唯一完整按键表。
- [开发与架构](./docs/DEVELOPMENT.md) · [项目路线图](./docs/ROADMAP.md)
- [v0.2 候选验收指南](./docs/V0_2_ACCEPTANCE.md) · [录屏与键盘操作指南](./docs/RECORDING_GUIDE.md)
- [项目变更日志](./CHANGELOG.md)
