![Zotero Neo — 受 Neovim 启发的 Zotero 键盘交互层](assets/branding/zotero-neo-banner.png)

# Zotero Neo

Zotero Neo 是一个受 Vim/Neovim 启发的 Zotero 插件。它给文献列表、PDF 阅读器和笔记编辑器增加键盘操作，不需要另建文献库。

比如，你可以在文献列表中按 `j` / `k` 移动，按 `s` 把论文加入待整理的选择集；打开 PDF 后用 `v` 选中文字，再复制或添加批注。它还支持按标题、图表跳转、分屏阅读，以及查找和编辑 Zotero 笔记。

## 安装

目前文档对应 `main` 分支的实现。Neo 面向 macOS、Linux 和 Windows 上最新的 Zotero 稳定版；具体兼容版本请以 [`manifest.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/manifest.json) 为准。

按照[安装指南](docs/GETTING_STARTED.md)下载或构建 `zotero-neo.xpi`，再通过 Zotero 的插件管理器安装。指南里也有安装后的第一步操作。

## 主要功能

- [PDF 阅读与导航](docs/READER_GUIDE.md)：滚动、搜索、标题与图表跳转、分屏和阅读位置标记。
- [选择文字与批注](docs/SELECTION_GUIDE.md)：输入词句定位选区，调整范围，复制、划线和编辑评论。
- [文献库与批量整理](docs/MAIN_GUIDE.md)：查找论文、建立临时选择集、整理标签和分类。
- [笔记](docs/NOTE_GUIDE.md)：查找已有笔记，按需使用 Vim 风格编辑。
- [更多功能](docs/FEATURES.md)和[使用指南](docs/USER_GUIDE.md)：按实际任务查找操作。

## 参考与开发

需要查按键或排查问题，可以看[命令参考](docs/COMMAND_REFERENCE.md)、[设置指南](docs/SETTINGS_GUIDE.md)和[故障排查](docs/TROUBLESHOOTING.md)。

参与开发请从[开发指南](docs/DEVELOPMENT.md)开始。设计细节见[架构](docs/ARCHITECTURE.md)和[交互模型](docs/INTERACTION_MODEL.md)；另有[文档编写规范](docs/DOCUMENTATION_AUTHORING.md)、[更新记录](CHANGELOG.md)、[路线图](docs/ROADMAP.md)和 [Issues](https://github.com/zhongyangchuwu/Zotero-Neo/issues)。

项目最初使用了 [Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus) 的代码，后者包含来自 [zotero-vim](https://codeberg.org/finktank/zotero-vim) 的工作。历史版权声明按项目许可证保留。

许可证：[AGPL-3.0](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/LICENSE)。XPI 的 `LICENSE` 包含项目许可证，`licenses/fuzzysort-LICENSE` 包含所捆绑 fuzzysort 的 MIT 声明。构建包与生成它的源码提交对应；正式发布的二进制文件还应提供同一标签下的源码。
