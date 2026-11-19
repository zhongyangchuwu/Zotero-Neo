import { afterEach, expect, it, vi } from 'vitest';
import { ZoteroNeoAddon } from '../../src/addon';
import { ZoteroPreferenceStore } from '../../src/core/preference-store';
import {
  SELECTION_TRANSLATION_ACTION_ID,
  TRANSLATION_EXTRA_PREFERENCE,
  SelectionTranslation,
} from '../../src/modules/translation/selection-action';
import { translateForZoteroApi } from '../../src/platform/translate-for-zotero';

const NEO_ID = 'zotero-neo@zotero-neo';
const selection = { text: 'A selected sentence', itemID: 42, pageLabel: '1', position: null };

function host() {
  const values = new Map<string, boolean>();
  const observers = new Map<string, { observe(): void }>();
  vi.stubGlobal('Services', {
    prefs: {
      getPrefType: (key: string) => (values.has(key) ? 128 : 0),
      getBoolPref: (key: string) => values.get(key),
      setBoolPref(key: string, value: boolean) {
        if (values.get(key) === value) return;
        values.set(key, value);
        observers.get(key)?.observe();
      },
      addObserver: (key: string, observer: { observe(): void }) => observers.set(key, observer),
      removeObserver: (key: string) => observers.delete(key),
    },
  });
  const zotero: { PDFTranslate?: { api: object } } = {};
  vi.stubGlobal('Zotero', zotero);
  const preferences = new ZoteroPreferenceStore();
  return { zotero, preferences };
}

afterEach(() => vi.unstubAllGlobals());

it('uses the callable public provider API without requiring private data or a pinned version', async () => {
  const { zotero, preferences } = host();
  const translation = new SelectionTranslation(preferences, NEO_ID);
  try {
    expect(translateForZoteroApi()).toBeNull();
    preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
    expect(translation.action('zh-CN')).toBeNull();
    zotero.PDFTranslate = { api: { translate: 'not callable' } };
    expect(translateForZoteroApi()).toBeNull();
    expect(translation.action('zh-CN')).toBeNull();

    const translate = vi.fn(async () => ({ status: 'success', result: '  已翻译。  ' }));
    const api = { translate };
    zotero.PDFTranslate = { api };
    expect(translateForZoteroApi()).toBe(api);
    const action = translation.action('zh-CN');
    expect(action).toMatchObject({ id: 'pdf-translate.translate', label: '翻译' });
    expect(translate).not.toHaveBeenCalled();
    await expect(action!.run({ ...selection, itemID: null })).resolves.toEqual({
      title: '翻译结果',
      body: '已翻译。',
    });
    expect(translate).toHaveBeenCalledExactlyOnceWith(selection.text, { pluginID: NEO_ID });
    expect(translate.mock.contexts[0]).toBe(api);
  } finally {
    translation.dispose();
  }
});

it('preserves provider failures that belong to the current action', async () => {
  const { zotero, preferences } = host();
  const translate = vi.fn<() => Promise<{ result: string; status?: string }>>();
  zotero.PDFTranslate = { api: { translate } };
  preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
  const translation = new SelectionTranslation(preferences, NEO_ID);
  try {
    const action = translation.action('en')!;
    translate.mockResolvedValueOnce({ status: 'fail', result: 'Provider error' });
    await expect(action.run(selection)).rejects.toThrow('Provider error');
    const failure = new Error('Provider unavailable');
    translate.mockRejectedValueOnce(failure);
    await expect(action.run(selection)).rejects.toBe(failure);
    translate.mockResolvedValueOnce({ status: 'success', result: ' ' });
    await expect(action.run(selection)).rejects.toThrow('empty translation result');
  } finally {
    translation.dispose();
  }
});

it('retires failed pending work across disable and re-enable with the same provider', async () => {
  const { zotero, preferences } = host();
  const pending = Promise.withResolvers<{ result: string }>();
  const translate = vi.fn(() => pending.promise);
  zotero.PDFTranslate = { api: { translate } };
  const translation = new SelectionTranslation(preferences, NEO_ID);
  try {
    expect(translation.action('en')).toBeNull();
    preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
    const action = translation.action('en')!;
    const result = action.run(selection);
    preferences.set(TRANSLATION_EXTRA_PREFERENCE, false);
    expect(translation.action('en')).toBeNull();
    preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
    pending.reject(new Error('late provider failure'));
    await expect(result).resolves.toEqual({ retired: true });
    await expect(action.run(selection)).resolves.toEqual({ retired: true });
    expect(translate).toHaveBeenCalledOnce();
  } finally {
    translation.dispose();
  }
});

it.each(['API object', 'translate method'] as const)(
  'retires menu callbacks and pending success when the provider replaces its %s',
  async (replacement) => {
    const { zotero, preferences } = host();
    const pending = Promise.withResolvers<{ result: string }>();
    const first = vi.fn(() => pending.promise);
    const second = vi.fn(async () => ({ result: 'current translation' }));
    const api = { translate: first };
    zotero.PDFTranslate = { api };
    preferences.set(TRANSLATION_EXTRA_PREFERENCE, true);
    const translation = new SelectionTranslation(preferences, NEO_ID);
    try {
      const old = translation.action('en')!;
      const result = old.run(selection);
      if (replacement === 'API object') {
        delete zotero.PDFTranslate;
        expect(translation.action('en')).toBeNull();
        zotero.PDFTranslate = { api: { translate: second } };
      } else {
        api.translate = second;
      }

      await expect(old.run(selection)).resolves.toEqual({ retired: true });
      expect(second).not.toHaveBeenCalled();
      pending.resolve({ result: 'stale translation' });
      await expect(result).resolves.toEqual({ retired: true });
      expect(first).toHaveBeenCalledOnce();
      const current = translation.action('en')!;
      await expect(current.run(selection)).resolves.toEqual({
        title: 'Translation Result',
        body: 'current translation',
      });
      translation.dispose();
      await expect(current.run(selection)).resolves.toEqual({ retired: true });
      expect(second).toHaveBeenCalledOnce();
    } finally {
      translation.dispose();
    }
  },
);

it('reserves only the old companion action ID at the public Reader facade', () => {
  const { preferences } = host();
  const { reader } = new ZoteroNeoAddon(preferences).api;
  const run = vi.fn();
  expect(() =>
    reader.registerSelectionAction({
      id: SELECTION_TRANSLATION_ACTION_ID,
      label: 'Translate',
      run,
    }),
  ).toThrow('Selection action ID is reserved');
  expect(() =>
    reader.registerSelectionAction({
      id: ` ${SELECTION_TRANSLATION_ACTION_ID} `,
      label: 'Translate',
      run,
    }),
  ).toThrow('Selection action ID is reserved');

  const action = { id: `${SELECTION_TRANSLATION_ACTION_ID}.other`, label: 'Other', run };
  const release = reader.registerSelectionAction(action);
  release();
  expect(() => reader.registerSelectionAction(action)()).not.toThrow();
  expect(reader.getSelection()).toBeNull();
});
