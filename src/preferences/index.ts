import { ZoteroPreferenceStore } from '../core/preference-store';
import { PREFERENCE_PREFIX } from '../core/preferences';
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
    'zv.keyGuide': 'Key guide',
    'zv.keyGuide.help':
      'Show valid pending-key continuations in Normal mode without intercepting text input.',
    'zv.keyGuide.enabled': 'Show the Prefix Guide',
    'zv.keyGuide.delay': 'Display delay (ms)',
    'zv.keyGuide.fontSize': 'Font size (px)',
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
    'zv.bindings.footer': 'Appearance and key guide settings save automatically.',
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
    'zv.keyGuide': '按键提示',
    'zv.keyGuide.help': '在普通模式中显示当前待定前缀的可用后续按键，不拦截文本输入。',
    'zv.keyGuide.enabled': '显示前缀按键提示',
    'zv.keyGuide.delay': '显示延迟（毫秒）',
    'zv.keyGuide.fontSize': '字体大小（像素）',
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
    'zv.bindings.footer': '外观与按键提示设置在更改时自动保存。',
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
  const paneRoot = byId<Element>(doc, 'zotero-neo-prefs') as ThemeRoot | null;
  if (!paneRoot) return;
  initializedDocuments.add(doc);
  observers.get(doc)?.disconnect();
  observers.delete(doc);
  let bindingView: MountedBindingEditor | null = null;
  const view = doc.defaultView;
  let themeManager: ThemeManager | null = null;
  if (view) {
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
