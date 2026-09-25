import { ZoteroPreferenceStore } from '../core/preference-store';
import { PREFERENCE_PREFIX } from '../core/preferences';
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

function initializePane(doc: Document): void {
  if (initializedDocuments.has(doc)) return;
  const paneRoot = byId<Element>(doc, 'zotero-neo-prefs') as ThemeRoot | null;
  if (!paneRoot) return;
  initializedDocuments.add(doc);
  observers.get(doc)?.disconnect();
  observers.delete(doc);
  const view = doc.defaultView;
  let themeManager: ThemeManager | null = null;
  if (view) {
    themeManager = new ThemeManager(view, preferenceStore);
    themeManager.add(paneRoot);
    view.addEventListener(
      'unload',
      () => {
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
