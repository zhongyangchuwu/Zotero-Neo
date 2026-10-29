# 安装 Neo 并开始使用 {#install-neo-and-try-it}

Neo 为 Zotero 文献库、PDF 阅读器和笔记增加键盘操作。安装后仍使用 Zotero 原有的文献、附件和笔记，不需要导入另一套资料库。

## 选择安装版本 {#choose-a-version}

**当前网站说明尚未正式发布的 v0.2.0。公开下载仍是 v0.1.0，不能用旧包体验这里介绍的全部功能。**

- 使用公开发行版：下载[官方 v0.1.0 XPI](https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi)，操作说明请对照[该版本的用户指南](https://github.com/zhongyangchuwu/Zotero-Neo/blob/v0.1.0/docs/USER_GUIDE.md)。
- 使用 v0.2 开发构建：安装你已取得的当前源码构建 XPI。需要自行构建时，见[开发指南](DEVELOPMENT.md#build)；它不是已发布的 v0.2 安装包。

Neo 面向最新稳定 Zotero，具体包允许安装的版本范围由它的 manifest 决定。

## 安装 XPI {#install-the-public-release}

1. 在 Zotero 打开 **Tools → Plugins**（工具 → 插件），点击齿轮菜单。
2. 选择 **Install Plugin From File…**，打开所选版本的 `zotero-neo.xpi`。
3. 按 Zotero 提示重启。安装后的 Neo 版本可在插件列表中查看。

安装、升级、禁用或移除整个 Neo 都由 Zotero 原生插件管理负责。Neo 内部哪些功能需要开启，则在[模块设置](SETTINGS_GUIDE.md#modules)中选择；模块默认全部开启。

## 在 PDF 中开始使用 {#try-it}

1. 打开一份 PDF 附件，等待页面加载。
2. 点击 PDF 页面，避开搜索框或批注评论字段，让阅读器取得键盘焦点。
3. 按 `j` 向下滚动，按 `k` 向上滚动。

页面会在当前位置滚动。若按键没有反应，先重新点击页面，再查看[按键无反应](TROUBLESHOOTING.md#a-key-does-nothing)；焦点、当前绑定和模块状态都会影响命令是否可用。

在主窗口、阅读器或笔记 Normal 中，依次按 `Space`、`p`、`s` 打开 Neo 设置。普通设置通常立即保存，快捷键需点击**应用绑定**；模块请求需点击**保存模块请求**，完全退出并重新启动 Zotero 后才应用。

## 按需要继续使用 {#continue-with-a-workflow}

- [使用指南总览](USER_GUIDE.md)：按任务查找功能。
- [文献库与阅读清单](MAIN_GUIDE.md#try-it)：浏览、打开和整理条目。
- [阅读与导航 PDF](READER_GUIDE.md#try-it)：滚动、结构导航与分屏。
- [文本选择与批注](SELECTION_GUIDE.md#try-it)：选中文字、调整范围和添加批注。
- [摘录到笔记](CAPTURE_GUIDE.md#try-it)：把段落追加到已有 Note。
- [查找与编辑笔记](NOTE_GUIDE.md#try-it)：选择笔记并继续写作。
- [标签整理](TAGS.md)与[搜索与导航](SEARCH_GUIDE.md)：组织条目和返回之前的位置。
- [快捷键与设置](SETTINGS_GUIDE.md)：调整 Neo 的外观与操作方式。

`Space`、`p`、`s` 表示依次按三个键，不需要同时按住；`Ctrl+d` 则表示按住 Ctrl 再按 d。在 macOS 上，Neo 接管的 Ctrl 类快捷键也接受 Command。完整记法见[按键与输入语法](COMMAND_REFERENCE.md#key-notation-and-input-grammar)，焦点和模式见[基本概念](CONCEPTS.md)。
