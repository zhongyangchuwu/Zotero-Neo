import type { ModuleHost } from '../../core/module-host';
import type { PdfWindow } from '../../reader/types';
import { observeAttachmentDocumentCache } from '../../platform/document-analysis-cache';
import { DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY } from '../../document-analysis/settings';
import type { ReaderObjectExcerptHost } from './object-excerpts';
import { ReaderObjectExcerpts } from './object-excerpts';

export type ReaderExcerptsModulePorts = Omit<ReaderObjectExcerptHost, 'isCurrent'>;

export interface ReaderExcerptsModule {
  open(window: PdfWindow): boolean;
  handleKey(event: KeyboardEvent): boolean;
  releaseView(window: PdfWindow): void;
  close(): void;
}

export function createReaderExcerptsModule(
  host: ModuleHost,
  ports: ReaderExcerptsModulePorts,
): ReaderExcerptsModule {
  return host.activate('reader-excerpts', (scope) => {
    const excerpts = new ReaderObjectExcerpts({
      ...ports,
      isCurrent: () => scope.isCurrent(),
    });
    const close = (): void => excerpts.close();
    scope.add(close);
    if (ports.reader.itemID) scope.add(observeAttachmentDocumentCache(ports.reader.itemID, close));
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = ports.preferences.observe?.(key, close);
      if (stop) scope.add(stop);
    }
    const open = host.bind<PdfWindow>(scope, 'reader-normal', 'openObjectExcerpts', (window) =>
      excerpts.open(window),
    );
    return {
      open,
      handleKey: (event) => excerpts.handleKey(event),
      releaseView: (window) => excerpts.releaseView(window),
      close: () => excerpts.close(),
    };
  });
}
