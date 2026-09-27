import { CleanupScope } from '../core/cleanup';
import type { MainWindow } from '../core/contracts';
import type { PreferenceStore } from '../core/preference-store';
import { ThemeManager } from '../ui/theme';
import { InteractionAppearanceManager } from './interaction-appearance';
import { SettingsCenter } from './settings-center';

/** Host-window lifecycle root for services that belong to the Zotero window itself. */
export class ZoteroWindowRuntime {
  readonly cleanup = new CleanupScope();
  readonly window: MainWindow;
  readonly theme: ThemeManager;
  readonly interactionAppearance: InteractionAppearanceManager;
  readonly settings: SettingsCenter;

  constructor(window: MainWindow, preferences: PreferenceStore) {
    this.window = window;
    this.theme = new ThemeManager(window, preferences);
    this.interactionAppearance = new InteractionAppearanceManager(preferences, this.theme);
    this.settings = new SettingsCenter(window, this.theme, this.interactionAppearance, preferences);
    this.cleanup.add(() => this.settings.close());
    this.cleanup.add(() => this.interactionAppearance.dispose());
    this.cleanup.add(() => this.theme.dispose());
  }

  dispose(): void {
    this.cleanup.dispose();
  }
}
