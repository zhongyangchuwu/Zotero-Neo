# 安装 Neo 并开始使用 {#install-neo-and-try-it}

Neo 为 Zotero 文献库、PDF 阅读器和笔记增加键盘操作。安装后仍使用 Zotero 原有的文献、附件和笔记，不需要导入另一套资料库。

## 获取 main 构建 {#get-main-build}

本文及其余指南只描述 `main` 分支。使用相应提交构建的 `zotero-neo.xpi`，可通过以下任一方式获取：

- **下载 CI 构建附件：** 打开 [main 分支的构建记录](https://github.com/zhongyangchuwu/Zotero-Neo/actions/workflows/build.yml?query=branch%3Amain)，选择成功完成的运行并核对提交。在 Artifacts 中下载 `zotero-neo-linux`，解压后取得 `zotero-neo.xpi`。下载附件通常需要登录 GitHub；附件过期时改用源码构建。
- **从源码构建：** 获取 `main`，在仓库根目录按[开发指南](DEVELOPMENT.md#build)安装依赖并运行构建。验证通过后，根目录生成 `zotero-neo.xpi`。

CI 附件名来自构建任务；XPI 包内是生成的 JavaScript 和静态资源。Neo 面向最新稳定 Zotero，具体兼容范围由同一提交的 `manifest.json` 决定。

## 安装 XPI {#install-xpi}

1. 在 Zotero 打开 **Tools → Plugins**（工具 → 插件），点击齿轮菜单。
2. 选择 **Install Plugin From File…**，打开取得的 `zotero-neo.xpi`。
3. 按 Zotero 提示重启。安装后的 Neo 版本可在插件列表中查看。

安装、升级、禁用或移除整个 Neo 都由 Zotero 原生插件管理负责。内部十一项功能分区中，九个核心模块固定启用；只有链接与复制提示（`reader-hints`）和扩展管理面板（`extensions`）可在[模块设置](SETTINGS_GUIDE.md#modules)中关闭。

## 在 PDF 中开始使用 {#try-it}

1. 打开一份 PDF 附件，等待页面加载。
2. 点击 PDF 页面，避开搜索框或批注评论字段，让阅读器取得键盘焦点。
3. 按 `j` 向下滚动，按 `k` 向上滚动。

页面会在当前位置滚动。若按键没有反应，先重新点击页面，再查看[按键无反应](TROUBLESHOOTING.md#a-key-does-nothing)；焦点、当前绑定、行为偏好和宿主状态都会影响命令是否可用。核心模块没有用户关闭开关。

在主窗口、阅读器或笔记 Normal 中，依次按 `Space`、`p`、`s` 打开 Neo 设置。普通设置通常立即保存，快捷键需点击**应用绑定**；链接与复制提示、扩展管理面板的请求需点击**保存模块请求**，完全退出并重新启动 Zotero 后才应用。

## 按需要继续使用 {#continue-with-a-workflow}

- [使用指南总览](USER_GUIDE.md)：按任务查找功能。
- [文献库与阅读清单](MAIN_GUIDE.md#try-it)：浏览、打开和整理条目。
- [阅读与导航 PDF](READER_GUIDE.md#try-it)：滚动、结构导航与分屏。
- [文本选择与批注](SELECTION_GUIDE.md#try-it)：选中文字、调整范围和添加批注。
- [查找与编辑笔记](NOTE_GUIDE.md#try-it)：选择笔记并继续写作。
- [标签整理](TAGS.md)与[搜索与导航](SEARCH_GUIDE.md)：组织条目和返回之前的位置。
- [快捷键与设置](SETTINGS_GUIDE.md)：调整 Neo 的外观与操作方式。

`Space`、`p`、`s` 表示依次按三个键，不需要同时按住；`Ctrl+d` 则表示按住 Ctrl 再按 d。在 macOS 上，Neo 接管的 Ctrl 类快捷键也接受 Command。完整记法见[按键与输入语法](COMMAND_REFERENCE.md#key-notation-and-input-grammar)，焦点和模式见[基本概念](CONCEPTS.md)。
