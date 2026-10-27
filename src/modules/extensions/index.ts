import type { Cleanup } from '../../core/cleanup';
import type { MainWindow } from '../../core/contracts';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import type { BindingMap } from '../../input/bindings';
import { PluginManagerPanel } from './panel';
import { PluginManagerRuntime } from './runtime';

type ExtensionsContext = 'main-normal' | 'reader-normal' | 'note-normal';

export interface ExtensionsModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  readonly bindings: () => BindingMap;
  readonly themeRoot: (root: HTMLElement) => Cleanup;
}

export interface ExtensionsModule {
  readonly isOpen: boolean;
  open(context: ExtensionsContext): boolean;
  close(): void;
  handleKey(event: KeyboardEvent): void;
}

/** Owns one window's installed-extension UI and its asynchronous interaction lifetime. */
export function createExtensionsModule(
  host: ModuleHost,
  ports: ExtensionsModuleHost,
): ExtensionsModule {
  return host.activate('extensions', (scope) => {
    const state = new PluginManagerRuntime();
    const panel = new PluginManagerPanel({
      ...ports,
      state,
      isCurrent: () => scope.isCurrent(),
    });
    scope.add(() => panel.close());
    const open = {
      'main-normal': host.bind<void>(scope, 'main-normal', 'managePlugins', () => panel.open()),
      'reader-normal': host.bind<void>(scope, 'reader-normal', 'managePlugins', () => panel.open()),
      'note-normal': host.bind<void>(scope, 'note-normal', 'managePlugins', () => panel.open()),
    };
    return {
      get isOpen() {
        return scope.isCurrent() && state.open;
      },
      open: (context) => open[context](),
      close: () => panel.close(),
      handleKey: (event) => panel.handleKey(event),
    };
  });
}
