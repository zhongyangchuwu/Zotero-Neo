import type { ModuleHost } from '../../core/module-host';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { TRANSLATION_ROLE_TAG } from '../../operations/save-translation';
import type { PdfWindow, ReaderEventRuntime, ReaderRuntime } from '../../reader/types';
import { ReaderTranslationSidebar } from '../../toolkit/reader';
import { ReaderTranslationSave } from './translation-save';

export interface ReaderTranslationModulePorts {
  readonly reader: ReaderRuntime;
  readonly language: () => KeyGuideLanguage;
  readonly debug: (message: string) => void;
}

export interface ReaderTranslationModule {
  showSave(event: ReaderEventRuntime, window: PdfWindow, sourceCurrent: () => boolean): void;
  showSidebar(event: ReaderEventRuntime): void;
  releaseView(window: PdfWindow): void;
}

/** Owns optional translation contributions for one Reader session. */
export function createReaderTranslationModule(
  host: ModuleHost,
  ports: ReaderTranslationModulePorts,
): ReaderTranslationModule {
  return host.activate<ReaderTranslationModule>('translation', (scope) => {
    const save = new ReaderTranslationSave({
      reader: ports.reader,
      isCurrent: () => scope.isCurrent(),
      text: (key) => t(`translation.${key}`, ports.language()),
      debug: ports.debug,
    });
    scope.add(() => save.clear());
    const sidebar = new ReaderTranslationSidebar(ports.reader, TRANSLATION_ROLE_TAG, (key) =>
      t(`translation.${key}`, ports.language()),
    );
    scope.add(() => sidebar.dispose());
    return {
      showSave: (event, window, sourceCurrent) => save.show(event, window, sourceCurrent),
      showSidebar: (event) =>
        sidebar.show(
          event,
          event.params?.annotation.tags?.some((tag) => tag.name === TRANSLATION_ROLE_TAG) ?? false,
        ),
      releaseView: (window) => save.releaseView(window),
    };
  });
}
