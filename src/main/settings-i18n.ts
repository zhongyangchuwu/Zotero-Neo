import { neoCommandLanguage, type PreferenceReader } from '../core/preferences';
import type { KeyGuideLanguage } from '../input/key-guide-config';

export type SettingsLanguage = KeyGuideLanguage;

const ZH = {
  'Zotero Neo Settings': 'Zotero Neo 设置',
  Close: '关闭',
  'Close Neo Settings': '关闭 Zotero Neo 设置',
  'Settings sections': '设置分区',
  Appearance: '外观',
  Interaction: '交互',
  Reader: '阅读器',
  Keybindings: '快捷键',
  Advanced: '高级',
  On: '开',
  Off: '关',

  'Marker width (px)': '标记宽度（px）',
  'Status style': '状态样式',
  Neutral: '中性',
  Tinted: '着色',
  Themes: '主题',
  Custom: '自定义',
  Active: '已启用',
  Edit: '编辑',
  'Confirm delete': '确认删除',
  Delete: '删除',
  '+ Custom': '+ 自定义',
  'Could not update appearance.': '无法更新外观设置。',
  'Could not select theme.': '无法选择主题。',
  'New theme': '新主题',
  'Could not add theme. Your edits are still here.': '无法添加主题，你的编辑仍会保留。',
  'Could not delete theme.': '无法删除主题。',
  'Could not activate theme for editing.': '无法启用要编辑的主题。',
  Saved: '已保存',
  'Could not save change. Previous theme is still active.': '无法保存更改，之前的主题仍然有效。',
  'Back to themes': '返回主题',
  Add: '添加',
  'Custom theme': '自定义主题',
  'Theme name': '主题名称',
  'Enter a name (1–100 characters).': '请输入 1–100 个字符的名称。',
  Light: '浅色',
  Dark: '深色',
  Black: '黑色',
  Red: '红色',
  Green: '绿色',
  Yellow: '黄色',
  Blue: '蓝色',
  Magenta: '品红',
  Cyan: '青色',
  White: '白色',
  'Use #RRGGBB': '请输入 #RRGGBB',
  'Theme preview': '主题预览',
  Selection: '选区',
  Visual: '可视',

  Picker: '选择器',
  'Mouse controls apply to all shared pickers, including items, collections, tags, tabs, and notes.':
    '鼠标控制适用于所有共享选择器，包括条目、分类、标签、标签页和笔记。',
  'Mouse row selection and double-click confirmation': '鼠标单击选择、双击确认',
  'Note editing': '笔记编辑',
  'Applies to Zotero context-pane notes and standalone note tabs.':
    '适用于 Zotero 上下文面板笔记和独立笔记标签页。',
  'Vim-style note editing': 'Vim 风格笔记编辑',
  'Could not update Interaction settings.': '无法更新交互设置。',

  Modes: '模式',
  'Text Select mode': '文本选择模式',
  'Allow v and Zotero text selections to enter Neo Select mode for selection actions.':
    '允许通过 v 或 Zotero 文本选择进入 Neo Select 模式以执行选区操作。',
  'Annotation comment editing': '批注评论编辑',
  "When enabled, i / Enter opens the selected annotation's comment editor. When disabled, i only enters passthrough Insert mode.":
    '启用后，i / Enter 会打开所选批注的评论编辑器；关闭后，i 只进入透传 Insert 模式。',
  Scrolling: '滚动',
  'Reader j/k/zh/zl use the selected motion model. Only controls for the active model are shown.':
    '阅读器中的 j/k/zh/zl 使用所选滚动模型，仅显示当前模型对应的参数。',
  'Scrolling mode': '滚动模式',
  Step: '步进',
  Constant: '恒速',
  Accelerating: '加速',
  'Scroll step (px)': '滚动步长（px）',
  'Scroll speed (px/s)': '滚动速度（px/s）',
  'Initial speed (px/s)': '初始速度（px/s）',
  'Max speed (px/s)': '最大速度（px/s）',
  'Acceleration (px/s²)': '加速度（px/s²）',
  'Deceleration (px/s²)': '减速度（px/s²）',
  'Stop immediately on key release': '松开按键时立即停止',
  'Otherwise accelerating scrolling decelerates after release.':
    '关闭时，加速滚动会在松开按键后逐渐减速。',
  Marks: '标记',
  'Persist marks': '持久化标记',
  "Store marks in the parent item's Extra field so they survive restarts and sync with the item.":
    '将标记存入父条目的 Extra 字段，使其可跨重启保留并随条目同步。',
  Annotations: '批注',
  'The default color is used when underlining selected text or adding a note without an explicit color.':
    '在给选中文本加下划线或添加未指定颜色的笔记时使用默认颜色。',
  'Default color': '默认颜色',
  Purple: '紫色',
  'Could not update Reader settings.': '无法更新阅读器设置。',

  'Prefix Guide': '前缀提示',
  'Show valid continuations while a multi-key command prefix is pending.':
    '等待多键命令后续按键时显示可用的继续输入。',
  'Show Prefix Guide': '显示前缀提示',
  'Display delay (ms)': '显示延迟（ms）',
  'Font size (px)': '字号（px）',
  Bindings: '绑定',
  'Edit mode + key sequence + action rows, then Apply. Named keys use <Enter>, <Esc>, <F1>, <Space>; chords use forms such as <C-d>.':
    '编辑模式、按键序列和动作后点击应用。命名按键使用 <Enter>、<Esc>、<F1>、<Space>；组合键使用 <C-d> 等形式。',
  '+ Add binding': '+ 添加绑定',
  'Reset to defaults': '恢复默认',
  Mode: '模式',
  'Key sequence': '按键序列',
  Action: '动作',
  'Apply bindings': '应用绑定',
  'Unsaved changes': '有未保存的更改',
  'Fix invalid rows before applying.': '请先修复无效行再应用。',
  'Prefix conflicts detected; Apply is allowed.': '检测到前缀冲突，但仍允许应用。',
  'Enter a key sequence and action.': '请输入按键序列和动作。',
  'Invalid mode, key sequence, or action.': '模式、按键序列或动作无效。',
  'Action is not supported in this mode.': '该模式不支持此动作。',
  'Duplicate mode and key sequence.': '模式与按键序列重复。',
  'Strict prefix of another sequence.': '是另一按键序列的严格前缀。',
  'Saved.': '已保存。',
  'Could not save bindings.': '无法保存快捷键绑定。',
  'Delete binding': '删除绑定',
  'Could not update Prefix Guide settings.': '无法更新前缀提示设置。',

  'Interface and command language': '界面与命令语言',
  "Controls Neo Settings and localized command labels in Prefix Guide, Command Palette, and Keybindings. Follow Zotero uses the host locale.":
    '控制 Neo 设置界面，以及前缀提示、命令面板和快捷键中的本地化命令名称。“跟随 Zotero”使用宿主语言。',
  'Follow Zotero': '跟随 Zotero',
  English: 'English',
  中文: '中文',
  Language: '语言',
  'Changes the Neo Settings interface and localized command labels immediately.':
    '立即切换 Neo 设置界面和本地化命令名称。',
  'Tag namespaces': '标签命名空间',
  'Neo can interpret ordinary Zotero tag strings as virtual paths inside tag pickers without changing stored tag data.':
    'Neo 可在标签选择器中将普通 Zotero 标签字符串解释为虚拟路径，而不会修改已存储的标签数据。',
  'Namespace separator': '命名空间分隔符',
  "Default '/'. Leave empty for completely flat tag matching; existing Zotero tags are never rewritten.":
    "默认使用 '/'。留空表示完全扁平的标签匹配；已有 Zotero 标签不会被改写。",
  'Could not update Advanced settings.': '无法更新高级设置。',
} as const;

export type SettingsMessage = keyof typeof ZH;

export function settingsLanguage(
  preferences: PreferenceReader,
  hostLocale: string,
): SettingsLanguage {
  return neoCommandLanguage(preferences, hostLocale);
}

export function settingsText(language: SettingsLanguage, message: SettingsMessage): string {
  return language === 'zh-CN' ? ZH[message] : message;
}

export function settingsToggleLabels(language: SettingsLanguage): {
  readonly on: string;
  readonly off: string;
} {
  return {
    on: settingsText(language, 'On'),
    off: settingsText(language, 'Off'),
  };
}
