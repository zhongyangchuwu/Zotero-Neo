import type { ReaderSelectionActionDefinition } from '../../core/contracts';
import type { ModuleHost } from '../../core/module-host';
import type { KeyGuideLanguage } from '../../input/key-guide-config';
import { t } from '../../i18n';
import { TRANSLATION_ROLE_TAG } from '../../operations/save-translation';
import type { PdfWindow, ReaderEventRuntime, ReaderRuntime } from '../../reader/types';
import { ReaderTranslationSidebar } from '../../toolkit/reader';
import { ReaderTranslationSave } from './translation-save';

type Translate = (
  text: string,
  options: { readonly pluginID: string; readonly itemID?: number },
) => Promise<{ readonly result?: string; readonly status?: string }>;

interface SelectionTranslationRuntime {
  readonly PDFTranslate?: { readonly api?: { readonly translate?: Translate } };
}

export interface ReaderTranslationModulePorts {
  readonly reader: ReaderRuntime;
  readonly isViewCurrent: (window: PdfWindow) => boolean;
  readonly language: () => KeyGuideLanguage;
  readonly pluginID: () => string | null;
  readonly debug: (message: string) => void;
}

export interface ReaderTranslationModule {
  selectionActions(
    window: PdfWindow,
    language: KeyGuideLanguage,
  ): readonly ReaderSelectionActionDefinition[];
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
    const isCurrent = (window: PdfWindow): boolean =>
      scope.isCurrent() && ports.isViewCurrent(window);
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
      selectionActions: (window, language) => {
        if (!isCurrent(window) || typeof Zotero === 'undefined') return [];
        const translate = (Zotero as unknown as SelectionTranslationRuntime).PDFTranslate?.api
          ?.translate;
        const pluginID = ports.pluginID();
        if (typeof translate !== 'function' || !pluginID) return [];
        return [
          {
            id: 'pdf-translate.translate',
            label: language === 'zh-CN' ? '翻译' : 'Translate',
            run: async (selection) => {
              if (!isCurrent(window)) return { retired: true };
              const task = await translate(selection.text, {
                pluginID,
                ...(selection.itemID === null ? {} : { itemID: selection.itemID }),
              });
              if (!isCurrent(window)) return { retired: true };
              if (task.status && task.status !== 'success')
                throw new Error(task.result || 'translation failed');
              const text = task.result?.trim();
              if (!text) throw new Error('empty translation result');
              return { title: language === 'zh-CN' ? '翻译结果' : 'Translation', body: text };
            },
          },
        ];
      },
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
