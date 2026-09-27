import { CleanupScope } from '../core/cleanup';
import { InputRuntime } from '../input/runtime';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { PrefixGuideRuntime } from '../ui/key-guide-runtime';
import { THEME_VARS, ThemeManager } from '../ui/theme';
import { PickerRuntime } from './picker/runtime';
import type { InstalledPlugin } from './plugin-host';
import { SelectionStore } from './selection-store';
import { SelectionPanelRuntime } from './selection-panel-runtime';
import { InteractionAppearanceManager } from './interaction-appearance';
import type { MainReturnBookmark } from './return-context';
import { SettingsCenter } from './settings-center';
import { MainFocusOwnership } from './focus-ownership';
import { MainLocalFindRuntime } from './local-find-runtime';

export type MainPanel = 'collections' | 'items';
export type NoteMode = 'normal' | 'insert';
export type BrowserTimer = number;

/** All mutable UI state belongs to one Zotero main window. */
export class MainWindowSession {
  readonly cleanup = new CleanupScope();
  readonly window: MainWindow;
  readonly status: HTMLElement;
  readonly theme: ThemeManager;
  readonly interactionAppearance: InteractionAppearanceManager;
  readonly settings: SettingsCenter;
  readonly focusOwnership: MainFocusOwnership;
  readonly selection = new SelectionStore();
  activePanel: MainPanel = 'items';
  readonly input: InputRuntime;
  readonly prefixGuide: PrefixGuideRuntime;
  trashedItemIDs: number[] = [];
  returnBookmark: MainReturnBookmark | null = null;
  readonly picker = new PickerRuntime();
  readonly localFind = new MainLocalFindRuntime();
  readonly selectionPanel = new SelectionPanelRuntime();
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
    input: InputRuntime;
    yank: string;
  };
  constructor(
    window: MainWindow,
    preferences: PreferenceStore,
    mayClaimInitialLibraryFocus = false,
  ) {
    this.input = new InputRuntime(window);
    this.prefixGuide = new PrefixGuideRuntime(window);
    this.note = {
      editorWindow: null,
      editorDocument: null,
      handler: null,
      mode: 'normal',
      input: new InputRuntime(window),
      yank: '',
    };
    this.window = window;
    this.theme = new ThemeManager(window, preferences);
    this.interactionAppearance = new InteractionAppearanceManager(preferences, this.theme);
    this.settings = new SettingsCenter(window, this.theme, this.interactionAppearance, preferences);
    this.focusOwnership = new MainFocusOwnership(window, this, mayClaimInitialLibraryFocus);
    this.cleanup.add(() => this.focusOwnership.dispose());
    this.cleanup.add(() => this.interactionAppearance.dispose());
    this.cleanup.add(() => this.theme.dispose());
    this.cleanup.add(() => this.settings.close());
    const doc = window.document;
    this.status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.status.style.cssText = `position:fixed;bottom:10px;right:14px;z-index:99999;font:bold 12px/1.4 monospace;color:${THEME_VARS.text};background:${THEME_VARS.surface};padding:2px 8px;border:1px solid ${THEME_VARS.border};border-radius:3px;pointer-events:none;display:none;user-select:none;box-shadow:0 4px 16px ${THEME_VARS.shadow}`;
    (doc.body ?? doc.documentElement).append(this.status);
    this.theme.add(this.status);
    this.cleanup.add(() => this.input.dispose());
    this.cleanup.add(() => this.note.input.dispose());
    this.cleanup.add(() => this.prefixGuide.dispose());
    this.cleanup.add(() => {
      this.window.clearTimeout(this.selectionPanel.commandTimer);
      this.selectionPanel.commandTimer = undefined;
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
