# 使用指南 {#user-guide}

Neo 在 Zotero 的文献库、PDF 阅读器和笔记编辑器中提供键盘操作。你可以边浏览边整理一组文献，在 PDF 中选择和批注文字，也可以把不同论文的段落收集到已有笔记里。

首次安装见[安装与入门](GETTING_STARTED.md)。下文使用默认快捷键；如果你改过绑定，以**设置 → 快捷键**中的当前值为准。同一个键在不同区域可能有不同用途，[基本概念](CONCEPTS.md)解释了焦点、模式、条目游标与 Neo 选择集的区别。

## 按当前任务查找用法 {#get-started}

### 功能入口 {#explore-the-modules}

| 想做什么 | 阅读哪篇指南 |
| --- | --- |
| 按标识符添加文献、浏览条目、建立阅读清单或整理分类 | [文献库与阅读清单](MAIN_GUIDE.md) |
| 翻页、搜索 PDF、沿标题或图表跳转、使用分屏比较位置 | [阅读与导航 PDF](READER_GUIDE.md) |
| 用键盘选择文字、调整选区、复制或添加批注 | [文本选择与批注](SELECTION_GUIDE.md) |
| 把选中的段落追加到已有笔记 | [摘录到笔记](CAPTURE_GUIDE.md) |
| 查找笔记、使用原生输入或 Vim 风格编辑 | [查找与编辑笔记](NOTE_GUIDE.md) |
| 添加或移除标签，用标签筛选文献库 | [标签整理](TAGS.md) |
| 查找条目或笔记、缩小视图范围、切换标签页、返回之前的位置 | [搜索与导航](SEARCH_GUIDE.md) |
| 修改快捷键、外观、语言、滚动和笔记编辑行为 | [快捷键与设置](SETTINGS_GUIDE.md) |
| 选择要启用的内置功能 | [模块设置](SETTINGS_GUIDE.md#modules) |

模块默认全部开启。停用模块后，对应命令不再参与按键匹配、前缀提示或命令面板；保存的绑定仍保留。模块请求需要完全重启 Zotero 后才生效，旧的编辑和滚动偏好不会因此被重置。若入口没有出现，先看[故障排查](TROUBLESHOOTING.md#a-key-does-nothing)。

## 阅读论文并持续记录笔记 {#read-a-paper-and-keep-a-running-note}

从[文献库](MAIN_GUIDE.md)找到并打开一篇论文，在[阅读器](READER_GUIDE.md)中翻页、搜索或按论文结构跳转。找到需要保留的段落后，用[文本选择与批注](SELECTION_GUIDE.md)调整选区，再用[摘录到笔记](CAPTURE_GUIDE.md)选择已有目的地，预览正文后确认追加。

一篇论文可以配一条持续更新的阅读笔记；跨论文的主题笔记也可以接收同一文库中的摘录。需要解释和比较时，在[笔记编辑器](NOTE_GUIDE.md)中继续写作。摘录会保留原笔记内容，不会自动创建新笔记；想使用新目的地时，先在 Zotero 中建立它。

## 审阅与整理论文 {#review-and-organize-papers}

用[搜索与导航](SEARCH_GUIDE.md)缩小主窗口视图，或直接找到某个条目。浏览时可把文献加入 **Neo 选择集**，然后在选择集面板中检查整组成员，再通过[标签](TAGS.md)或[分类](MAIN_GUIDE.md#change-collection-membership)整理它们。

条目游标只是当前浏览的位置，Neo 选择集才是批量操作的一组目标；改变搜索或分类不会自动清空它。选择集中可能有当前视图之外的文献，批量修改前可以打开 `<Space>ss` 查看。临时可视范围、原生多选与 Neo 选择集的关系见[文献库指南](MAIN_GUIDE.md#keep-opening-and-batch-selection-separate)。

## 在线索涉及的论文与笔记之间跳转 {#follow-a-thread-across-papers-and-notes}

在阅读器中先设置一个阅读器标记，或利用共享后退／前进返回之前的位置。用[复制／跟随提示](READER_GUIDE.md#copy-or-follow-visible-targets)复制页面上的标识符、批注内容或跟随链接；需要把新论文加入 Zotero 时，再使用[按标识符添加文献](MAIN_GUIDE.md#add-items-by-identifier)。复制或打开链接不会自动导入条目。

[搜索与导航](SEARCH_GUIDE.md)介绍条目查找、标签页切换和共享历史。找到相关材料后，可以把段落追加到同一条[主题笔记](CAPTURE_GUIDE.md#use-capture-to-note-for-literature-review)，再在[笔记编辑器](NOTE_GUIDE.md)中写下比较与结论。

## 查找准确按键或解决问题 {#find-help}

- 想知道某个动作的默认按键、适用上下文、计数行为或目标规则：查[命令参考](COMMAND_REFERENCE.md)。
- 想知道控件默认值和模块状态：查[设置参考](SETTINGS_REFERENCE.md)。
- 输入文字、使用中文输入法或原生快捷键时遇到疑问：查[文本输入与输入法](INPUT_METHODS.md)。
- 按键、选择器或设置没有按预期工作：从[故障排查](TROUBLESHOOTING.md)按症状查找。
