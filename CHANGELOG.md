# 更新日志

记录影响用户的变更，格式参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)。新增能力或改变交互契约时提升次版本，单纯修复使用补丁版本；发布流程见[开发指南](docs/DEVELOPMENT.md#发布小版本)。

先把值得记录的变更写入「未发布」。正式发布时，将这些条目移到对应的版本与发布日期下。每个版本仅列有内容的分类：不兼容变更、新增、变更、弃用、移除、修复、安全。

## [未发布]

### 新增

- Main 和 Reader 可按 `<Space>ob`，或在 `:` 命令面板选择「打开 Zotero Bases」，打开或聚焦已有工作区。需要启用 Zotero Bases 0.3.0 或兼容版本；缺失、停用或版本过旧时会提示如何处理。可在 `<Space>pp` 选中 Bases 后按 `p` 打开其原生偏好页。([#347])
- 在 **Neo 设置 → 交互 → 主窗口 → 启动焦点**中选择「条目列表」或「Zotero 快速搜索」。默认仍为条目列表，下次启动进入文库时生效；设置可随快照备份。([#348])

## [0.5.3] - 2026-11-22

### 修复

- 修复设置中心右栏被挤窄、表单被裁切以及标题被顶部按钮遮挡的问题。无需重新配置快捷键或自定义 CSS。

## [0.5.2] - 2026-11-21

### 新增

- 「添加到分类」和「从分类移除」支持 `Tab` / `Shift+Tab` 勾选多个分类。筛选保留勾选；按 `Enter` 一次提交并显示更新、跳过和失败结果，不清空 Neo 条目选择集。未勾选时只操作高亮分类。

### 变更

- 分类操作使用紧凑单栏 Picker，父路径和归属状态分列显示。「移动分类」先选来源，再选目标父级；文献选择器和命令面板仍保留双栏。

## [0.5.1] - 2026-11-21

### 新增

- Neo 自有界面统一支持 Classic、Terminal、Modern 和全局自定义 CSS。预设随 Zotero 明暗模式切换，已打开的界面即时更新；不改变 Zotero 原生界面或 PDF 纸面。预设和设置中填写的 CSS 可随工作区备份或文库同步恢复，配置目录里的 CSS 文件不会同步。

### 变更

- 旧 Picker 外观偏好自动迁移，`.picker-*` 和 `--picker-*` 写法继续可用。
- 批注评论和选区操作随 Neo 语言切换。扩展面板底栏只显示常用快捷键，标签侧栏用强调线标记当前标签。

## [0.5.0] - 2026-11-20

### 不兼容变更

- 内置文献表格和条目自定义属性移至独立插件 [Zotero Bases](https://github.com/zhongyangchuwu/Zotero-Bases)。可在 `<Space>pp` 的精选列表安装。旧属性定义和视图不会自动迁移，旧 Neo 备份中的定义会跳过；条目 `Extra` 中的数据保留。

### 新增

- 扩展管理器支持从精选列表、GitHub 或 HTTPS XPI 链接安装第三方扩展，并可更新、启停和卸载。
- 工作区备份记录第三方扩展的安装来源和启停状态；恢复时可先安装选中的缺失扩展，再恢复所选设置。支持本地 JSON、密码加密的 age 文件及 Zotero 文库附件。下载附件不会自动应用设置。

### 变更

- 常用偏好直接保存，需重启的模块会明确提示。批量标签和分类等操作遇到单项失败时继续处理其余目标，并汇报结果。
- 从 **Neo 设置 → Extras → 选区翻译**管理手动翻译，无需安装旧实验性独立插件。

## [0.4.0] - 2026-11-18

### 新增

- 从 Zotero 工具菜单打开文献表格，按标签、日期、DOI 或自定义属性筛选和排序，并保存本机视图。在该版本启用条目自定义属性模块后，可编辑文本、数字、单选和多选属性。
- 主窗口「检查论文信息」可对所选条目或当前分类比较元数据建议，仅更新勾选字段，并将结果保存为 Zotero 附件或笔记。
- 设置快照支持导出及预览恢复 Zotero、Neo 和受支持的扩展设置，可保存为本机文件或文库附件。文库 JSON 快照可定期更新，加密快照需手动更新。

## [0.3.0] - 2026-11-16

### 新增

- 解析对照支持保存题注与主体关联、修正正文归属，并有限撤销。修正由导航、选择、摘录和笔记共同使用，不修改 PDF 或原始解析缓存。

### 变更

- 图表浏览、正文选择和对象摘录默认使用本地无模型解析，保留已明确设置的 MinerU／OXR 后端；云端解析仍需主动发起。
- MinerU 与 Semantic Scholar 密钥保存在本机密码管理器，只有点击「验证」才发送只读请求。
- 图表整组预览和摘录使用连续原图，保留外框内的旋转轴标题。首次保存新版截图可能创建独立笔记，不覆盖已有摘录。

### 修复

- 改善部分多子图和表格主体识别；图表及章节跳转不再等待相邻页的平滑动画。

## [0.2.2] - 2026-11-13

### 变更

- Picker 筛选或切换来源时保留仍匹配的选中项，区分加载、空结果和失败，并在取消时恢复原焦点。
- 图表摘录保存后留在列表，区分新建和复用；重复保存不另建笔记，不覆盖手工修改。

### 修复

- 从摘录笔记或本地引用 PDF 返回时，恢复原 PDF 的确切标签页、窗格和阅读位置。
- 修复摘录列表过高时保存按钮滚出视口的问题。

## [0.2.1] - 2026-11-13

### 新增

- 集成 Main、Reader 与 Note 键盘操作，以及在 Zotero 原生窗口运行的 React 面板。

### 变更

- 新配置默认使用原生笔记输入，Picker 默认允许鼠标操作；已有明确设置、自定义绑定和文库数据保留。

## [0.1.0] - 2026-09-18

### 新增

- 首批 Zotero Neo 键盘工作流，包括 PDF 阅读历史、链接跳转、Flash 文本选择，以及主窗口条目选择和标签工作区。
- 提供主题感知界面和快捷键自定义，并支持 Unicode 与输入法文本输入。

[未发布]: https://github.com/zhongyangchuwu/Zotero-Neo/compare/v0.5.3...main
[0.5.3]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.5.3
[0.5.2]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.5.2
[0.5.1]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.5.1
[0.5.0]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.5.0
[0.4.0]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.4.0
[0.3.0]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.3.0
[0.2.2]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.2.2
[0.2.1]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.2.1
[0.1.0]: https://github.com/zhongyangchuwu/Zotero-Neo/releases/tag/v0.1.0
[#347]: https://github.com/zhongyangchuwu/Zotero-Neo/pull/347
[#348]: https://github.com/zhongyangchuwu/Zotero-Neo/pull/348
