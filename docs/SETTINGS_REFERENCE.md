# 设置参考 {#settings-reference}

本页维护控件和默认值。修改绑定、保存与选择设置的方法见[设置指南](SETTINGS_GUIDE.md)。普通偏好通常立即保存；快捷键编辑需点击**应用绑定**，模块请求需单独保存并重启 Zotero。

| 控件 | 默认值 | 作用 |
| --- | --- | --- |
| 主题 | Zotero | 交互配色，可选 Zotero、Catppuccin、Tokyo Night、Gruvbox 或自定义主题。 |
| 标记宽度（px） | 3 px | Main Cursor 和 Select 标记宽度，可选 1–4 px。 |
| 状态样式 | 中性 | 状态指示器可选中性或着色。 |
| 文本选择模式 | 开 | 允许 `v` 或原生 Zotero 文本选择进入 Reader Select。 |
| 批注评论编辑 | 开 | 允许 Reader Normal 的 `i` / `Enter` 编辑选中批注；关闭后 `i` 改为原生输入透传。 |
| Vim 风格笔记编辑 | 开 | 在上下文面板和独立 Note 标签页中启用 Vim 编辑。 |
| 滚动模式 | 恒速 | 可选步进、恒速、加速；只显示当前模式的参数。 |
| 滚动步长（px） | 60 px | 步进模式下每次 `j` / `k` / `zh` / `zl` 的距离；count 乘以步长。 |
| 滚动速度（px/s） | 2000 px/s | 恒速模式按住按键时的速度。 |
| 初始速度（px/s） | 2000 px/s | 加速模式起始速度。 |
| 最大速度（px/s） | 2000 px/s | 加速模式最大速度。 |
| 加速度（px/s²） | 2600 px/s² | 按住滚动键后的速度增量。 |
| 减速度（px/s²） | 4200 px/s² | 松开滚动键后的减速量。 |
| 松开按键时立即停止 | 关 | 加速模式松键后立即停止，不再逐渐减速。 |
| 持久化标记 | 关 | marks 存入父条目的 Extra；独立 PDF 使用附件的 Extra。写入失败时回退到不同步的本地偏好。 |
| 默认颜色 | 黄色 | 未明确指定颜色的下划线或 Add note 使用此颜色。 |
| 显示前缀提示 | 开 | 多键命令等待期间显示可用后续按键；Main、Reader 和 Note 默认命令前缀为 `<Space>`。 |
| 显示延迟（ms） | 200 ms | 前缀提示显示前的延迟，范围 0–1000 ms。 |
| 字号（px） | 15 px | 前缀提示字号，范围 12–24 px。 |
| 鼠标单击选择、双击确认 | 关 | 开启后单击选择、双击确认共享选择器结果；悬停不选择。 |
| 语言 | 跟随 Zotero | 本地化设置与命令标签，也可固定为 English 或中文。 |
| 命名空间分隔符 | `/` | 将扁平标签显示为虚拟路径；留空则按平面标签匹配。 |

Neo 面板跟随 Zotero 计算出的浅色或深色配色。快捷键草稿操作见[修改快捷键](SETTINGS_GUIDE.md#try-it)。

## 模块 {#modules}

模块偏好为 `extensions.zotero-neo.modules.<id>.enabled`，类型为布尔值，全部默认 `true`。设置中的**请求启用**编辑草稿，**保存模块请求**写入偏好；当前已应用图只在下一次重启 Zotero 时改变，Neo 重载不会提前应用。

| 模块 ID | 名称 | 功能与依赖 |
| --- | --- | --- |
| `library` | 文库 | 树导航、条目查找、搜索入口、打开、标识符录入、citekey 和最近回收批次。 |
| `worksets` | 工作集 | Persistent Selection、Visual 和 Selection Panel；停用后 Main 标签/分类操作仍可使用 CurrentTarget，不读取旧 Selection。 |
| `tags` | 标签 | 添加/移除标签及 Main 标签过滤。 |
| `collections` | 分类 | 分类查找、成员关系及结构工作流。 |
| `reader-navigation` | 阅读导航 | 页面、滚动、缩放、搜索、位置遍历、marks 与原生侧栏增强。 |
| `reader-selection` | 阅读选区 | Select、范围动作、Flash、复制/搜索所选文本和 Selection Actions。 |
| `reader-annotations` | 阅读批注 | 批注创建、删除、改色、过滤、复制和评论编辑。 |
| `reader-hints` | 阅读提示 | copy/link hints；读取 Zotero 原生批注不依赖阅读批注模块。 |
| `notes` | 笔记 | Note 查找、打开及可选 Vim 编辑。 |
| `capture` | 摘录 | 将 Reader 选区追加到已有 Note；必需依赖为 `reader-selection` 和 `notes`。Reader 还需实际关联 Main 的 Notes/Capture 实例可用。 |
| `workspace` | 工作区 | 标签页操作、Show in Library、Reader 分屏与方向焦点；不依赖 `library` 或 `reader-navigation`。 |
| `extensions` | 扩展 | 已安装 Zotero 扩展的 Plugin Manager；不管理 Neo 内部模块。 |

| 运行状态 | 含义 |
| --- | --- |
| 已启用（Enabled） | 当前宿主中的模块激活成功。 |
| 已停用（Disabled） | 当前已应用请求关闭；不创建功能实例，贡献不参与按键、前缀提示或 Palette。 |
| 已阻止（Blocked） | 当前启用图或实际宿主缺少必需依赖；界面列出依赖，不自动修改开关。 |
| 失败（Failed） | 当前宿主实例激活失败，已退休其入口并尝试清理部分资源；显示失败原因，详细日志保留原错误。该实例不自动重试，新宿主实例或重启 Zotero 可重新激活。 |
| 等待主机（Pending host） | 尚未在支持的宿主激活，例如还没有打开 Reader。 |
| 等待重启（Pending restart） | 保存请求与已应用值不同，附加在当前状态后；当前能力不提前变化。 |

草稿、已保存请求与已应用值分别显示。**草稿依赖影响**仅预览下次启用图，不阻止保存，也不自动切换其他模块。**恢复默认模块请求**只清除十二个模块偏好；恢复后仍需重启 Zotero。

旧开关不等于模块开关：`noteEditor.enabled=false` 只关闭 Vim 编辑，不关闭 Note 查找或摘录目的地；`annotationCommentEditor.enabled=false` 不关闭 Select 的 Add note 或原生评论；`marks.persist=false` 仍允许会话内 marks。停用模块不清除绑定、marks、主题、行为偏好或原生数据。

Settings、共享焦点与 Back/Forward 属于基座，不随可选模块停用。全部关闭后，仍可从 Zotero 原生偏好页的 **Open Neo Settings** 或 `Zotero.Neo.openSettings` 恢复配置，操作步骤见[模块设置指南](SETTINGS_GUIDE.md#modules)。
