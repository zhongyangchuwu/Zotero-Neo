import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderTranslationSave } from '../../src/modules/translation/translation-save';
import type { ReaderEventRuntime } from '../../src/reader/types';

const pdfState = vi.hoisted(() => ({
  current: true,
  disk: 'pdf-v1',
  loadedGate: null as Promise<string> | null,
  identity: {},
}));
vi.mock('../../src/platform/document-analysis', () => ({
  analysisPDF: async () => ({
    fingerprint: pdfState.disk,
    isCurrent: async () => pdfState.current,
  }),
}));
vi.mock('../../src/toolkit/reader/loaded-pdf-source', () => ({
  readerLoadedPDFSource: () => ({
    identity: pdfState.identity,
    fingerprint: pdfState.loadedGate ?? Promise.resolve('pdf-v1'),
  }),
}));

beforeEach(() => {
  pdfState.current = true;
  pdfState.disk = 'pdf-v1';
  pdfState.loadedGate = null;
  pdfState.identity = {};
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function harness(save: () => Promise<unknown>, quote = 'Source') {
  const textarea = Object.assign(new EventTarget(), {
    tagName: 'TEXTAREA',
    id: 'prefix-text',
    isConnected: true,
    value: 'Translation',
  });
  const task = {
    id: 'a',
    type: 'text',
    raw: quote,
    itemId: 1,
    status: 'success',
    result: 'Translation',
  };
  const popup = {
    isConnected: true,
    getAttribute: (name: string) => (name === 'translate-task-id' ? 'a' : 'prefix'),
    contains: (element: unknown): boolean => element === popup || element === textarea,
    querySelectorAll: () => [textarea],
  };
  const nativePopup = { isConnected: true, contains: (element: unknown) => element === popup };
  const attributes = new Map<string, string>();
  const button = Object.assign(new EventTarget(), {
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    isConnected: false,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    closest: () => nativePopup,
    remove: () => {
      button.isConnected = false;
    },
  });
  const document = { createElement: () => button };
  const persisted: Item[] = [];
  const erased: Item[] = [];
  class Item {
    libraryID = 0;
    parentID = 0;
    annotationType = '';
    annotationColor = '';
    annotationComment = '';
    annotationIsExternal = false;
    annotationSortIndex = '';
    annotationPageLabel = '';
    annotationPosition = '';
    tags: string[] = [];
    set annotationText(_value: string) {
      throw new Error('Native notes reject annotationText');
    }
    addTag(tag: string) {
      this.tags.push(tag);
    }
    async saveTx() {
      await save();
      persisted.push(this);
    }
    async eraseTx() {
      erased.push(this);
    }
  }
  const attachment = {
    id: 1,
    key: 'PDFKEY',
    libraryID: 1,
    deleted: false,
    isPDFAttachment: () => true,
  };
  vi.stubGlobal('Zotero', {
    Item,
    Items: { getAsync: async () => attachment },
    Libraries: { get: () => ({ editable: true }) },
    PDFTranslate: {
      api: { getVersion: () => '2.4.8' },
      data: { popup: { currentPopup: popup }, translate: { queue: [task] } },
    },
  });
  const window = { setTimeout, setInterval, clearInterval } as unknown as Window;
  const view = { current: true };
  const owner = new ReaderTranslationSave({
    reader: { itemID: 1 },
    isCurrent: () => view.current,
    text: (key) => key,
    debug: () => {},
  });
  const event = {
    doc: document,
    append: () => {
      button.isConnected = true;
    },
    params: {
      annotation: {
        text: quote,
        pageLabel: '1',
        sortIndex: '00000|000000|00000',
        position: { pageIndex: 0, rects: [[1, 2, 3, 4]] },
      },
    },
  } as unknown as ReaderEventRuntime;
  owner.show(event, window, () => view.current);
  return { button, textarea, task, owner, view, attachment, persisted, erased, event, window };
}

async function ready(button: { disabled: boolean }) {
  await vi.waitFor(() => expect(button.disabled).toBe(false));
}

function revise(textarea: EventTarget & { value: string }, text: string) {
  textarea.dispatchEvent(new Event('beforeinput'));
  textarea.value = text;
  textarea.dispatchEvent(new Event('input'));
}

describe('saving native translation', () => {
  it('writes a non-emphasis native note with exact source and revised plain text, without another translation', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const h = harness(save, 'A & B < C');
    await ready(h.button);
    revise(h.textarea, 'Revised & <literal> translation');
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.button.textContent).toBe('saved'));
    expect(h.persisted[0]).toMatchObject({
      parentID: 1,
      annotationType: 'note',
      annotationIsExternal: false,
    });
    expect(h.persisted[0]?.annotationComment).toBe(
      'original:\nA & B < C\n\nbadge:\nRevised & <literal> translation',
    );
    expect(h.persisted[0]?.tags).toContain('zotero-neo:translation');
    expect(h.task.result).toBe('Translation');
    h.owner.clear();
  });

  it('does not duplicate a pending or unchanged successful save, but permits an explicit revision', async () => {
    let gate = Promise.withResolvers<void>();
    const save = vi.fn(() => gate.promise);
    const h = harness(save);
    await ready(h.button);
    h.button.dispatchEvent(new Event('click'));
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    gate.resolve();
    await vi.waitFor(() => expect(h.button.textContent).toBe('saved'));
    h.button.dispatchEvent(new Event('click'));
    expect(save).toHaveBeenCalledTimes(1);
    gate = Promise.withResolvers<void>();
    revise(h.textarea, 'Another explicit revision');
    await ready(h.button);
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    gate.resolve();
    await vi.waitFor(() =>
      expect(h.persisted[1]?.annotationComment).toContain('Another explicit revision'),
    );
    h.owner.clear();
  });

  it('reports a failed write and permits retry without losing the current result', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValue(undefined);
    const h = harness(save);
    await ready(h.button);
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.button.textContent).toBe('failed'));
    expect(h.button.disabled).toBe(false);
    expect(h.textarea.value).toBe('Translation');
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.button.textContent).toBe('saved'));
    expect(h.persisted).toHaveLength(1);
    h.owner.clear();
  });

  it('rejects a stale popup before admission but finishes an admitted source after the UI closes', async () => {
    const gate = Promise.withResolvers<void>();
    const save = vi.fn(() => gate.promise);
    const h = harness(save);
    await ready(h.button);
    h.view.current = false;
    h.button.dispatchEvent(new Event('click'));
    expect(save).not.toHaveBeenCalled();
    h.view.current = true;
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    h.view.current = false;
    h.owner.clear();
    gate.resolve();
    await vi.waitFor(() => expect(h.persisted[0]?.parentID).toBe(1));
    expect(h.persisted[0]?.annotationComment).toContain('Source');
  });

  it('refuses a changed PDF and rolls back its own write if the source changes during persistence', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const h = harness(save);
    await ready(h.button);
    pdfState.current = false;
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.button.textContent).toBe('failed'));
    expect(save).not.toHaveBeenCalled();
    h.owner.clear();
    pdfState.current = true;
    const changed = harness(async () => {
      pdfState.current = false;
    });
    await ready(changed.button);
    changed.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(changed.button.textContent).toBe('failed'));
    expect(changed.erased).toHaveLength(1);
    changed.owner.clear();
  });
});

describe('displayed PDF provenance', () => {
  it('rejects a replacement loaded document before saving', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const h = harness(save);
    await ready(h.button);
    pdfState.identity = {};
    h.button.dispatchEvent(new Event('click'));
    expect(save).not.toHaveBeenCalled();
    h.owner.clear();
  });

  it('rejects a different attachment before the first popup instead of adopting disk as the baseline', async () => {
    pdfState.disk = 'pdf-b';
    const save = vi.fn().mockResolvedValue(undefined);
    const h = harness(save);
    await vi.waitFor(() => expect(h.button.title).toContain('Displayed PDF'));
    h.button.dispatchEvent(new Event('click'));
    expect(save).not.toHaveBeenCalled();
    expect(h.button.disabled).toBe(true);
    h.owner.clear();
  });

  it('retries a failed source capture for the same loaded PDF', async () => {
    pdfState.disk = 'pdf-b';
    const h = harness(vi.fn().mockResolvedValue(undefined));
    await vi.waitFor(() => expect(h.button.title).toContain('Displayed PDF'));
    pdfState.disk = 'pdf-v1';
    h.owner.show(h.event, h.window, () => h.view.current);
    await ready(h.button);
    h.button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.persisted).toHaveLength(1));
    h.owner.clear();
  });

  it('rejects replacement while the loaded-byte fingerprint is pending', async () => {
    const loaded = Promise.withResolvers<string>();
    pdfState.loadedGate = loaded.promise;
    const save = vi.fn().mockResolvedValue(undefined);
    const h = harness(save);
    pdfState.disk = 'pdf-b';
    loaded.resolve('pdf-v1');
    await vi.waitFor(() => expect(h.button.title).toContain('Displayed PDF'));
    h.button.dispatchEvent(new Event('click'));
    expect(save).not.toHaveBeenCalled();
    h.owner.clear();
  });
});
