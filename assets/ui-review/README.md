# Zotero 原生界面截图

设置中心、Picker 和引用详情使用静态打包的 React，在 Zotero 原生窗口中运行；不再提供独立浏览器设计工作台。

| 界面 | Zotero 实机截图 |
| --- | --- |
| 设置中心与主题 | [设置中心](native-settings.png) |
| 快捷键编辑 | [快捷键](native-keybindings.png) |
| Picker 搜索与预览 | [Picker](native-picker.png) |
| 引用详情的本地匹配 | [引用详情](native-references.png) |

截图使用 Zotero 10.0.8 和隔离测试配置，数据为公开文献及测试条目。采集后正常退出并删除测试配置。文件尺寸、摘要及构建来源见 [capture-manifest.json](capture-manifest.json)。

`screenshots/` 保留之前的原生界面基线与浏览器设计图，属于历史资料，不代表当前生产界面。运行时边界见[架构说明](ARCHITECTURE_REVIEW.md)，实际开发和验证步骤见[开发指南](../../docs/DEVELOPMENT.md)。

本次在实际 Zotero 中检查了设置焦点循环、快捷键录制、Picker 搜索与确认、引用本地匹配、缓存空状态、重启和视图释放。键盘检查使用 Gecko 测试输入事务，不等同物理键盘或系统输入法认证；没有发起 AI 请求，也未进行实机联网元数据刷新。
