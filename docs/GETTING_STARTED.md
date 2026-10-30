# 安装 Neo 并开始使用 {#install-neo-and-try-it}

Neo 是 Zotero 插件。安装后，文献、PDF 附件和笔记都留在原来的 Zotero 文库中，不需要迁移数据。

## 获取 XPI 安装包 {#get-main-build}

目前的文档对应 `main` 分支。你可以下载该分支的构建产物，也可以自行编译：

- **下载构建包**：打开 [main 分支的 GitHub Actions 构建记录](https://github.com/zhongyangchuwu/Zotero-Neo/actions/workflows/build.yml?query=branch%3Amain)，选择一次成功的运行，在 **Artifacts** 中下载 `zotero-neo-linux`。解压后找到 `zotero-neo.xpi`。下载通常需要登录 GitHub；旧构建附件可能过期。
- **自己构建**：获取 `main` 分支源码，按[开发指南](DEVELOPMENT.md#build)安装依赖并执行构建，根目录会生成 `zotero-neo.xpi`。

虽然 CI 附件名称中有 `linux`，XPI 本身不需要按操作系统分别编译。Neo 面向 macOS、Linux 和 Windows 上最新的 Zotero 稳定版；具体兼容版本见对应提交的 `manifest.json`。

## 在 Zotero 中安装 {#install-xpi}

1. 打开 Zotero，进入 **Tools → Plugins**（工具 → 插件），点击齿轮图标。
2. 选择 **Install Plugin From File…**，选中 `zotero-neo.xpi`。
3. 按提示重启 Zotero。

安装或更新插件都通过 Zotero 的插件管理器操作。

## 打开 PDF 试试 {#try-it}

1. 打开一篇 PDF，等页面加载完成。
2. 点击 PDF 正文，让页面获得键盘焦点。
3. 按 `j` 向下滚动，按 `k` 向上滚动。

如果没有反应，先点击页面再试。搜索框、批注输入框或侧栏获得焦点时，这些键可能由 Zotero 自己处理。仍然无效可看[按键没有反应](TROUBLESHOOTING.md#a-key-does-nothing)。

要打开 Neo 设置，依次按 `Space`、`p`、`s`。这里的三个键是**依次按**，不是同时按。修改普通设置通常会立即保存；修改快捷键后还需要点击**应用绑定**。

## 下一步 {#continue-with-a-workflow}

- [文献库](MAIN_GUIDE.md#try-it)：移动、查找和批量整理条目。
- [PDF 阅读](READER_GUIDE.md#try-it)：翻页、跳转、分屏。
- [文字选择与批注](SELECTION_GUIDE.md#try-it)：用键盘选中文字并高亮。
- [笔记](NOTE_GUIDE.md#try-it)：查找和编辑 Zotero 笔记。
- [设置指南](SETTINGS_GUIDE.md)：更改按键、滚动方式和外观。

`Ctrl+d` 则表示按住 Ctrl 再按 d。在 macOS 上，Neo 接管的 Ctrl 类快捷键也接受 Command。更多按键记法见[命令参考](COMMAND_REFERENCE.md#key-notation-and-input-grammar)。
