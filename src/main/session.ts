import { CleanupScope } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import type { ActionId } from '../input/actions';
import { THEME_VARS, ThemeManager } from '../ui/theme';

export type MainPanel = 'collections' | 'items';
export type NoteMode = 'normal' | 'insert';
export type PickerScope = 'all' | 'collection' | 'tabs';
export interface PickerItem {
  id: string | number;
  title: string;
  search: string;
  citekey?: string;
  author?: string;
  year?: string;
  kind?: string;
  selected?: boolean;
}
export interface NoteRow {
  id: number;
  title: string;
  text: string;
  meta: string;
  dateModified: string;
}
export interface NoteEntry {
  section: 'current' | 'all';
  row: NoteRow;
}
export type BrowserTimer = number;

/** All mutable UI state belongs to one Zotero main window. */
export class MainWindowSession {
  readonly cleanup = new CleanupScope();
  readonly window: MainWindow;
  readonly status: HTMLElement;
  readonly theme: ThemeManager;
  activePanel: MainPanel = 'items';
  keyBuffer = '';
  countBuffer = '';
  keyTimer: BrowserTimer | undefined;
  navigationRepeatAction: Extract<ActionId, 'mainNavDown' | 'mainNavUp'> | null = null;
  navigationRepeatAt = 0;
  picker: {
    open: boolean;
    scope: PickerScope;
    overlay: HTMLElement | null;
    input: HTMLInputElement | null;
    results: HTMLElement | null;
    items: PickerItem[];
    filtered: PickerItem[];
    selected: number;
    lastKey: string | null;
    yTimer: BrowserTimer | undefined;
    previousElement: Element | null;
    previousWindow: Window | null;
    themeCleanup: (() => void) | null;
  } = {
    open: false,
    scope: 'all',
    overlay: null,
    input: null,
    results: null,
    items: [],
    filtered: [],
    selected: 0,
    lastKey: null,
    yTimer: undefined,
    previousElement: null,
    previousWindow: null,
    themeCleanup: null,
  };
  notes: {
    open: boolean;
    overlay: HTMLElement | null;
    status: HTMLElement | null;
    list: HTMLElement | null;
    preview: HTMLElement | null;
    current: NoteRow[];
    all: NoteRow[];
    entries: NoteEntry[];
    selected: number;
    pane: 'list' | 'preview';
    hint: string;
    hintTimer: BrowserTimer | undefined;
    command: string;
    commandTimer: BrowserTimer | undefined;
    themeCleanup: (() => void) | null;
  } = {
    open: false,
    overlay: null,
    status: null,
    list: null,
    preview: null,
    current: [],
    all: [],
    entries: [],
    selected: 0,
    pane: 'list',
    hint: '',
    hintTimer: undefined,
    command: '',
    commandTimer: undefined,
    themeCleanup: null,
  };
  note: {
    editorWindow: Window | null;
    editorDocument: Document | null;
    handler: EventListener | null;
    mode: NoteMode;
    buffer: string;
    mainBuffer: string;
    count: string;
    timer: BrowserTimer | undefined;
    yank: string;
  } = {
    editorWindow: null,
    editorDocument: null,
    handler: null,
    mode: 'normal',
    buffer: '',
    mainBuffer: '',
    count: '',
    timer: undefined,
    yank: '',
  };
  constructor(window: MainWindow, preferences: PreferenceStore) {
    this.window = window;
    this.theme = new ThemeManager(window, preferences);
    this.cleanup.add(() => this.theme.dispose());
    const doc = window.document;
    this.status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.status.style.cssText = `position:fixed;bottom:10px;right:14px;z-index:99999;font:bold 12px/1.4 monospace;color:${THEME_VARS.onAccent};background:${THEME_VARS.surface};padding:2px 8px;border:1px solid ${THEME_VARS.border};border-radius:3px;pointer-events:none;display:none;user-select:none;box-shadow:0 4px 16px ${THEME_VARS.shadow}`;
    (doc.body ?? doc.documentElement).append(this.status);
    this.theme.add(this.status);
    this.cleanup.add(() => this.status.remove());
  }
  dispose(): void {
    this.cleanup.dispose();
  }
}
