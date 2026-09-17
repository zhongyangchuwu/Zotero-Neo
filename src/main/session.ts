import { CleanupScope } from '../core/cleanup';
import type { CompositionState } from '../input/composition';
import type { Mode } from '../input/bindings';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { KeyGuide } from '../ui/key-guide';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import type { PickerProvider, PickerProviderCommands } from './picker/types';
import type { PickerItem, PickerScope } from './picker/model';

export type MainPanel = 'collections' | 'items';
export type NoteMode = 'normal' | 'insert';
export type BrowserTimer = number;

/** All mutable UI state belongs to one Zotero main window. */
export class MainWindowSession {
  readonly cleanup = new CleanupScope();
  readonly window: MainWindow;
  readonly status: HTMLElement;
  readonly theme: ThemeManager;
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
    lastKey: string | null;
    yTimer: BrowserTimer | undefined;
    focusPane: 'search' | 'list' | 'preview';
    tagMode: 'list' | 'query';
    command: string;
    commandTimer: BrowserTimer | undefined;
    tagScope: 'current' | 'library';
    tagSelection: string[];
    tagMatchCount: number | null;
    provider: PickerProvider | null;
    commands: PickerProviderCommands | null;
    queue: Promise<void>;
    lastDeletedNoteID: number | null;
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
    lastKey: null,
    yTimer: undefined,
    previousElement: null,
    focusPane: 'search',
    tagMode: 'list',
    command: '',
    commandTimer: undefined,
    tagScope: 'current',
    tagSelection: [],
    tagMatchCount: null,
    provider: null,
    commands: null,
    queue: Promise.resolve(),
    lastDeletedNoteID: null,
    inputCleanup: null,
    layout: 'dual',
    previousWindow: null,
    themeCleanup: null,
  };
  note: {
    editorWindow: Window | null;
    editorDocument: Document | null;
    handler: EventListener | null;
    mode: NoteMode;
    buffer: string;
    mainBuffer: string;
    mainTimer: BrowserTimer | undefined;
    mainRevision: number;
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
    mainTimer: undefined,
    mainRevision: 0,
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
    this.cleanup.add(() => {
      this.inputRevision += 1;
      this.window.clearTimeout(this.keyTimer);
      this.keyTimer = undefined;
    });
    this.cleanup.add(() => {
      this.window.clearTimeout(this.keyGuideTimer);
      this.keyGuide.hide();
    });
    this.cleanup.add(() => this.status.remove());
  }
  dispose(): void {
    this.cleanup.dispose();
  }
}
