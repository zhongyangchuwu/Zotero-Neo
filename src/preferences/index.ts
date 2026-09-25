import { ZoteroPreferenceStore } from '../core/preference-store';
import {
  PREFERENCE_PREFIX,
  READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY,
  READER_INSERT_MODE_ENABLED_PREFERENCE_KEY,
  READER_MARKS_PERSIST_PREFERENCE_KEY,
  READER_SCROLL_MODE_PREFERENCE_KEY,
  READER_SCROLL_NUMBER_SPECS,
  READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
  READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY,
  normalizeReaderScrollNumber,
  readerDefaultHighlightColor,
  readerMarksPersist,
  readerModeEnabled,
  readerScrollConfig,
  type ReaderScrollNumberSetting,
  type ScrollMode,
} from '../core/preferences';
import { KEY_GUIDE_CONFIG } from '../input/key-guide-config';
import { encodeBindingOverrides, resolveBindings } from '../input/bindings';
import {
  INTERACTION_COLOR_PRESET_PREFERENCE_KEY,
  INTERACTION_MARKER_WIDTH_PREFERENCE_KEY,
  INTERACTION_STATUS_STYLE_PREFERENCE_KEY,
  interactionStatusStyleFromPreferences,
} from '../main/interaction-appearance';
import {
  APPEARANCE_PREFERENCE_KEY,
  THEME_VARS,
  ThemeManager,
  appearanceModeFromPreferences,
  type AppearanceMode,
  type ThemeRoot,
} from '../ui/theme';
import { mountBindingEditor, type MountedBindingEditor } from './binding-editor-view';
import { bindOpenNeoSettingsButton, type NeoSettingsRuntime } from './open-settings';
import {
  bindLegacyInteractionMarkerWidthSelect,
  bindLegacyInteractionThemeSelect,
} from './interaction-theme';

const PREFERENCE_BRANCH = `${PREFERENCE_PREFIX}.`;
const XUL_NAMESPACE = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const INITIAL_DELAY_MS = 50;
const MAX_DELAY_MS = 1_000;
const STATUS_DURATION_MS = 1_800;

type Language = 'en' | 'zh-CN';
type PreferenceValue = boolean | number | string;

interface XulCheckbox extends Element {
  checked: boolean;
}

interface XulMenuList extends Element {
  value: string;
}

const TEXT: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  en: {
    'zv.lang.label': 'Language',
    'zv.appearance': 'Appearance',
    'zv.appearance.help': 'Auto follows Zotero; Light and Dark override it for Neo panels.',
    'zv.appearance.mode': 'Theme',
    'zv.appearance.auto': 'Auto',
    'zv.appearance.light': 'Light',
    'zv.appearance.dark': 'Dark',
    'zv.settings.open': 'Open Neo Settings',
    'zv.settings.unavailable': 'Open a single Zotero Main window, then try again.',
    'zv.settings.opened': 'Neo Settings opened in the Main window.',
    'zv.mainAppearance': 'Main interaction appearance',
    'zv.mainAppearance.help':
      "Cursor keeps Zotero's native selected style; tune Selection and Visual markers and status.",
    'zv.mainAppearance.colorPreset': 'Color preset',
    'zv.mainAppearance.color.zotero': 'Zotero',
    'zv.mainAppearance.color.catppuccin': 'Catppuccin',
    'zv.mainAppearance.color.tokyo': 'Tokyo Night',
    'zv.mainAppearance.color.gruvbox': 'Gruvbox',
    'zv.mainAppearance.markerWidth': 'Marker width',
    'zv.mainAppearance.marker.1': '1px',
    'zv.mainAppearance.marker.2': '2px',
    'zv.mainAppearance.marker.3': '3px',
    'zv.mainAppearance.marker.4': '4px',
    'zv.mainAppearance.statusStyle': 'Status indicator',
    'zv.mainAppearance.status.neutral': 'Neutral',
    'zv.mainAppearance.status.tinted': 'Tinted',
    'zv.modes': 'Modes',
    'zv.mode.visual': 'Enable Select mode (v — Flash-select text and run actions)',
    'zv.mode.insert': 'Enable Insert / passthrough mode (i — disable vim keys temporarily)',
    'zv.scroll': 'Scroll',
    'zv.scroll.help': 'Pick one scrolling mode for j/k/zh/zl — only its parameters are shown.',
    'zv.scroll.mode': 'Scrolling mode',
    'zv.scroll.mode.step': 'Step scrolling',
    'zv.scroll.mode.follow': 'Constant-speed scrolling',
    'zv.scroll.mode.trapezoid': 'Accelerating (trapezoid curve)',
    'zv.scroll.step': 'Scroll step (pixels)',
    'zv.scroll.followSpeed': 'Scroll speed (px/s)',
    'zv.scroll.initialSpeed': 'Initial speed (px/s)',
    'zv.scroll.maxSpeed': 'Max speed (px/s)',
    'zv.scroll.accel': 'Acceleration (px/s²)',
    'zv.scroll.decel': 'Deceleration (px/s²)',
    'zv.scroll.stopOnRelease': 'Stop immediately on key release instead of decelerating',
    'zv.scroll.autosave': 'Scroll settings save automatically on change.',
    'zv.marks': 'Marks',
    'zv.marks.persist':
      "Persist marks in the parent item's Extra field (m / ` / dm) — survive restarts and sync",
    'zv.marks.staged': 'Marks settings save automatically on change.',
    'zv.keyGuide': 'Key guide',
    'zv.keyGuide.help':
      'Show valid pending-key continuations in Normal mode without intercepting text input.',
    'zv.keyGuide.enabled': 'Show the Prefix Guide',
    'zv.keyGuide.delay': 'Display delay (ms)',
    'zv.keyGuide.fontSize': 'Font size (px)',
    'zv.color.group': 'Default highlight colour',
    'zv.color.help':
      'Used when no explicit colour prefix is given (zh in the default bindings, if bound).',
    'zv.color.default': 'Default colour',
    'zv.color.opt.yellow': 'Yellow  (#FFD400)',
    'zv.color.opt.red': 'Red     (#FF6666)',
    'zv.color.opt.green': 'Green   (#5FB236)',
    'zv.color.opt.blue': 'Blue    (#2EA8E5)',
    'zv.color.opt.purple': 'Purple  (#A28AE5)',
    'zv.bindings': 'Keybindings',
    'zv.bindings.help1': 'Each row binds a key sequence in a given mode to an action.',
    'zv.bindings.help2a': 'Click a ',
    'zv.bindings.help2b': 'Key sequence',
    'zv.bindings.help2c': ' cell to edit it.',
    'zv.bindings.help3a': 'Letter case is preserved; use ',
    'zv.bindings.help3b': ' for Ctrl/Cmd (Neovim notation).',
    'zv.bindings.help4a': 'Multi-key sequences such as ',
    'zv.bindings.help4b': ' or ',
    'zv.bindings.help4c':
      ' are supported. Named keys use <Enter>, <Esc>, <F1>, <Space>; chords use forms such as <C-d>.',
    'zv.bindings.add': '+ Add binding',
    'zv.bindings.footer':
      'Appearance, key guide, Reader modes, marks, colour and scroll settings save automatically.',
    'zv.bindings.reset': 'Reset to defaults',
    'zv.bindings.mode': 'Mode',
    'zv.bindings.key': 'Key sequence',
    'zv.bindings.action': 'Action',
    'zv.bindings.apply': 'Apply bindings',
    'zv.bindings.status.dirty': 'Unsaved changes',
    'zv.bindings.status.invalid': 'Fix invalid rows before applying.',
    'zv.bindings.status.warning': 'Prefix conflicts detected; Apply is allowed.',
    'zv.bindings.error.empty': 'Enter a key sequence and action.',
    'zv.bindings.error.malformed': 'Invalid mode, key sequence, or action.',
    'zv.bindings.error.incompatible': 'Action is not supported in this mode.',
    'zv.bindings.error.duplicate': 'Duplicate mode and key sequence.',
    'zv.bindings.warning.prefix': 'Strict prefix of another sequence.',
    'zv.status.saved': 'Saved!',
    'zv.status.saveFailed': 'Could not save bindings.',
  },
  'zh-CN': {
    'zv.lang.label': '语言',
    'zv.appearance': '外观',
    'zv.appearance.help': '自动模式跟随 Zotero；浅色和深色仅覆盖 Neo 面板。',
    'zv.appearance.mode': '主题',
    'zv.appearance.auto': '自动',
    'zv.appearance.light': '浅色',
    'zv.appearance.dark': '深色',
    'zv.settings.open': '打开 Neo 设置',
    'zv.settings.unavailable': '请先打开一个 Zotero 主窗口，再重试。',
    'zv.settings.opened': '已在主窗口打开 Neo 设置。',
    'zv.mainAppearance': '主列表交互外观',
    'zv.mainAppearance.help':
      'Cursor 保持 Zotero 原生选中样式；这里调整 Selection / Visual 标记和状态提示。',
    'zv.mainAppearance.colorPreset': '配色方案',
    'zv.mainAppearance.color.zotero': 'Zotero',
    'zv.mainAppearance.color.catppuccin': 'Catppuccin',
    'zv.mainAppearance.color.tokyo': 'Tokyo Night',
    'zv.mainAppearance.color.gruvbox': 'Gruvbox',
    'zv.mainAppearance.markerWidth': '标记宽度',
    'zv.mainAppearance.marker.1': '1 像素',
    'zv.mainAppearance.marker.2': '2 像素',
    'zv.mainAppearance.marker.3': '3 像素',
    'zv.mainAppearance.marker.4': '4 像素',
    'zv.mainAppearance.statusStyle': '状态提示',
    'zv.mainAppearance.status.neutral': '中性',
    'zv.mainAppearance.status.tinted': '着色',
    'zv.modes': '模式',
    'zv.mode.visual': '启用选择模式（v — 用 Flash 选择文本并执行操作）',
    'zv.mode.insert': '启用插入 / 透传模式（i — 临时禁用 vim 按键）',
    'zv.scroll': '滚动',
    'zv.scroll.help': '为 j/k/zh/zl 选择一种滚动模式 — 仅显示当前模式的参数。',
    'zv.scroll.mode': '滚动模式',
    'zv.scroll.mode.step': '步进模式',
    'zv.scroll.mode.follow': '匀速跟随模式',
    'zv.scroll.mode.trapezoid': '梯形加速模式',
    'zv.scroll.step': '滚动步长（像素）',
    'zv.scroll.followSpeed': '滚动速度（px/s）',
    'zv.scroll.initialSpeed': '初始速度（px/s）',
    'zv.scroll.maxSpeed': '最大速度（px/s）',
    'zv.scroll.accel': '加速度（px/s²）',
    'zv.scroll.decel': '减速度（px/s²）',
    'zv.scroll.stopOnRelease': '松开按键立即停止而不是减速',
    'zv.scroll.autosave': '滚动设置在更改时自动保存。',
    'zv.marks': '标记',
    'zv.marks.persist': '将标记保存到父条目的 Extra 字段（m / ` / dm）— 重启后保留并同步',
    'zv.marks.staged': '标记设置在更改时自动保存。',
    'zv.keyGuide': '按键提示',
    'zv.keyGuide.help': '在普通模式中显示当前待定前缀的可用后续按键，不拦截文本输入。',
    'zv.keyGuide.enabled': '显示前缀按键提示',
    'zv.keyGuide.delay': '显示延迟（毫秒）',
    'zv.keyGuide.fontSize': '字体大小（像素）',
    'zv.color.group': '默认高亮颜色',
    'zv.color.help': '未按显式颜色前缀时使用（默认绑定中的 zh，若已绑定）。',
    'zv.color.default': '默认颜色',
    'zv.color.opt.yellow': '黄色  (#FFD400)',
    'zv.color.opt.red': '红色     (#FF6666)',
    'zv.color.opt.green': '绿色   (#5FB236)',
    'zv.color.opt.blue': '蓝色    (#2EA8E5)',
    'zv.color.opt.purple': '紫色  (#A28AE5)',
    'zv.bindings': '按键绑定',
    'zv.bindings.help1': '每一行将某个模式下的键序列绑定到一个动作。',
    'zv.bindings.help2a': '点击',
    'zv.bindings.help2b': '键序列',
    'zv.bindings.help2c': '单元格即可编辑。',
    'zv.bindings.help3a': '字母大小写会保留；Ctrl/Cmd 使用',
    'zv.bindings.help3b': '这样的 Neovim 记法。',
    'zv.bindings.help4a': '支持',
    'zv.bindings.help4b': '或',
    'zv.bindings.help4c': '等多键序列；命名键使用 <Enter>、<Esc>、<F1>、<Space>。',
    'zv.bindings.add': '+ 添加绑定',
    'zv.bindings.footer': '外观、按键提示、阅读器模式、标记、颜色与滚动设置在更改时自动保存。',
    'zv.bindings.reset': '重置为默认值',
    'zv.bindings.mode': '模式',
    'zv.bindings.key': '键序列',
    'zv.bindings.action': '动作',
    'zv.bindings.apply': '应用按键绑定',
    'zv.bindings.status.dirty': '有未保存的更改',
    'zv.bindings.status.invalid': '请先修正无效行。',
    'zv.bindings.status.warning': '检测到前缀冲突；仍可应用。',
    'zv.bindings.error.empty': '请输入键序列和动作。',
    'zv.bindings.error.malformed': '模式、键序列或动作无效。',
    'zv.bindings.error.incompatible': '此动作不受当前模式支持。',
    'zv.bindings.error.duplicate': '模式和键序列重复。',
    'zv.bindings.warning.prefix': '这是另一键序列的严格前缀。',
    'zv.status.saved': '已保存！',
    'zv.status.saveFailed': '按键绑定保存失败。',
  },
} as const satisfies Record<Language, Record<string, string>>;

const initializedDocuments = new WeakSet<Document>();
const observers = new WeakMap<Document, MutationObserver>();
const preferenceStore = new ZoteroPreferenceStore();

function getPreference(key: string, fallback: boolean): boolean;
function getPreference(key: string, fallback: number): number;
function getPreference(key: string, fallback: string): string;
function getPreference(key: string, fallback: PreferenceValue): PreferenceValue {
  try {
    const branch = Services.prefs;
    const fullKey = `${PREFERENCE_BRANCH}${key}`;
    switch (branch.getPrefType(fullKey)) {
      case 128:
        return branch.getBoolPref(fullKey);
      case 64:
        return branch.getIntPref(fullKey);
      case 0:
        return fallback;
      default:
        return branch.getStringPref(fullKey);
    }
  } catch {
    return fallback;
  }
}

function setPreference(key: string, value: PreferenceValue): boolean {
  try {
    const branch = Services.prefs;
    const fullKey = `${PREFERENCE_BRANCH}${key}`;
    if (typeof value === 'boolean') branch.setBoolPref(fullKey, value);
    else if (typeof value === 'number') branch.setIntPref(fullKey, value);
    else branch.setStringPref(fullKey, value);
    return true;
  } catch (error) {
    try {
      dump(`[ZoteroNeo] prefs set failed (${key}): ${String(error)}\n`);
    } catch {
      // Preference persistence is unavailable in this host compartment.
    }
    return false;
  }
}

function readLanguage(): Language | null {
  const value = getPreference('language', '');
  return value === 'en' || value === 'zh-CN' ? value : null;
}

function defaultLanguage(): Language {
  try {
    if (typeof Zotero !== 'undefined' && /^zh/i.test(Zotero.locale ?? '')) return 'zh-CN';
  } catch {
    // Fall through to the locale service.
  }
  try {
    if (/^zh/i.test(Services.locale.appLocaleAsBCP47)) return 'zh-CN';
  } catch {
    // English is the host-independent fallback.
  }
  return 'en';
}

function currentLanguage(): Language {
  return readLanguage() ?? defaultLanguage();
}

function translate(key: string, language: Language): string {
  return TEXT[language][key] ?? TEXT.en[key] ?? key;
}
function applyTranslations(doc: Document, language: Language): void {
  const elements = Array.from(doc.querySelectorAll('[data-i18n]')) as Element[];
  for (const element of elements) {
    const key = element.getAttribute('data-i18n');
    if (!key) continue;
    const text = translate(key, language);
    if (element.namespaceURI !== XUL_NAMESPACE) {
      element.textContent = text;
      continue;
    }
    switch (element.localName) {
      case 'label':
        element.setAttribute('value', text);
        break;
      case 'checkbox':
      case 'button':
      case 'menulist':
      case 'menuitem':
        element.setAttribute('label', text);
        break;
      default:
        element.textContent = text;
    }
  }
}

function byId<T extends Element>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

function clampInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : Math.max(minimum, Math.min(maximum, parsed));
}

function flashStatus(element: HTMLElement | null, text: string): void {
  if (!element) return;
  element.textContent = text;
  element.style.color = THEME_VARS.success;
  window.setTimeout(() => {
    element.textContent = '';
  }, STATUS_DURATION_MS);
}

function bindCheckbox(checkbox: XulCheckbox, onChange: (checked: boolean) => void): void {
  let lastValue = checkbox.checked;
  const handler = () => {
    if (checkbox.checked === lastValue) return;
    lastValue = checkbox.checked;
    onChange(lastValue);
  };
  checkbox.addEventListener('command', handler);
  checkbox.addEventListener('CheckboxStateChange', handler);
  checkbox.addEventListener('click', handler);
}

function saveCheckbox(checkbox: XulCheckbox, key: string, status: HTMLElement | null): void {
  bindCheckbox(checkbox, (checked) => {
    setPreference(key, checked);
    flashStatus(status, translate('zv.status.saved', currentLanguage()));
  });
}

function initializePane(doc: Document): void {
  if (initializedDocuments.has(doc)) return;
  const scrollInput = byId<HTMLInputElement>(doc, 'zv-scroll-step');
  if (!scrollInput) return;
  initializedDocuments.add(doc);
  observers.get(doc)?.disconnect();
  observers.delete(doc);
  let bindingView: MountedBindingEditor | null = null;
  const view = doc.defaultView;
  const paneRoot = byId<Element>(doc, 'zotero-neo-prefs') as ThemeRoot | null;
  let themeManager: ThemeManager | null = null;
  if (view && paneRoot) {
    themeManager = new ThemeManager(view, preferenceStore);
    themeManager.add(paneRoot);
    view.addEventListener(
      'unload',
      () => {
        bindingView?.dispose();
        themeManager?.dispose();
      },
      { once: true },
    );
  }

  const language = currentLanguage();
  const languageSelect = byId<XulMenuList>(doc, 'zv-language');
  if (languageSelect) {
    languageSelect.value = language;
    languageSelect.addEventListener('command', () => {
      const nextLanguage: Language = languageSelect.value === 'zh-CN' ? 'zh-CN' : 'en';
      bindingView?.dispatch({ type: 'set-language', language: nextLanguage });
      setPreference('language', nextLanguage);
      applyTranslations(doc, nextLanguage);
    });
  }
  applyTranslations(doc, language);
  bindOpenNeoSettingsButton(
    byId<HTMLElement>(doc, 'zv-open-neo-settings'),
    byId<HTMLElement>(doc, 'zv-open-neo-settings-status'),
    view,
    () => (Zotero as typeof Zotero & { Neo?: NeoSettingsRuntime }).Neo,
    (opened) =>
      translate(opened ? 'zv.settings.opened' : 'zv.settings.unavailable', currentLanguage()),
  );
  const appearanceSelect = byId<XulMenuList>(doc, 'zv-appearance-theme');
  if (appearanceSelect) {
    appearanceSelect.value = appearanceModeFromPreferences(preferenceStore);
    appearanceSelect.addEventListener('command', () => {
      const nextMode: AppearanceMode =
        appearanceSelect.value === 'light' || appearanceSelect.value === 'dark'
          ? appearanceSelect.value
          : 'auto';
      setPreference(APPEARANCE_PREFERENCE_KEY, nextMode);
      themeManager?.refresh();
      flashStatus(
        byId<HTMLElement>(doc, 'zv-appearance-status'),
        translate('zv.status.saved', currentLanguage()),
      );
    });
  }

  const interactionAppearanceStatus = byId<HTMLElement>(doc, 'zv-interaction-appearance-status');
  const colorPresetSelect = byId<XulMenuList>(doc, 'zv-interaction-color-preset');
  if (colorPresetSelect) {
    const unbind = bindLegacyInteractionThemeSelect(
      colorPresetSelect,
      doc,
      preferenceStore,
      (id) => {
        if (setPreference(INTERACTION_COLOR_PRESET_PREFERENCE_KEY, id)) {
          flashStatus(interactionAppearanceStatus, translate('zv.status.saved', currentLanguage()));
        }
      },
    );
    view?.addEventListener('unload', unbind, { once: true });
  }

  const markerWidthSelect = byId<XulMenuList>(doc, 'zv-interaction-marker-width');
  if (markerWidthSelect) {
    const unbind = bindLegacyInteractionMarkerWidthSelect(
      markerWidthSelect,
      preferenceStore,
      (width) => {
        if (setPreference(INTERACTION_MARKER_WIDTH_PREFERENCE_KEY, width))
          flashStatus(interactionAppearanceStatus, translate('zv.status.saved', currentLanguage()));
      },
    );
    view?.addEventListener('unload', unbind, { once: true });
  }

  const statusStyleSelect = byId<XulMenuList>(doc, 'zv-interaction-status-style');
  if (statusStyleSelect) {
    statusStyleSelect.value = interactionStatusStyleFromPreferences(preferenceStore);
    statusStyleSelect.addEventListener('command', () => {
      const next = statusStyleSelect.value === 'tinted' ? 'tinted' : 'neutral';
      setPreference(INTERACTION_STATUS_STYLE_PREFERENCE_KEY, next);
      flashStatus(interactionAppearanceStatus, translate('zv.status.saved', currentLanguage()));
    });
  }

  const modesStatus = byId<HTMLElement>(doc, 'zv-modes-status');
  const visualCheckbox = byId<XulCheckbox>(doc, 'zv-visual-enabled');
  if (visualCheckbox) {
    visualCheckbox.checked = readerModeEnabled(preferenceStore, 'visual');
    saveCheckbox(visualCheckbox, READER_VISUAL_MODE_ENABLED_PREFERENCE_KEY, modesStatus);
  }
  const insertCheckbox = byId<XulCheckbox>(doc, 'zv-insert-enabled');
  if (insertCheckbox) {
    insertCheckbox.checked = readerModeEnabled(preferenceStore, 'insert');
    saveCheckbox(insertCheckbox, READER_INSERT_MODE_ENABLED_PREFERENCE_KEY, modesStatus);
  }

  const marksCheckbox = byId<XulCheckbox>(doc, 'zv-marks-persist-enabled');
  if (marksCheckbox) {
    marksCheckbox.checked = readerMarksPersist(preferenceStore);
    saveCheckbox(
      marksCheckbox,
      READER_MARKS_PERSIST_PREFERENCE_KEY,
      byId<HTMLElement>(doc, 'zv-marks-config-status'),
    );
  }

  const keyGuideStatus = byId<HTMLElement>(doc, 'zv-key-guide-status');
  const keyGuideEnabled = byId<XulCheckbox>(doc, 'zv-key-guide-enabled');
  if (keyGuideEnabled) {
    keyGuideEnabled.checked = getPreference('keyGuide.enabled', true);
    saveCheckbox(keyGuideEnabled, 'keyGuide.enabled', keyGuideStatus);
  }
  const keyGuideDelay = byId<HTMLInputElement>(doc, 'zv-key-guide-delay');
  if (keyGuideDelay) {
    keyGuideDelay.min = '0';
    keyGuideDelay.max = String(KEY_GUIDE_CONFIG.maxDelayMs);
    keyGuideDelay.value = String(
      clampInteger(
        String(getPreference('keyGuide.delayMs', KEY_GUIDE_CONFIG.defaultDelayMs)),
        KEY_GUIDE_CONFIG.defaultDelayMs,
        0,
        KEY_GUIDE_CONFIG.maxDelayMs,
      ),
    );
    keyGuideDelay.addEventListener('change', () => {
      const delay = clampInteger(
        keyGuideDelay.value,
        KEY_GUIDE_CONFIG.defaultDelayMs,
        0,
        KEY_GUIDE_CONFIG.maxDelayMs,
      );
      keyGuideDelay.value = String(delay);
      setPreference('keyGuide.delayMs', delay);
      flashStatus(keyGuideStatus, translate('zv.status.saved', currentLanguage()));
    });
  }
  const keyGuideFontSize = byId<HTMLInputElement>(doc, 'zv-key-guide-font-size');
  if (keyGuideFontSize) {
    keyGuideFontSize.min = String(KEY_GUIDE_CONFIG.minFontSizePx);
    keyGuideFontSize.max = String(KEY_GUIDE_CONFIG.maxFontSizePx);
    keyGuideFontSize.value = String(
      clampInteger(
        String(getPreference('keyGuide.fontSizePx', KEY_GUIDE_CONFIG.defaultFontSizePx)),
        KEY_GUIDE_CONFIG.defaultFontSizePx,
        KEY_GUIDE_CONFIG.minFontSizePx,
        KEY_GUIDE_CONFIG.maxFontSizePx,
      ),
    );
    keyGuideFontSize.addEventListener('change', () => {
      const fontSize = clampInteger(
        keyGuideFontSize.value,
        KEY_GUIDE_CONFIG.defaultFontSizePx,
        KEY_GUIDE_CONFIG.minFontSizePx,
        KEY_GUIDE_CONFIG.maxFontSizePx,
      );
      keyGuideFontSize.value = String(fontSize);
      setPreference('keyGuide.fontSizePx', fontSize);
      flashStatus(keyGuideStatus, translate('zv.status.saved', currentLanguage()));
    });
  }

  const modeSelect = byId<XulMenuList>(doc, 'zv-scroll-mode');
  const followSpeedInput = byId<HTMLInputElement>(doc, 'zv-smooth-follow-speed');
  const initialSpeedInput = byId<HTMLInputElement>(doc, 'zv-smooth-initial-speed');
  const maxSpeedInput = byId<HTMLInputElement>(doc, 'zv-smooth-max-speed');
  const accelerationInput = byId<HTMLInputElement>(doc, 'zv-smooth-accel');
  const decelerationInput = byId<HTMLInputElement>(doc, 'zv-smooth-decel');
  const stopOnReleaseCheckbox = byId<XulCheckbox>(doc, 'zv-smooth-stop-on-release');
  const scrollStatus = byId<HTMLElement>(doc, 'zv-scroll-config-status');
  const stepRow = byId<HTMLElement>(doc, 'zv-scroll-step-row');
  const followRow = byId<HTMLElement>(doc, 'zv-scroll-follow-row');
  const trapezoidBlock = byId<HTMLElement>(doc, 'zv-scroll-trapezoid-block');
  const scrollConfig = readerScrollConfig(preferenceStore);
  scrollInput.value = String(scrollConfig.scrollStep);
  if (modeSelect) modeSelect.value = scrollConfig.mode;
  if (followSpeedInput) followSpeedInput.value = String(scrollConfig.followSpeed);
  if (initialSpeedInput) initialSpeedInput.value = String(scrollConfig.initialSpeed);
  if (maxSpeedInput) maxSpeedInput.value = String(scrollConfig.maxSpeed);
  if (accelerationInput) accelerationInput.value = String(scrollConfig.acceleration);
  if (decelerationInput) decelerationInput.value = String(scrollConfig.deceleration);
  if (stopOnReleaseCheckbox) stopOnReleaseCheckbox.checked = scrollConfig.stopOnRelease;

  const updateScrollModeUi = () => {
    const selectedMode = modeSelect?.value ?? scrollConfig.mode;
    if (stepRow) stepRow.hidden = selectedMode !== 'step';
    if (followRow) followRow.hidden = selectedMode !== 'follow';
    if (trapezoidBlock) trapezoidBlock.hidden = selectedMode !== 'trapezoid';
  };
  const scrollNumber = (setting: ReaderScrollNumberSetting, value: string | undefined): number =>
    normalizeReaderScrollNumber(setting, Number.parseInt(value ?? '', 10));
  const saveScrollConfiguration = () => {
    const scrollStep = scrollNumber('scrollStep', scrollInput.value);
    const followSpeed = scrollNumber('followSpeed', followSpeedInput?.value);
    const initialSpeed = scrollNumber('initialSpeed', initialSpeedInput?.value);
    const maximumSpeed = Math.max(
      scrollNumber('maxSpeed', maxSpeedInput?.value),
      initialSpeed,
    );
    const acceleration = scrollNumber('acceleration', accelerationInput?.value);
    const deceleration = scrollNumber('deceleration', decelerationInput?.value);
    scrollInput.value = String(scrollStep);
    if (followSpeedInput) followSpeedInput.value = String(followSpeed);
    if (initialSpeedInput) initialSpeedInput.value = String(initialSpeed);
    if (maxSpeedInput) maxSpeedInput.value = String(maximumSpeed);
    if (accelerationInput) accelerationInput.value = String(acceleration);
    if (decelerationInput) decelerationInput.value = String(deceleration);
    setPreference(READER_SCROLL_NUMBER_SPECS.scrollStep.key, scrollStep);
    setPreference(READER_SCROLL_NUMBER_SPECS.followSpeed.key, followSpeed);
    setPreference(READER_SCROLL_NUMBER_SPECS.initialSpeed.key, initialSpeed);
    setPreference(READER_SCROLL_NUMBER_SPECS.maxSpeed.key, maximumSpeed);
    setPreference(READER_SCROLL_NUMBER_SPECS.acceleration.key, acceleration);
    setPreference(READER_SCROLL_NUMBER_SPECS.deceleration.key, deceleration);
    setPreference(
      READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
      stopOnReleaseCheckbox?.checked ?? false,
    );
    flashStatus(scrollStatus, translate('zv.status.saved', currentLanguage()));
  };
  updateScrollModeUi();
  if (modeSelect) {
    modeSelect.addEventListener('command', () => {
      const nextMode: ScrollMode =
        modeSelect.value === 'step' ||
        modeSelect.value === 'follow' ||
        modeSelect.value === 'trapezoid'
          ? modeSelect.value
          : 'follow';
      modeSelect.value = nextMode;
      setPreference(READER_SCROLL_MODE_PREFERENCE_KEY, nextMode);
      updateScrollModeUi();
      flashStatus(scrollStatus, translate('zv.status.saved', currentLanguage()));
    });
  }
  scrollInput.addEventListener('change', saveScrollConfiguration);
  followSpeedInput?.addEventListener('change', saveScrollConfiguration);
  initialSpeedInput?.addEventListener('change', saveScrollConfiguration);
  maxSpeedInput?.addEventListener('change', saveScrollConfiguration);
  accelerationInput?.addEventListener('change', saveScrollConfiguration);
  decelerationInput?.addEventListener('change', saveScrollConfiguration);
  if (stopOnReleaseCheckbox)
    saveCheckbox(
      stopOnReleaseCheckbox,
      READER_SCROLL_STOP_ON_RELEASE_PREFERENCE_KEY,
      scrollStatus,
    );

  const colorSelect = byId<XulMenuList>(doc, 'zv-default-color');
  if (colorSelect) {
    colorSelect.value = readerDefaultHighlightColor(preferenceStore);
    colorSelect.addEventListener('command', () => {
      setPreference(READER_DEFAULT_HIGHLIGHT_COLOR_PREFERENCE_KEY, colorSelect.value);
      flashStatus(
        byId<HTMLElement>(doc, 'zv-default-color-status'),
        translate('zv.status.saved', currentLanguage()),
      );
    });
  }

  bindingView = mountBindingEditor({
    document: doc,
    root: byId<Element>(doc, 'zotero-neo-prefs') ?? doc.documentElement,
    baseline: resolveBindings(getPreference('bindings', '')),
    language,
    localize: translate,
    onSave(bindings) {
      return setPreference('bindings', encodeBindingOverrides(bindings));
    },
  });
}

export function initializePreferencesPane(doc: Document = document): void {
  let attempts = 0;
  const schedule = () => {
    if (initializedDocuments.has(doc)) return;
    const delay = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** Math.min(5, attempts));
    attempts += 1;
    window.setTimeout(() => {
      if (!initializedDocuments.has(doc)) {
        initializePane(doc);
        schedule();
      }
    }, delay);
  };
  observers.get(doc)?.disconnect();
  const observer = new MutationObserver(() => initializePane(doc));
  observers.set(doc, observer);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  initializePane(doc);
  schedule();
}

initializePreferencesPane();
