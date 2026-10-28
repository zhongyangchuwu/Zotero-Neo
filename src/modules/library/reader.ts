import type { ItemTargetSet } from '../../core/item-target';
import type { ModuleHost } from '../../core/module-host';
import { copyCitekeys } from '../../operations/citekeys';

export interface ReaderLibraryModule {
  yankCitekeys(targets: ItemTargetSet<'reader'>): boolean;
}

/** Reader citekeys use the Reader target even when no associated Main window is available. */
export function createReaderLibraryModule(
  host: ModuleHost,
  status: (message: string) => void,
): ReaderLibraryModule {
  return host.activate('library', (scope) => ({
    yankCitekeys: host.bind<ItemTargetSet<'reader'>>(
      scope,
      'reader-normal',
      'mainYankCitekey',
      (targets) => {
        const message = copyCitekeys(targets);
        if (scope.isCurrent()) status(message);
      },
    ),
  }));
}
