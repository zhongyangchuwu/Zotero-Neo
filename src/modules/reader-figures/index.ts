import type { ModuleHost } from '../../core/module-host';
import type { PreferenceStore } from '../../core/preference-store';
import { DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY } from '../../document-analysis/settings';
import { observeAttachmentDocumentCache } from '../../platform/document-analysis-cache';
import type { PdfWindow } from '../../reader/types';
import { ReaderFigurePicker, type ReaderFigurePickerHost } from './figure-picker';

export type ReaderFiguresModulePorts = Omit<ReaderFigurePickerHost, 'isCurrent'> & {
  readonly preferences: PreferenceStore;
};

export interface ReaderFiguresModule {
  open(window: PdfWindow): boolean;
  handleKey(event: KeyboardEvent): boolean;
  releaseView(window: PdfWindow): void;
  close(): void;
}

export function createReaderFiguresModule(
  host: ModuleHost,
  ports: ReaderFiguresModulePorts,
): ReaderFiguresModule {
  return host.activate('reader-figures', (scope) => {
    const picker = new ReaderFigurePicker({ ...ports, isCurrent: () => scope.isCurrent() });
    scope.add(() => picker.close(false));
    if (ports.reader.itemID)
      scope.add(observeAttachmentDocumentCache(ports.reader.itemID, () => picker.close(false)));
    for (const key of [DOCUMENT_PROVIDER_KEY, OXR_ENDPOINT_KEY]) {
      const stop = ports.preferences.observe?.(key, () => picker.close(false));
      if (stop) scope.add(stop);
    }
    const open = host.bind<PdfWindow>(scope, 'reader-normal', 'openFigurePicker', (window) =>
      picker.open(window),
    );
    return {
      open,
      handleKey: (event) => scope.isCurrent() && picker.handleKey(event),
      releaseView: (window) => picker.releaseView(window),
      close: () => picker.close(false),
    };
  });
}
