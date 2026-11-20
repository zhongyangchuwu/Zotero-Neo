import type { ItemTargetSet } from '../../core/item-target';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import { batchStatus } from '../../i18n/batch-result';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { copyCitekeys } from '../../operations/citekeys';

export interface ReaderLibraryModule {
  yankCitekeys(targets: ItemTargetSet<'reader'>): boolean;
}

/** Reader citekeys use the Reader target even when no associated Main window is available. */
export function createReaderLibraryModule(
  host: ModuleHost,
  ports: { status(message: string): void; language(): KeyGuideLanguage; logger: Logger },
): ReaderLibraryModule {
  return host.activate('library', (scope) => ({
    yankCitekeys: host.bind<ItemTargetSet<'reader'>>(
      scope,
      'reader-normal',
      'mainYankCitekey',
      (targets) => {
        const result = copyCitekeys(targets, ports.logger);
        if (scope.isCurrent()) ports.status(batchStatus('citekeys', result, ports.language()));
      },
    ),
  }));
}
