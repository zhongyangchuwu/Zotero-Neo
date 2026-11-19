import { afterEach, expect, it, vi } from 'vitest';
import { shutdown, startup } from '../../adapters/translate/bootstrap';
import { NEO_READER_API_CHANGED } from '../../src/core/contracts';
import type { ReaderSelectionApi } from '../../src/core/contracts';
import { ReaderSelectionActionRegistry } from '../../src/modules/reader-selection/registry';

const ADAPTER_ID = 'zotero-neo-translate@zotero-neo';
const selection = { text: 'A selected sentence', itemID: 42, pageLabel: '1', position: null };

function neo() {
  const registry = new ReaderSelectionActionRegistry();
  return {
    reader: {
      getSelection: () => selection,
      registerSelectionAction: registry.register.bind(registry),
    },
    actions: () => registry.available(selection, () => true),
  };
}

function host() {
  const events = new EventTarget();
  vi.stubGlobal('Services', {
    obs: {
      addObserver: (callback: EventListener, topic: string) =>
        events.addEventListener(topic, callback),
      removeObserver: (callback: EventListener, topic: string) =>
        events.removeEventListener(topic, callback),
    },
  });
  const translate = vi.fn<() => Promise<{ status?: string; result: string }>>();
  const zotero: {
    locale: string;
    Neo?: { reader: ReaderSelectionApi };
    PDFTranslate?: { api: { translate: typeof translate } };
    debug: (message: string) => void;
  } = { locale: 'zh-CN', debug: vi.fn() };
  vi.stubGlobal('Zotero', zotero);
  return {
    setNeo(value?: { reader: ReaderSelectionApi }) {
      zotero.Neo = value;
      events.dispatchEvent(new Event(NEO_READER_API_CHANGED));
    },
    setProvider(enabled: boolean) {
      zotero.PDFTranslate = enabled ? { api: { translate } } : undefined;
    },
    translate,
  };
}

afterEach(() => {
  shutdown();
  vi.unstubAllGlobals();
});

it('uses the provider only on explicit selection and reconnects across Neo instances', async () => {
  const runtime = host();
  startup({ id: ADAPTER_ID });
  const first = neo();
  runtime.setNeo(first);
  expect(first.actions()).toEqual([]);

  runtime.setProvider(true);
  const [action] = first.actions();
  expect(action?.label).toBe('翻译');
  expect(runtime.translate).not.toHaveBeenCalled();
  runtime.translate.mockResolvedValueOnce({ status: 'success', result: '  已翻译。  ' });
  await expect(action!.run(selection)).resolves.toEqual({ title: '翻译结果', body: '已翻译。' });
  expect(runtime.translate).toHaveBeenCalledWith(selection.text, {
    pluginID: ADAPTER_ID,
    itemID: 42,
  });

  runtime.setNeo();
  expect(first.actions()).toEqual([]);
  const second = neo();
  runtime.setNeo(second);
  runtime.setNeo(second);
  expect(second.actions().map(({ id }) => id)).toEqual(['pdf-translate.translate']);
  await expect(action!.run(selection)).resolves.toEqual({ retired: true });
  expect(runtime.translate).toHaveBeenCalledTimes(1);
});

it('retires a pending result and stale menu callbacks when the adapter is disabled', async () => {
  const runtime = host();
  const core = neo();
  runtime.setNeo(core);
  runtime.setProvider(true);
  startup({ id: ADAPTER_ID });
  const [action] = core.actions();
  runtime.translate.mockResolvedValueOnce({ status: 'fail', result: 'Provider error' });
  await expect(action!.run(selection)).rejects.toThrow('Provider error');

  const pending = Promise.withResolvers<{ result: string }>();
  runtime.translate.mockReturnValueOnce(pending.promise);
  const result = action!.run(selection);
  shutdown();
  expect(core.actions()).toEqual([]);
  await expect(action!.run(selection)).resolves.toEqual({ retired: true });
  pending.reject(new Error('late provider failure'));
  await expect(result).resolves.toEqual({ retired: true });
  expect(runtime.translate).toHaveBeenCalledTimes(2);

  const replacement = neo();
  runtime.setNeo(replacement);
  expect(replacement.actions()).toEqual([]);
});

it('hides the action and retires work when the translation provider is unloaded', async () => {
  const runtime = host();
  const core = neo();
  runtime.setNeo(core);
  runtime.setProvider(true);
  startup({ id: ADAPTER_ID });
  const [action] = core.actions();
  const pending = Promise.withResolvers<{ result: string }>();
  runtime.translate.mockReturnValueOnce(pending.promise);
  const result = action!.run({ ...selection, itemID: null });
  expect(runtime.translate).toHaveBeenCalledWith(selection.text, { pluginID: ADAPTER_ID });

  runtime.setProvider(false);
  expect(core.actions()).toEqual([]);
  await expect(action!.run(selection)).resolves.toEqual({ retired: true });
  runtime.setProvider(true);
  pending.resolve({ result: 'stale translation' });
  await expect(result).resolves.toEqual({ retired: true });
  expect(runtime.translate).toHaveBeenCalledTimes(1);
});
