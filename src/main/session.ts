import { CleanupScope } from '../core/cleanup';
import type { CompositionState } from '../input/composition';
import type { Mode } from '../input/bindings';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { KeyGuide } from '../ui/key-guide';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import type { PickerConfirm, PickerProvider } from './picker/types';
import type { PickerItem, PickerScope } from './picker/model';
import type { InstalledPlugin } from './plugin-host';
import { SelectionStore } from './selection-store';

export type MainPanel = 'collections' | 'items';
export type NoteMode = 'normal' | 'insert';
export type BrowserTimer = number;

/** All mutable UI state belongs to one Zotero main window. */
export class MainWindowSession {
  readonly cleanup = new CleanupScope();
  readonly window: MainWindow;
  readonly status: HTMLElement;
  readonly theme: ThemeManager;
  readonly selection = new SelectionStore();
  activePanel: MainPanel = 'items';
  inputMode: Extract<Mode, 'main-normal' | 'main-select'> = 'main-normal';
  keyBuffer = '';
  countBuffer = '';
  keyTimer: BrowserTimer | undefined;
  inputRevision = 0;
  readonly keyGuide = new KeyGuide();
  keyGuideTimer: BrowserTimer | undefined;
  trashedItemIDs: number[] = [];
  picker: {
    open: boolean;
    generation: number;
    scope: PickerScope;
    overlay: HTMLElement | null;
    input: HTMLInputElement | null;
    composition: CompositionState;
    results: HTMLElement | null;
    preview: HTMLElement | null;
    count: HTMLElement | null;
    previewTitle: HTMLElement | null;
    help: HTMLElement | null;
    queryHelp: HTMLElement | null;
    listHelp: HTMLElement | null;
    items: PickerItem[];
    filtered: PickerItem[];
    selected: number;
    focusPane: 'search' | 'list' | 'preview';
    provider: PickerProvider | null;
    confirm: PickerConfirm | null;
    closeBeforeConfirm: boolean;
    queue: Promise<void>;
    inputCleanup: (() => void) | null;
    layout: 'dual' | 'single';
    previousElement: Element | null;
    previousWindow: Window | null;
    themeCleanup: (() => void) | null;
  } = {
    open: false,
    generation: 0,
    scope: 'all',
    overlay: null,
    input: null,
    composition: { active: false },
    results: null,
    preview: null,
    items: [],
    filtered: [],
    count: null,
    previewTitle: null,
    help: null,
    queryHelp: null,
    listHelp: null,
    selected: 0,
    previousElement: null,
    focusPane: 'search',
    provider: null,
    confirm: null,
    closeBeforeConfirm: false,
    queue: Promise.resolve(),
    inputCleanup: null,
    layout: 'dual',
    previousWindow: null,
    themeCleanup: null,
  };
  pluginManager: {
    open: boolean;
    generation: number;
    loading: boolean;
    busy: boolean;
    error: string;
    notice: string;
    plugins: InstalledPlugin[];
    filtered: InstalledPlugin[];
    selected: number;
    query: string;
    commandBuffer: string;
    commandTimer: BrowserTimer | undefined;
    overlay: HTMLElement | null;
    list: HTMLElement | null;
    details: HTMLElement | null;
    count: HTMLElement | null;
    input: HTMLInputElement | null;
    footer: HTMLElement | null;
    previousElement: Element | null;
    inputCleanup: (() => void) | null;
    themeCleanup: (() => void) | null;
  } = {
    open: false,
    generation: 0,
    loading: false,
    busy: false,
    error: '',
    notice: '',
    plugins: [],
    filtered: [],
    selected: 0,
    query: '',
    commandBuffer: '',
    commandTimer: undefined,
    overlay: null,
    list: null,
    details: null,
    count: null,
    input: null,
    footer: null,
    previousElement: null,
    inputCleanup: null,
    themeCleanup: null,
  };
  note: {
    editorWindow: Window | null;
    editorDocument: Document | null;
    handler: EventListener | null;
    mode: NoteMode;
    buffer: string;
    count: string;
    timer: BrowserTimer | undefined;
    inputRevision: number;
    yank: string;
  } = {
    editorWindow: null,
    editorDocument: null,
    handler: null,
    mode: 'normal',
    buffer: '',
    count: '',
    timer: undefined,
    inputRevision: 0,
    yank: '',
  };
  constructor(window: MainWindow, preferences: PreferenceStore) {
    this.window = window;
    this.theme = new ThemeManager(window, preferences);
    this.cleanup.add(() => this.theme.dispose());
    const doc = window.document;
    this.status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.status.style.cssText = `position:fixed;bottom:10px;right:14px;z-index:99999;font:bold 12px/1.4 monospace;color:${THEME_VARS.text};background:${THEME_VARS.surface};padding:2px 8px;border:1px solid ${THEME_VARS.border};border-radius:3px;pointer-events:none;display:none;user-select:none;box-shadow:0 4px 16px ${THEME_VARS.shadow}`;
    (doc.body ?? doc.documentElement).append(this.status);
    this.theme.add(this.status);
    this.cleanup.add(() => {
      this.inputRevision += 1;
      this.window.clearTimeout(this.keyTimer);
      this.keyTimer = undefined;
    });
    this.cleanup.add(() => {
      this.window.clearTimeout(this.keyGuideTimer);
      this.keyGuide.hide();
    });
    this.cleanup.add(() => {
      this.window.clearTimeout(this.pluginManager.commandTimer);
      this.pluginManager.commandTimer = undefined;
    });
    this.cleanup.add(() => this.status.remove());
  }
  dispose(): void {
    this.cleanup.dispose();
  }
}
