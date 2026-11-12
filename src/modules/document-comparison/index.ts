import type { ModuleHost } from '../../core/module-host';
import { ReaderDocumentComparison, type DocumentComparisonHost } from './document-comparison';

export type DocumentComparisonModulePorts = Omit<DocumentComparisonHost, 'isCurrent'>;

export interface DocumentComparisonModule {
  open(): boolean;
  handleKey(event: KeyboardEvent): boolean;
  close(): void;
}

export function createDocumentComparisonModule(
  host: ModuleHost,
  ports: DocumentComparisonModulePorts,
): DocumentComparisonModule {
  return host.activate('document-comparison', (scope) => {
    const comparison = new ReaderDocumentComparison({
      ...ports,
      isCurrent: () => scope.isCurrent(),
    });
    scope.add(() => comparison.close());
    const open = host.bind<void>(scope, 'reader-normal', 'compareDocumentParsing', () =>
      comparison.open(),
    );
    return {
      open: () => open(),
      handleKey: (event) => scope.isCurrent() && comparison.handleKey(event),
      close: () => comparison.close(),
    };
  });
}
