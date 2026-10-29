![Zotero Neo — 受 Neovim 启发的 Zotero 键盘交互层](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo 为 Zotero 文献库、PDF Reader 和笔记编辑器提供键盘操作。用它查找论文、选择 PDF 文本、添加批注，并查找和编辑笔记。

已发布版本为 [v0.1.0](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)。当前源码构建的是尚未发布的 v0.2.0。Neo 支持 macOS、Linux 和 Windows 上最新的 Zotero 稳定版；具体包兼容范围以发布版本的 manifest 为准。

## 开始使用

- [安装 Neo 并开始使用](docs/GETTING_STARTED.md)：区分公开发行版与当前开发构建，选择对应的安装包和指南。
- [功能介绍](docs/FEATURES.md)：文本选择与批注、阅读清单与 PDF 导航。
- [使用指南](docs/USER_GUIDE.md)：串联文献库、Reader 和笔记的任务工作流。
- [基本概念](docs/CONCEPTS.md)：焦点、模式、条目游标、Neo 选择集与文本选区。

## 帮助与参考

- [故障排查](docs/TROUBLESHOOTING.md)。
- [命令与默认按键](docs/COMMAND_REFERENCE.md)。
- [设置参考](docs/SETTINGS_REFERENCE.md)。
- [已发布 v0.1.0 的使用指南](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/docs/USER_GUIDE.md)与[发布说明](https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0)。

## 开发与项目信息

- [开发指南](docs/DEVELOPMENT.md)：构建、调试、测试与文档站维护。
- [架构](docs/ARCHITECTURE.md)、[交互模型](docs/INTERACTION_MODEL.md)与[模块拆分及基座设计](docs/MODULE_DESIGN.md)。
- [文档编写规范](docs/DOCUMENTATION_AUTHORING.md)：默认只维护中文，现有英文按需迁移，不保留双语副本。
- [验收规范](docs/V0_2_ACCEPTANCE.md)与[录制指南](docs/RECORDING_GUIDE.md)。
- [更新记录](CHANGELOG.md)、[路线图](docs/ROADMAP.md)与[问题追踪](https://github.com/zhongyangchuwu/Zotero-Neo/issues)。

项目最初使用了 [Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus) 的代码，后者包含来自 [zotero-vim](https://codeberg.org/finktank/zotero-vim) 的工作。历史版权声明按项目许可证保留。

[GNU Affero General Public License v3.0](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/LICENSE)（AGPL-3.0）。

XPI 在 `LICENSE` 中包含完整项目许可证，并在 `licenses/fuzzysort-LICENSE` 中包含所捆绑 fuzzysort 的 MIT 声明。发布的二进制文件对应同一发布标签下可获得的源码。
