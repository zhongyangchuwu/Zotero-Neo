# Zotero Neo

Zotero Neo 是一组按需使用的 Zotero 增强工具。你可以只用其中一项，比如定位论文的引用、在表格里筛选文献，或按词句选中 PDF 文字。文献仍在原有 Zotero 文库中。

Neo 提供受 Vim 启发的键盘操作。带有 Zotero 工具栏或菜单入口的工具，也可以直接用鼠标打开。

## 安装

目前文档对应 `main` 分支的实现。Neo 面向 macOS、Linux 和 Windows 上最新的 Zotero 稳定版；具体兼容版本请以 [`manifest.json`](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/manifest.json) 为准。

按照[安装指南](docs/GETTING_STARTED.md)下载或构建 `zotero-neo.xpi`，再通过 Zotero 的插件管理器安装。指南里也有安装后的第一步操作。

## 主要功能

- [定位论文引用](docs/READER_GUIDE.md#查找和核对参考文献)：找出正文中的引用位置，或查看文库里有没有本地副本。
- [用表格筛选文献](docs/MAIN_GUIDE.md#用独立表格整理文献)：按书目字段、标签或自定义属性筛选、排序和保存视图。
- [PDF 阅读与导航](docs/READER_GUIDE.md)：滚动、搜索、标题与图表跳转、分屏和阅读位置标记。
- [选择文字与批注](docs/SELECTION_GUIDE.md)：输入词句定位选区，调整范围，复制、划线和编辑评论。
- [文献库与批量整理](docs/MAIN_GUIDE.md)：查找论文、建立临时选择集、整理标签和分类。
- [笔记](docs/NOTE_GUIDE.md)：查找已有笔记，按需使用 Vim 风格编辑。

[更多工具](docs/FEATURES.md)还包括[补全论文信息](docs/MAIN_GUIDE.md#检查和更新论文信息)、[设置快照](docs/SETTINGS_GUIDE.md#导出和恢复配置)和 AI 问答（实验）。[手动翻译选区](docs/SELECTION_GUIDE.md#手动翻译选区)由 Neo 的 **Extras → 选区翻译**接入 Translate for Zotero，默认关闭。

## 参考与开发

需要查按键或排查问题，可以看[命令参考](docs/COMMAND_REFERENCE.md)、[设置指南](docs/SETTINGS_GUIDE.md)和[故障排查](docs/TROUBLESHOOTING.md)。

参与开发请从[开发指南](docs/DEVELOPMENT.md)开始。设计细节见[架构](docs/ARCHITECTURE.md)和[交互模型](docs/INTERACTION_MODEL.md)；另有[文档编写规范](docs/DOCUMENTATION_AUTHORING.md)、[更新记录](CHANGELOG.md)、[路线图](docs/ROADMAP.md)和 [Issues](https://github.com/zhongyangchuwu/Zotero-Neo/issues)。

项目最初使用了 [Zotero Vim Plus](https://github.com/ZorroStardust/zotero-vim-plus) 的代码，后者包含来自 [zotero-vim](https://codeberg.org/finktank/zotero-vim) 的工作。历史版权声明按项目许可证保留。

许可证：[AGPL-3.0](https://github.com/zhongyangchuwu/Zotero-Neo/blob/main/LICENSE)。XPI 中的 `LICENSE` 是项目许可证，`licenses/fuzzysort-LICENSE` 是 fuzzysort 的 MIT 声明；静态打包的 AI SDK、React 与 age-encryption 闭包分别附有 `licenses/<名称>-NOTICE` 和 `licenses/<名称>-provenance.json`。版本、来源与完整依赖闭包见 provenance 文件。XPI 包含生成后的 bundle，不单独分发原始 vendor 包；构建包与生成它的源码提交对应，正式发布的二进制文件还应提供同一标签下的源码。
