# 开始使用 Zotero Neo

本页负责安装和首次使用**已公开的 Zotero Neo v0.1.0**。目前公开下载只有 v0.1.0；仓库当前文档也记录尚未发布的源代码工作，不能把它们当作 v0.1.0 XPI 的完整行为说明。

Zotero Neo 支持 **Zotero 最新稳定版**（当前支持主版本为 Zotero 10）；不承诺旧版 Zotero 或 Beta 版。

## 安装公开版 v0.1.0

1. 从 [v0.1.0 GitHub Release](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0) 下载发布资产 `zotero-neo.xpi`。请使用发布页提供的包，不要用仓库源码构建包替代公开版。
2. 在 Zotero 中打开 **Tools → Plugins**。
3. 打开齿轮菜单，选择 **Install Plugin From File…**，选中下载的 XPI。
4. 按 Zotero 提示重启。
5. 重启后在插件列表核对 Zotero Neo 的版本为 `0.1.0`。

[直接下载 XPI](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi) · [v0.1.0 发布说明](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)

如果插件未出现在列表中、版本不是 `0.1.0`，或 Zotero 没有完成重启，请先确认安装包来源与 Zotero 插件列表状态；不要根据源码文件名推断已安装的包版本。公开 v0.2.0 尚不存在，因此目前没有公开 v0.2.0 安装或升级入口。

## 第一次使用

1. 打开 Zotero 的文献库，使用 Zotero 原生界面选择一条已有文献。
2. 打开该文献的 PDF 附件进入 Reader。第一次使用时先确认当前窗口和焦点：键盘可能由文献列表、PDF、Zotero 原生面板或文本编辑器接收。
3. v0.1.0 提供 Reader 导航、可见 PDF 文本选择与选区操作、Main 基础导航和项目选择、查找器、标签操作、笔记查找/编辑等工作流。Neo 只在相应上下文拥有输入时处理自己的命令；原生文本编辑与输入法仍由 Zotero/浏览器控件处理。
4. 如需公开版键位，请查看 [v0.1.0 随包指南](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/docs/USER_GUIDE.md)和[发布说明](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)。本网站的[用户指南](USER_GUIDE.md)和[命令参考](COMMAND_REFERENCE.md)描述当前源码中的行为与绑定，不是完整的 v0.1.0 命令清单；不要把其中新增或变更的契约套用到公开包。

本页不重复命令表。查看当前源码契约时，从[交互模型](INTERACTION_MODEL.md)理解目标与焦点，再从[命令参考](COMMAND_REFERENCE.md)查精确 ActionId、绑定和上下文。

## 公开版本与当前源码的边界

- 公开下载、GitHub Release 和主分支更新源仍是 v0.1.0。
- 本网站直接从仓库 Markdown 生成。用户指南、命令参考、交互模型和架构文档描述未发布的当前源码工作；文档上线不会改变公开 XPI。
- 从源码构建的包不等于发布页中的公开资产；即使版本标签相同，也不能据此认定功能和包内容相同。
- 单独准备的 v0.2.0 候选包见 draft [PR #143](https://github.com/zhongyangchuwu/Zotero-Neo/pull/143)。实际持久安装、公开 v0.1.0 升级和受信任 Gecko 路由观察记录在 [Issue #137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137)，这些结果不属于公开 v0.1.0 下载。
- 物理 OS 输入法候选确认/组合态 Escape 与 Backspace、人工剪贴板和原生 Outline 激活仍为 **NOT PERFORMED**。程序化或受信任事件不是物理键盘验收；Issue #137 仍开放。详见[v0.2 候选验收指南](./V0_2_ACCEPTANCE.md)。

如需从源码参与开发或了解网站编辑流程，请阅读[开发指南](DEVELOPMENT.md)。插件发布状态以 GitHub Release 和对应验收记录为准。
