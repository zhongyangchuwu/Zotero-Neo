import { CleanupScope } from '../core/cleanup';
import { InputRuntime } from '../input/runtime';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { PrefixGuideRuntime } from '../ui/key-guide-runtime';
import { THEME_VARS, type ThemeManager } from '../ui/theme';
import { PickerRuntime } from './picker/runtime';
import type { InteractionAppearanceManager } from './interaction-appearance';
import { NavigationHistoryState } from '../navigation/history';
import type { NavigationCoordinator } from '../navigation/coordinator';
import { MainFocusOwnership } from './focus-ownership';
import { NoteSurfaceRuntime } from './note-runtime';
import { ZoteroWindowRuntime } from './window-runtime';
import type { SettingsCenter } from './settings-center';
import type { MainItemDecorationRegistration } from './item-state-decoration';

export type MainPanel = 'collections' | 'items';
export type { NoteMode } from './note-runtime';

/** Main Surface composition hosted by one ZoteroWindowRuntime. */
export class MainWindowSession {
  readonly cleanup = new CleanupScope();
  readonly host: ZoteroWindowRuntime;
  readonly status: HTMLElement;
  statusTimer: number | undefined;
  readonly focusOwnership: MainFocusOwnership;
  activePanel: MainPanel = 'items';
  readonly input: InputRuntime;
  readonly prefixGuide: PrefixGuideRuntime;
  readonly jumpHistory = new NavigationHistoryState();
  navigationCoordinator: NavigationCoordinator | null = null;
  readonly picker = new PickerRuntime();
  itemDecoration: MainItemDecorationRegistration | null = null;
  readonly note: NoteSurfaceRuntime;
  constructor(
    window: MainWindow,
    preferences: PreferenceStore,
    mayClaimInitialLibraryFocus = false,
  ) {
    this.host = new ZoteroWindowRuntime(window, preferences);
    this.input = new InputRuntime(window);
    this.prefixGuide = new PrefixGuideRuntime(window);
    this.note = new NoteSurfaceRuntime(window);
    this.focusOwnership = new MainFocusOwnership(window, this, mayClaimInitialLibraryFocus);
    this.cleanup.add(() => this.focusOwnership.dispose());
    const doc = window.document;
    this.status = doc.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.status.style.cssText = `position:fixed;bottom:10px;right:14px;z-index:99999;font:bold 12px/1.4 monospace;color:${THEME_VARS.text};background:${THEME_VARS.surface};padding:2px 8px;border:1px solid ${THEME_VARS.border};border-radius:3px;pointer-events:none;display:none;user-select:none;box-shadow:0 4px 16px ${THEME_VARS.shadow}`;
    (doc.body ?? doc.documentElement).append(this.status);
    this.host.theme.add(this.status);
    this.cleanup.add(() => this.input.dispose());
    this.cleanup.add(() => this.note.input.dispose());
    this.cleanup.add(() => this.prefixGuide.dispose());
    this.cleanup.add(() => this.status.remove());
    this.cleanup.add(() => {
      const timer = this.statusTimer;
      this.statusTimer = undefined;
      this.window.clearTimeout(timer);
    });
  }
  get window(): MainWindow {
    return this.host.window;
  }

  get theme(): ThemeManager {
    return this.host.theme;
  }

  get interactionAppearance(): InteractionAppearanceManager {
    return this.host.interactionAppearance;
  }

  get settings(): SettingsCenter {
    return this.host.settings;
  }

  dispose(): void {
    this.navigationCoordinator?.dispose();
    this.navigationCoordinator = null;
    this.jumpHistory.dispose();
    this.cleanup.dispose();
    this.host.dispose();
  }
}
