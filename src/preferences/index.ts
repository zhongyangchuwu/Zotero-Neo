import { ACTION_IDS, ACTION_LABELS, isActionId, type ActionId } from '../input/actions';
import {
  DEFAULT_BINDINGS,
  MODES,
  parseBindingKey,
  resolveBindings,
  type BindingMap,
  type Mode,
} from '../input/bindings';

const PREFERENCE_PREFIX = 'extensions.zotero-neo.';
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
    'zv.modes': 'Modes',
    'zv.mode.visual': 'Enable Visual mode (v — select text and annotate)',
    'zv.mode.insert': 'Enable Insert / passthrough mode (i — disable vim keys temporarily)',
    'zv.mode.noteEditor': 'Enable Vim-style editing in note editors (context pane and note tabs)',
    'zv.scroll': 'Scroll',
    'zv.scroll.help': 'Pick one scrolling mode for j/k/H/L — only its parameters are shown.',
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
    'zv.bindings.help3a': 'Use lowercase letters; prefix with ',
    'zv.bindings.help3b': ' for Ctrl/Cmd.',
    'zv.bindings.help4a': 'Multi-key sequences such as ',
    'zv.bindings.help4b': ' or ',
    'zv.bindings.help4c': ' are supported.',
    'zv.bindings.add': '+ Add binding',
    'zv.bindings.reset': 'Reset to defaults',
    'zv.bindings.mode': 'Mode',
    'zv.bindings.key': 'Key sequence',
    'zv.bindings.action': 'Action',
    'zv.bindings.footer': 'Modes, marks, colour and scroll settings save automatically.',
    'zv.bindings.apply': 'Apply bindings',
    'zv.status.saved': 'Saved!',
  },
  'zh-CN': {
    'zv.lang.label': '语言',
    'zv.modes': '模式',
    'zv.mode.visual': '启用可视模式（v — 选择文本并标注）',
    'zv.mode.insert': '启用插入 / 透传模式（i — 临时禁用 vim 按键）',
    'zv.mode.noteEditor': '在笔记编辑器中启用类 Vim 编辑（侧栏面板和笔记标签页）',
    'zv.scroll': '滚动',
    'zv.scroll.help': '为 j/k/H/L 选择一种滚动模式 — 仅显示当前模式的参数。',
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
    'zv.bindings.help3a': '使用小写字母；以',
    'zv.bindings.help3b': '前缀表示 Ctrl/Cmd。',
    'zv.bindings.help4a': '支持',
    'zv.bindings.help4b': '或',
    'zv.bindings.help4c': '等多键序列。',
    'zv.bindings.add': '+ 添加绑定',
    'zv.bindings.reset': '重置为默认值',
    'zv.bindings.mode': '模式',
    'zv.bindings.key': '键序列',
    'zv.bindings.action': '动作',
    'zv.bindings.footer': '模式、标记、颜色与滚动设置在更改时自动保存。',
    'zv.bindings.apply': '应用绑定',
    'zv.status.saved': '已保存！',
  },
} as const satisfies Record<Language, Record<string, string>>;

const SCROLL_DEFAULTS = {
  mode: 'follow',
  scrollStep: 60,
  followSpeed: 2_000,
  initialSpeed: 2_000,
  maxSpeed: 2_000,
  acceleration: 2_600,
  deceleration: 4_200,
  stopOnRelease: false,
} as const;
const MODE_ORDER: Readonly<Record<Mode, number>> = {
  normal: 0,
  visual: 1,
  cursor: 2,
  insert: 3,
  main: 4,
};

const initializedDocuments = new WeakSet<Document>();
const observers = new WeakMap<Document, MutationObserver>();

function getPreference(key: string, fallback: boolean): boolean;
function getPreference(key: string, fallback: number): number;
function getPreference(key: string, fallback: string): string;
function getPreference(key: string, fallback: PreferenceValue): PreferenceValue {
  try {
    const branch = Services.prefs;
    const fullKey = `${PREFERENCE_PREFIX}${key}`;
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

function hasPreference(key: string): boolean {
  try {
    return Services.prefs.getPrefType(`${PREFERENCE_PREFIX}${key}`) !== 0;
  } catch {
    return false;
  }
}

function setPreference(key: string, value: PreferenceValue): void {
  try {
    const branch = Services.prefs;
    const fullKey = `${PREFERENCE_PREFIX}${key}`;
    if (typeof value === 'boolean') branch.setBoolPref(fullKey, value);
    else if (typeof value === 'number') branch.setIntPref(fullKey, value);
    else branch.setStringPref(fullKey, value);
  } catch (error) {
    try {
      dump(`[ZoteroNeo] prefs set failed (${key}): ${String(error)}\n`);
    } catch {
      // Preference persistence is unavailable in this host compartment.
    }
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
  element.style.color = '#5FB236';
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

interface BindingRow {
  readonly mode: Mode;
  readonly key: string;
  readonly action: ActionId;
}

function bindingRows(bindings: BindingMap): BindingRow[] {
  return Object.entries(bindings)
    .flatMap(([fullKey, action]) => {
      const parsed = parseBindingKey(fullKey);
      return parsed ? [{ mode: parsed.mode, key: parsed.sequence, action }] : [];
    })
    .sort((left, right) => {
      const modeDelta = MODE_ORDER[left.mode] - MODE_ORDER[right.mode];
      return modeDelta !== 0 ? modeDelta : left.key.localeCompare(right.key);
    });
}

function makeBindingRow(
  doc: Document,
  mode: Mode,
  key: string,
  action: ActionId,
  isNew: boolean,
): HTMLTableRowElement {
  const row = doc.createElement('tr');
  row.style.borderBottom = '1px solid #eee';
  row.dataset.mode = mode;

  const modeCell = doc.createElement('td');
  modeCell.style.cssText =
    'padding:5px 10px;font-family:monospace;text-transform:uppercase;font-size:.85em;font-weight:bold;';
  if (isNew) {
    const modeSelect = doc.createElement('select');
    modeSelect.style.cssText = 'padding:2px 4px;font-family:monospace;';
    for (const candidate of MODES) {
      const option = doc.createElement('option');
      option.value = candidate;
      option.textContent = candidate;
      option.selected = candidate === mode;
      modeSelect.appendChild(option);
    }
    modeSelect.addEventListener('change', () => {
      row.dataset.mode = modeSelect.value;
    });
    modeCell.appendChild(modeSelect);
    row.dataset.newRow = '1';
  } else {
    modeCell.textContent = mode;
  }
  row.appendChild(modeCell);

  const keyCell = doc.createElement('td');
  keyCell.style.cssText = 'padding:5px 10px;';
  const keyInput = doc.createElement('input');
  keyInput.type = 'text';
  keyInput.value = key.replace(/^ /, '<space>');
  keyInput.style.cssText = 'font-family:monospace;width:120px;padding:2px 4px;';
  keyCell.appendChild(keyInput);
  row.appendChild(keyCell);

  const actionCell = doc.createElement('td');
  actionCell.style.cssText = 'padding:5px 10px;';
  const actionSelect = doc.createElement('select');
  actionSelect.style.cssText = 'width:100%;padding:2px 4px;';
  const language = currentLanguage();
  for (const candidate of ACTION_IDS) {
    const option = doc.createElement('option');
    option.value = candidate;
    option.textContent = ACTION_LABELS[candidate][language];
    option.selected = candidate === action;
    actionSelect.appendChild(option);
  }
  actionCell.appendChild(actionSelect);
  row.appendChild(actionCell);

  const deleteCell = doc.createElement('td');
  deleteCell.style.cssText = 'padding:5px 6px;text-align:center;';
  const deleteButton = doc.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = '×';
  deleteButton.style.cssText =
    'cursor:pointer;padding:0 6px;font-size:1.1em;background:none;border:1px solid #ccc;border-radius:3px;';
  deleteButton.addEventListener('click', () => row.remove());
  deleteCell.appendChild(deleteButton);
  row.appendChild(deleteCell);

  return row;
}

function renderBindingTable(doc: Document, bindings: BindingMap): void {
  const body = byId<HTMLTableSectionElement>(doc, 'zv-bindings-body');
  if (!body) return;
  body.replaceChildren();
  for (const { mode, key, action } of bindingRows(bindings)) {
    body.appendChild(makeBindingRow(doc, mode, key, action, false));
  }
}

function addBindingRow(doc: Document): void {
  const body = byId<HTMLTableSectionElement>(doc, 'zv-bindings-body');
  body?.appendChild(makeBindingRow(doc, 'normal', '', 'scrollDown', true));
}

function readBindingTable(doc: Document): Record<string, ActionId> {
  const body = byId<HTMLTableSectionElement>(doc, 'zv-bindings-body');
  if (!body) return {};
  const bindings: Record<string, ActionId> = {};
  const rows = Array.from(body.querySelectorAll('tr')) as HTMLTableRowElement[];
  for (const row of rows) {
    const selects = Array.from(row.querySelectorAll('select')) as HTMLSelectElement[];
    const keyInput = row.querySelector('input') as HTMLInputElement | null;
    const isNew = row.dataset.newRow === '1';
    const mode = isNew ? selects[0]?.value : row.cells.item(0)?.textContent?.trim().toLowerCase();
    const action = selects[isNew ? 1 : 0]?.value;
    const key = (keyInput?.value ?? '').replace(/^<space>/, ' ').replace(/\s+$/, '');
    const parsed = mode ? parseBindingKey(`${mode}:${key}`) : null;
    if (parsed && isActionId(action)) bindings[`${parsed.mode}:${parsed.sequence}`] = action;
  }
  return bindings;
}

function bindingsEqual(
  left: Readonly<Record<string, ActionId>>,
  right: Readonly<Record<string, ActionId>>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function saveBindings(doc: Document): void {
  const bindings = readBindingTable(doc);
  setPreference(
    'bindings',
    bindingsEqual(bindings, DEFAULT_BINDINGS) ? '' : JSON.stringify(bindings),
  );
}

function initializePane(doc: Document): void {
  if (initializedDocuments.has(doc)) return;
  const scrollInput = byId<HTMLInputElement>(doc, 'zv-scroll-step');
  if (!scrollInput) return;
  initializedDocuments.add(doc);
  observers.get(doc)?.disconnect();
  observers.delete(doc);

  const language = currentLanguage();
  const languageSelect = byId<XulMenuList>(doc, 'zv-language');
  if (languageSelect) {
    languageSelect.value = language;
    languageSelect.addEventListener('command', () => {
      const nextLanguage: Language = languageSelect.value === 'zh-CN' ? 'zh-CN' : 'en';
      setPreference('language', nextLanguage);
      applyTranslations(doc, nextLanguage);
      renderBindingTable(doc, readBindingTable(doc));
    });
  }
  applyTranslations(doc, language);

  const modesStatus = byId<HTMLElement>(doc, 'zv-modes-status');
  const visualCheckbox = byId<XulCheckbox>(doc, 'zv-visual-enabled');
  if (visualCheckbox) {
    visualCheckbox.checked = getPreference('mode.visual.enabled', true);
    saveCheckbox(visualCheckbox, 'mode.visual.enabled', modesStatus);
  }
  const insertCheckbox = byId<XulCheckbox>(doc, 'zv-insert-enabled');
  if (insertCheckbox) {
    insertCheckbox.checked = getPreference('mode.insert.enabled', true);
    saveCheckbox(insertCheckbox, 'mode.insert.enabled', modesStatus);
  }
  const noteEditorCheckbox = byId<XulCheckbox>(doc, 'zv-note-editor-enabled');
  if (noteEditorCheckbox) {
    noteEditorCheckbox.checked = getPreference('noteEditor.enabled', true);
    saveCheckbox(noteEditorCheckbox, 'noteEditor.enabled', modesStatus);
  }

  const marksCheckbox = byId<XulCheckbox>(doc, 'zv-marks-persist-enabled');
  if (marksCheckbox) {
    marksCheckbox.checked = getPreference('marks.persist', false);
    saveCheckbox(marksCheckbox, 'marks.persist', byId<HTMLElement>(doc, 'zv-marks-config-status'));
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
  const savedMode = getPreference('scroll.mode', '');
  const scrollMode =
    savedMode === 'step' || savedMode === 'follow' || savedMode === 'trapezoid'
      ? savedMode
      : hasPreference('smoothScroll')
        ? getPreference('smoothScroll', true)
          ? 'trapezoid'
          : 'step'
        : SCROLL_DEFAULTS.mode;
  scrollInput.value = String(getPreference('scrollStep', SCROLL_DEFAULTS.scrollStep));
  if (modeSelect) modeSelect.value = scrollMode;
  if (followSpeedInput)
    followSpeedInput.value = String(
      getPreference('smoothScroll.followSpeed', SCROLL_DEFAULTS.followSpeed),
    );
  if (initialSpeedInput)
    initialSpeedInput.value = String(
      getPreference('smoothScroll.initialSpeed', SCROLL_DEFAULTS.initialSpeed),
    );
  if (maxSpeedInput)
    maxSpeedInput.value = String(getPreference('smoothScroll.maxSpeed', SCROLL_DEFAULTS.maxSpeed));
  if (accelerationInput)
    accelerationInput.value = String(
      getPreference('smoothScroll.acceleration', SCROLL_DEFAULTS.acceleration),
    );
  if (decelerationInput)
    decelerationInput.value = String(
      getPreference('smoothScroll.deceleration', SCROLL_DEFAULTS.deceleration),
    );
  if (stopOnReleaseCheckbox)
    stopOnReleaseCheckbox.checked = getPreference(
      'smoothScroll.stopOnRelease',
      SCROLL_DEFAULTS.stopOnRelease,
    );

  const updateScrollModeUi = () => {
    const selectedMode = modeSelect?.value ?? scrollMode;
    if (stepRow) stepRow.hidden = selectedMode !== 'step';
    if (followRow) followRow.hidden = selectedMode !== 'follow';
    if (trapezoidBlock) trapezoidBlock.hidden = selectedMode !== 'trapezoid';
  };
  const saveScrollConfiguration = () => {
    const scrollStep = clampInteger(scrollInput.value, SCROLL_DEFAULTS.scrollStep, 10, 500);
    const followSpeed = clampInteger(
      followSpeedInput?.value,
      SCROLL_DEFAULTS.followSpeed,
      100,
      6_000,
    );
    const initialSpeed = clampInteger(
      initialSpeedInput?.value,
      SCROLL_DEFAULTS.initialSpeed,
      50,
      2_000,
    );
    const maximumSpeed = Math.max(
      clampInteger(maxSpeedInput?.value, SCROLL_DEFAULTS.maxSpeed, 100, 6_000),
      initialSpeed,
    );
    const acceleration = clampInteger(
      accelerationInput?.value,
      SCROLL_DEFAULTS.acceleration,
      100,
      10_000,
    );
    const deceleration = clampInteger(
      decelerationInput?.value,
      SCROLL_DEFAULTS.deceleration,
      100,
      12_000,
    );
    scrollInput.value = String(scrollStep);
    if (followSpeedInput) followSpeedInput.value = String(followSpeed);
    if (initialSpeedInput) initialSpeedInput.value = String(initialSpeed);
    if (maxSpeedInput) maxSpeedInput.value = String(maximumSpeed);
    if (accelerationInput) accelerationInput.value = String(acceleration);
    if (decelerationInput) decelerationInput.value = String(deceleration);
    setPreference('scrollStep', scrollStep);
    setPreference('smoothScroll.followSpeed', followSpeed);
    setPreference('smoothScroll.initialSpeed', initialSpeed);
    setPreference('smoothScroll.maxSpeed', maximumSpeed);
    setPreference('smoothScroll.acceleration', acceleration);
    setPreference('smoothScroll.deceleration', deceleration);
    setPreference('smoothScroll.stopOnRelease', stopOnReleaseCheckbox?.checked ?? false);
    flashStatus(scrollStatus, translate('zv.status.saved', currentLanguage()));
  };
  updateScrollModeUi();
  if (modeSelect) {
    modeSelect.addEventListener('command', () => {
      setPreference('scroll.mode', modeSelect.value);
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
    saveCheckbox(stopOnReleaseCheckbox, 'smoothScroll.stopOnRelease', scrollStatus);

  const colorSelect = byId<XulMenuList>(doc, 'zv-default-color');
  if (colorSelect) {
    colorSelect.value = getPreference('defaultHighlightColor', 'yellow');
    colorSelect.addEventListener('command', () => {
      setPreference('defaultHighlightColor', colorSelect.value);
      flashStatus(
        byId<HTMLElement>(doc, 'zv-default-color-status'),
        translate('zv.status.saved', currentLanguage()),
      );
    });
  }

  renderBindingTable(doc, resolveBindings(getPreference('bindings', '')));
  byId<HTMLButtonElement>(doc, 'zv-add-binding')?.addEventListener('click', () =>
    addBindingRow(doc),
  );
  byId<HTMLButtonElement>(doc, 'zv-reset-bindings')?.addEventListener('click', () => {
    renderBindingTable(doc, DEFAULT_BINDINGS);
    saveBindings(doc);
  });
  byId<HTMLButtonElement>(doc, 'zv-save')?.addEventListener('click', () => {
    saveBindings(doc);
    flashStatus(
      byId<HTMLElement>(doc, 'zv-save-status'),
      translate('zv.status.saved', currentLanguage()),
    );
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
