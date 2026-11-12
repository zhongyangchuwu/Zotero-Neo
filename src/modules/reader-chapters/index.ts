import type { ModuleHost } from '../../core/module-host';
import { DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY } from '../../document-analysis/settings';
import { observeAttachmentDocumentCache } from '../../platform/document-analysis-cache';
import type { PdfWindow } from '../../reader/types';
import { ReaderChapterSearch, type ReaderChapterSearchHost } from './chapter-search';

export type ReaderChaptersModulePorts = Omit<ReaderChapterSearchHost, 'isCurrent'>;

export interface ReaderChaptersModule {
  open(window: PdfWindow): boolean;
  handleKey(event: KeyboardEvent): boolean;
  releaseView(window: PdfWindow): void;
  close(): void;
}

export function createReaderChaptersModule(
  host: ModuleHost,
  ports: ReaderChaptersModulePorts,
): ReaderChaptersModule {
  return host.activate('reader-chapters', (scope) => {
    const chapter = new ReaderChapterSearch({ ...ports, isCurrent: () => scope.isCurrent() });
    scope.add(() => chapter.close());
    if (ports.reader.itemID)
      scope.add(observeAttachmentDocumentCache(ports.reader.itemID, () => chapter.close()));
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = ports.preferences.observe?.(key, () => chapter.close());
      if (stop) scope.add(stop);
    }
    const open = host.bind<PdfWindow>(scope, 'reader-normal', 'openChapterSearch', (window) =>
      chapter.open(window),
    );
    return {
      open,
      handleKey: (event) => scope.isCurrent() && chapter.handleKey(event),
      releaseView: (window) => chapter.releaseView(window),
      close: () => chapter.close(),
    };
  });
}
