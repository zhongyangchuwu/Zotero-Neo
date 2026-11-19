import { NEO_READER_API_CHANGED } from '../../src/core/contracts';
import type { ReaderSelectionActionDefinition, ReaderSelectionApi } from '../../src/core/contracts';

interface TranslateApi {
  translate(
    text: string,
    options: { readonly pluginID: string; readonly itemID?: number },
  ): Promise<{ readonly result?: string; readonly status?: string }>;
}

interface AdapterHost {
  readonly Neo?: { readonly reader: ReaderSelectionApi };
  readonly PDFTranslate?: { readonly api?: TranslateApi };
}

let stop: (() => void) | undefined;

export function startup({ id }: { readonly id: string }): void {
  shutdown();
  const host = Zotero as AdapterHost;
  const chinese = Zotero.locale?.startsWith('zh');
  let attached:
    | {
        readonly reader: ReaderSelectionApi;
        readonly action: ReaderSelectionActionDefinition;
        readonly release: () => void;
      }
    | undefined;

  // Rebind when Neo is enabled or reloaded, regardless of the add-ons' startup order.
  const sync = (): void => {
    const reader = host.Neo?.reader;
    if (reader === attached?.reader) return;
    attached?.release();
    attached = undefined;
    if (!reader) return;

    const current = () => attached?.action === action && host.Neo?.reader === reader;
    const provider = () => host.PDFTranslate?.api;
    const action: ReaderSelectionActionDefinition = {
      id: 'pdf-translate.translate',
      label: chinese ? '翻译' : 'Translate',
      isAvailable: () => current() && typeof provider()?.translate === 'function',
      run: async ({ text, itemID }) => {
        const api = provider();
        if (!current() || typeof api?.translate !== 'function') return { retired: true };
        const stillCurrent = () => current() && provider() === api;
        try {
          const task = await api.translate(text, {
            pluginID: id,
            ...(itemID === null ? {} : { itemID }),
          });
          if (!stillCurrent()) return { retired: true };
          if (task.status && task.status !== 'success') {
            throw new Error(task.result || 'translation failed');
          }
          const body = task.result?.trim();
          if (!body) throw new Error('empty translation result');
          return { title: chinese ? '翻译结果' : 'Translation Result', body };
        } catch (error) {
          if (!stillCurrent()) return { retired: true };
          throw error;
        }
      },
    };
    try {
      attached = { reader, action, release: reader.registerSelectionAction(action) };
    } catch (error) {
      Zotero.debug(`[Neo Translate] Cannot register selection action: ${String(error)}`);
    }
  };

  Services.obs.addObserver(sync, NEO_READER_API_CHANGED);
  stop = () => {
    const registration = attached;
    attached = undefined;
    try {
      Services.obs.removeObserver(sync, NEO_READER_API_CHANGED);
    } finally {
      registration?.release();
    }
  };
  sync();
}

export function shutdown(): void {
  const cleanup = stop;
  stop = undefined;
  cleanup?.();
}
