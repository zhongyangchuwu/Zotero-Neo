import type * as CredentialChecks from '../../src/platform/credential-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderDocumentComparison } from '../../src/modules/document-comparison/document-comparison';
import { oxrParsedDocument } from '../../src/document-analysis/oxr';
import { mineruParsedDocument } from '../../src/document-analysis/mineru';
import type { DocumentSource } from '../../src/document-analysis/contracts';
import type { ReaderRuntime } from '../../src/toolkit/reader';
import type { PreferenceStore } from '../../src/core/preference-store';
import type {
  DocumentComparisonCommand,
  DocumentComparisonModel,
} from '../../src/modules/document-comparison/react-model';
import {
  emptyDocumentCorrections,
  type DocumentCorrections,
} from '../../src/document-analysis/corrections';
import { documentCacheSlot } from '../../src/document-analysis/cache';

const host = vi.hoisted(() => ({
  window: null as unknown,
  readPDF: vi.fn(),
  isCurrent: vi.fn(),
  request: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
  native: vi.fn(),
  analysisChanged: vi.fn(),
  navigate: vi.fn(),
  readToken: vi.fn(),
  readSettledToken: vi.fn(),
  saveToken: vi.fn(),
  checkCredential: vi.fn(),
  credentialHelp: vi.fn(),
  readCorrections: vi.fn(),
  saveCorrections: vi.fn(),
  correctionRecords: new Map<string, DocumentCorrections>(),
  dispatch: null as ((command: DocumentComparisonCommand) => void) | null,
  models: [] as DocumentComparisonModel[],
  views: [] as {
    model: DocumentComparisonModel;
    dispatch: (command: DocumentComparisonCommand) => void;
  }[],
}));
vi.mock('../../src/platform/document-analysis', () => ({
  analysisPDF: async () => ({
    fileName: 'owned.pdf',
    fingerprint: 'source',
    read: host.readPDF,
    isCurrent: host.isCurrent,
  }),
  requestDocumentJSON: host.request,
  documentServiceTransport: { requestJSON: host.request },
}));
vi.mock('../../src/platform/document-analysis-cache', () => ({
  attachmentDocumentCache: () => ({ read: host.readCache, write: host.writeCache }),
  observeAttachmentDocumentCache: () => () => {},
}));
vi.mock('../../src/platform/document-corrections', () => ({
  readAttachmentDocumentCorrections: host.readCorrections,
  saveAttachmentDocumentCorrections: host.saveCorrections,
}));
vi.mock('../../src/toolkit/reader', () => ({
  readerWindow: () => host.window,
  readerDocumentPageGeometry: async () => [{ viewRect: [0, 0, 600, 800], rotation: 0 }],
  structuredDocumentData: host.native,
}));
vi.mock('../../src/i18n', () => ({ t: (key: string) => key.replace('documentAnalysis.', '') }));
vi.mock('../../src/platform/document-credentials', () => ({
  readSettledMinerUToken: host.readSettledToken,
  saveMinerUToken: host.saveToken,
}));
vi.mock('../../src/platform/credential-check', async (importOriginal) => ({
  ...(await importOriginal<typeof CredentialChecks>()),
  checkCredential: host.checkCredential,
  CREDENTIAL_HELP_URLS: { mineru: 'https://mineru.net' },
  openCredentialHelp: host.credentialHelp,
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: Element;
    model: DocumentComparisonModel;
    dispatch: (command: DocumentComparisonCommand) => void;
  }) => {
    host.dispatch = options.dispatch;
    const viewState = { model: options.model, dispatch: options.dispatch };
    host.views.push(viewState);
    const credential = options.root.ownerDocument.createElementNS('', 'input');
    credential.type = 'password';
    credential.addEventListener('input', () => options.dispatch({ type: 'credential-change' }));
    credential.addEventListener('compositionstart', () =>
      options.dispatch({ type: 'credential-composition' }),
    );
    credential.addEventListener('compositionend', () =>
      options.dispatch({ type: 'credential-change' }),
    );
    const render = (model: DocumentComparisonModel) => {
      const rendered = structuredClone(model);
      viewState.model = rendered;
      host.models.push(rendered);
      const root = options.root;
      root.replaceChildren();
      const node = (tag: string, text = '') => {
        const value = root.ownerDocument.createElementNS('', tag);
        value.textContent = text;
        root.append(value);
        return value;
      };
      const provider = node('select');
      provider.value = model.provider;
      provider.addEventListener('change', () =>
        options.dispatch({ type: 'provider', value: provider.value === 'oxr' ? 'oxr' : 'mineru' }),
      );
      const endpoint = node('input');
      endpoint.type = 'url';
      endpoint.value = model.endpoint;
      endpoint.addEventListener('change', () =>
        options.dispatch({ type: 'endpoint', value: endpoint.value }),
      );
      root.append(credential);
      credential.disabled = model.busy;
      if (model.provider === 'mineru') {
        const verify = node('button', model.credentialVerifyLabel);
        const help = node('a', model.credentialHelpLabel);
        verify.disabled = model.credentialChecking;
        verify.addEventListener('click', () => options.dispatch({ type: 'credential-verify' }));
        help.addEventListener('click', () => options.dispatch({ type: 'credential-help' }));
      }
      for (const [label, type] of [
        [model.parseLabel, 'parse'],
        [model.refreshLabel, 'refresh'],
        [model.copyLabel, 'copy'],
        [model.closeLabel, 'close'],
      ] as const) {
        const button = node('button', label);
        button.disabled = (type === 'parse' || type === 'refresh') && (!model.ready || model.busy);
        button.addEventListener('click', () => options.dispatch({ type }));
      }
      node('p', model.status);
      for (const column of model.columns) {
        node('p', column.error + column.summary + column.cache);
        for (const target of column.targets) {
          node('p', target.title + target.text);
          const button = node('button', target.action);
          button.addEventListener('click', () =>
            options.dispatch({ type: 'locate', id: target.id }),
          );
        }
      }
    };
    render(options.model);
    return {
      ready: Promise.resolve(),
      update: render,
      getElement: (part: string) => (part === 'credential' ? credential : null),
      dispose: () => options.root.replaceChildren(),
    };
  },
}));

/** Only the dialog's DOM operations are modeled; real Gecko and file I/O are exercised separately. */
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  value = '';
  disabled = false;
  type = '';
  ownText = '';
  listeners = new Map<string, (() => void)[]>();
  constructor(
    readonly tag: string,
    readonly ownerDocument: DocumentFixture,
    readonly root = false,
  ) {}
  get isConnected(): boolean {
    return this.root || !!this.parent?.isConnected;
  }
  get textContent(): string {
    return this.ownText + this.children.map((n) => n.textContent).join('');
  }
  set textContent(value: string) {
    this.ownText = value;
    this.replaceChildren();
  }
  setAttribute() {}
  focus() {}
  contains(node: Element | null | undefined): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }
  append(...nodes: Element[]) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  prepend(...nodes: Element[]) {
    for (const node of nodes) node.parent = this;
    this.children.unshift(...nodes);
  }
  replaceChildren() {
    for (const child of this.children) child.parent = null;
    this.children = [];
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
    this.parent = null;
  }
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string) {
    if (name === 'click' && this.disabled) return;
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
  querySelector(tag: string): Element | null {
    for (const child of this.children) {
      if (child.tag === tag) return child;
      const found = child.querySelector(tag);
      if (found) return found;
    }
    return null;
  }
}
class DocumentFixture {
  nodes: Element[] = [];
  documentElement = new Element('html', this, true);
  createElementNS(_ns: string, tag: string) {
    const element = new Element(tag, this);
    this.nodes.push(element);
    return element;
  }
  button(label: string) {
    const found = this.nodes.find(
      (n) => n.isConnected && n.tag === 'button' && n.textContent === label,
    );
    if (!found) throw new Error(`Missing ${label}`);
    return found;
  }
  status() {
    return this.nodes.filter((n) => n.isConnected && n.tag === 'p').map((n) => n.textContent);
  }
}
const source: DocumentSource = {
  fingerprint: 'source',
  fileName: 'owned.pdf',
  pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
};
const payload = {
  code: 0,
  data: {
    result: {
      outputs: {
        json: {
          pages: [
            {
              page_num: 0,
              page_size: { w: 600, h: 800 },
              blocks: [{ type: 'Text', bbox: [10, 10, 100, 100], content: 'Fresh result' }],
            },
          ],
        },
      },
    },
  },
};
const cached = { savedAt: 1000, parsed: oxrParsedDocument(source, payload, 1250) };
let document: DocumentFixture;
let comparison: ReaderDocumentComparison;
beforeEach(() => {
  vi.resetAllMocks();
  host.models.length = 0;
  host.views.length = 0;
  host.correctionRecords.clear();
  host.readCorrections.mockImplementation(
    async (_id, raw, key) =>
      host.correctionRecords.get(documentCacheSlot(key)) ?? emptyDocumentCorrections(raw, key),
  );
  host.saveCorrections.mockImplementation(async (options) => {
    if (!(await options.current())) return false;
    host.correctionRecords.set(documentCacheSlot(options.key), options.next);
    return true;
  });
  document = new DocumentFixture();
  host.window = { document, AbortController };
  host.readToken.mockReturnValue('');
  host.readSettledToken.mockImplementation(async () => host.readToken());
  host.saveToken.mockResolvedValue(undefined);
  host.checkCredential.mockResolvedValue('valid');
  host.readPDF.mockResolvedValue(new Uint8Array([1]));
  host.isCurrent.mockResolvedValue(true);
  host.request.mockResolvedValue(payload);
  host.readCache.mockResolvedValue(null);
  host.writeCache.mockResolvedValue(true);
  host.native.mockResolvedValue({
    metadata: { source: { hash: 'source' } },
    catalog: {},
    blocks: [],
  });
  comparison = new ReaderDocumentComparison({
    reader: { itemID: 1 } as ReaderRuntime,
    preferences: {
      get: (key: string, fallback: unknown) =>
        key === 'documentAnalysis.provider' ? 'oxr' : fallback,
      set: vi.fn(),
    } as unknown as PreferenceStore,
    language: () => 'en',
    themeRoot: () => () => {},
    copyText: vi.fn(),
    navigate: host.navigate,
    focusReader: vi.fn(),
    isCurrent: () => true,
    debug: vi.fn(),
    onCacheSaved: host.analysisChanged,
  });
});
const ready = async () => {
  await vi.waitFor(() => expect(document.button('parseCloud').disabled).toBe(false));
};

describe('document comparison cache workflow', () => {
  it('prefills, autosaves, clears and reopens MinerU input without secret models or automatic checks', async () => {
    let stored = 'saved-secret';
    host.readToken.mockImplementation(() => stored);
    host.saveToken.mockImplementation(async (value) => {
      stored = value;
    });
    comparison.open();
    await ready();
    host.dispatch!({ type: 'provider', value: 'mineru' });
    let input = document.nodes.find((n) => n.isConnected && n.type === 'password')!;
    await vi.waitFor(() => expect(input.value).toBe('saved-secret'));
    expect(input.value).toBe('saved-secret');
    input.value = 'new-secret';
    input.emit('input');
    expect(host.saveToken).toHaveBeenLastCalledWith('new-secret');
    expect(host.models.at(-1)?.credentialStatus).toBe('');
    comparison.close();
    comparison.open();
    await ready();
    host.dispatch!({ type: 'provider', value: 'mineru' });
    input = document.nodes.find((n) => n.isConnected && n.type === 'password')!;
    await vi.waitFor(() => expect(input.value).toBe('new-secret'));
    expect(input.value).toBe('new-secret');
    input.value = '';
    input.emit('input');
    expect(host.saveToken).toHaveBeenLastCalledWith('');
    expect(JSON.stringify(host.models)).not.toMatch(/saved-secret|new-secret/);
    expect(host.checkCredential).not.toHaveBeenCalled();
    expect(host.request).not.toHaveBeenCalled();
    expect(host.readPDF).not.toHaveBeenCalled();
    comparison.close();
  });

  it('admits rapid edits and deletion during pending writes and does not publish late storage errors', async () => {
    const slow = Promise.withResolvers<void>();
    host.saveToken.mockReturnValue(slow.promise);
    comparison.open();
    await ready();
    host.dispatch!({ type: 'provider', value: 'mineru' });
    const input = document.nodes.find((n) => n.isConnected && n.type === 'password')!;
    for (const value of ['one-secret', 'two-secret', '']) {
      input.value = value;
      input.emit('input');
      expect(input.disabled).toBe(false);
    }
    expect(host.saveToken.mock.calls.map(([value]) => value)).toEqual([
      'one-secret',
      'two-secret',
      '',
    ]);
    comparison.close();
    const count = host.models.length;
    slow.reject(new Error('locked'));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.models).toHaveLength(count);
    expect(host.checkCredential).not.toHaveBeenCalled();
  });

  it.each(['edit', 'close', 'replace', 'provider', 'endpoint'] as const)(
    'retires explicit credential verification after %s',
    async (action) => {
      const late = Promise.withResolvers<string>();
      host.checkCredential.mockReturnValue(late.promise);
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const input = document.nodes.find((n) => n.isConnected && n.type === 'password')!;
      input.value = 'captured-secret';
      input.emit('input');
      expect(host.checkCredential).not.toHaveBeenCalled();
      document.button('documentCredentials.verify').emit('click');
      await vi.waitFor(() => expect(host.checkCredential).toHaveBeenCalledOnce());
      expect(host.checkCredential).toHaveBeenCalledWith(
        'mineru',
        'captured-secret',
        expect.any(AbortSignal),
      );
      const signal = host.checkCredential.mock.calls[0]![2] as AbortSignal;
      if (action === 'edit') {
        input.value = 'new-secret';
        input.emit('input');
      } else if (action === 'close') {
        comparison.close();
      } else if (action === 'replace') {
        comparison.open();
        await ready();
      } else if (action === 'provider') {
        host.dispatch!({ type: 'provider', value: 'oxr' });
      } else {
        host.dispatch!({ type: 'endpoint', value: 'https://other.example/api' });
      }
      expect(signal.aborted).toBe(true);
      late.resolve('invalid');
      await Promise.resolve();
      await Promise.resolve();
      expect(host.models.at(-1)?.credentialStatus).not.toBe('credentials.validation.invalid');
      expect(JSON.stringify(host.models)).not.toContain('captured-secret');
      expect(host.request).not.toHaveBeenCalled();
      expect(host.readPDF).not.toHaveBeenCalled();
      comparison.close();
    },
  );

  it('saves completed composition, reports explicit verification, and never verifies or saves OXR input', async () => {
    comparison.open();
    await ready();
    host.dispatch!({ type: 'provider', value: 'mineru' });
    const input = document.nodes.find((n) => n.isConnected && n.type === 'password')!;
    input.value = 'composing-secret';
    input.emit('compositionstart');
    host.dispatch!({ type: 'credential-verify' });
    expect(host.saveToken).not.toHaveBeenCalled();
    expect(host.checkCredential).not.toHaveBeenCalled();
    input.value = 'completed-secret';
    input.emit('compositionend');
    expect(host.saveToken).toHaveBeenLastCalledWith('completed-secret');
    document.button('documentCredentials.verify').emit('click');
    await vi.waitFor(() =>
      expect(host.models.at(-1)?.credentialStatus).toBe('credentials.validation.valid'),
    );
    host.dispatch!({ type: 'credential-help' });
    expect(host.credentialHelp).toHaveBeenCalledWith('mineru');
    host.dispatch!({ type: 'provider', value: 'oxr' });
    input.value = 'oxr-secret';
    input.emit('input');
    host.dispatch!({ type: 'credential-verify' });
    expect(host.saveToken).toHaveBeenCalledOnce();
    expect(host.checkCredential).toHaveBeenCalledOnce();
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });
  it('routes a displayed target to the owning reader after checking the PDF', async () => {
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    document.button('locate').emit('click');
    await vi.waitFor(() =>
      expect(host.navigate).toHaveBeenCalledWith(expect.objectContaining({ pageIndex: 0 })),
    );
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });
  it('keeps credentials out of models including service errors', async () => {
    comparison.open();
    await ready();
    const key = document.nodes.find(
      (n) => n.isConnected && n.tag === 'input' && n.type === 'password',
    )!;
    key.value = 'secret-token';
    host.request.mockRejectedValue(new Error('request failed: secret-token'));
    document.button('refreshCloud').emit('click');
    await vi.waitFor(() =>
      expect(document.status()).toContain('Error: request failed: [redacted]'),
    );
    expect(JSON.stringify(host.models)).not.toContain('secret-token');
    comparison.close();
  });
  it('switches provider cache identities without uploading and clears credentials at the provider boundary', async () => {
    const mineru = mineruParsedDocument(source, {
      pdf_info: [
        {
          page_idx: 0,
          page_size: [600, 800],
          discarded_blocks: [],
          para_blocks: [{ type: 'table', bbox: [10, 10, 100, 100] }],
        },
      ],
    });
    host.readCache.mockImplementation(async (_source, key) =>
      key.backend === 'mineru' ? { savedAt: 2000, parsed: mineru } : cached,
    );
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    const provider = document.nodes.find((n) => n.isConnected && n.tag === 'select')!;
    const key = document.nodes.find(
      (n) => n.isConnected && n.tag === 'input' && n.type === 'password',
    )!;
    key.value = 'private OXR credential';
    provider.value = 'mineru';
    provider.emit('change');
    await vi.waitFor(() =>
      expect(document.documentElement.textContent).toContain('association.backend'),
    );
    expect(key.value).toBe('');
    expect(host.analysisChanged).not.toHaveBeenCalled();
    expect(document.documentElement.textContent).not.toContain('Fresh result');
    expect(host.request).not.toHaveBeenCalled();
    expect(host.readPDF).not.toHaveBeenCalled();
    comparison.close();
  });
  it('restores external results even when native SDT is unavailable', async () => {
    host.native.mockRejectedValue(new Error('SDT unavailable'));
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    expect(document.documentElement.textContent).toContain('Fresh result');
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });

  it('looks up an edited endpoint independently and never uploads to discover its cache', async () => {
    host.readCache.mockImplementation(async (_source, key) => ({
      ...cached,
      parsed: {
        ...cached.parsed,
        regions: cached.parsed.regions.map((r) => ({
          ...r,
          text: key.configuration.includes('other.example') ? 'Other service result' : r.text,
        })),
      },
    }));
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    const endpoint = document.nodes.find(
      (n) => n.isConnected && n.tag === 'input' && n.type === 'url',
    )!;
    endpoint.value = 'https://other.example/api/v1';
    endpoint.emit('change');
    await vi.waitFor(() =>
      expect(document.documentElement.textContent).toContain('Other service result'),
    );
    expect(document.documentElement.textContent).not.toContain('Fresh result');
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });
  it('opens cached results without reading or uploading the PDF, and refreshes only on the explicit button', async () => {
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    document.button('parseCloud').emit('click');
    await ready();
    expect(host.readPDF).not.toHaveBeenCalled();
    expect(host.request).not.toHaveBeenCalled();
    document.button('refreshCloud').emit('click');
    await vi.waitFor(() => expect(document.status()).toContain('saved'));
    expect(host.request).toHaveBeenCalledTimes(1);
    expect(await host.writeCache.mock.calls[0]![3]()).toBe(true);
    expect(host.analysisChanged).toHaveBeenCalledTimes(1);
    comparison.close();
  });

  it('does not upload on a failed cache lookup and keeps a new result usable if saving fails', async () => {
    host.readCache.mockRejectedValue(new Error('unreadable'));
    host.writeCache.mockRejectedValue(new Error('unwritable'));
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheUnavailable'));
    expect(host.request).not.toHaveBeenCalled();
    document.button('parseCloud').emit('click');
    await vi.waitFor(() => expect(document.status()).toContain('notSaved'));
    expect(host.request).toHaveBeenCalledTimes(1);
    expect(document.documentElement.textContent).toContain('Fresh result');
    expect(host.analysisChanged).not.toHaveBeenCalled();
    comparison.close();
  });

  it('contains an old lookup after close/reopen and allows an explicit refresh to supersede a lookup', async () => {
    const late = Promise.withResolvers<typeof cached>();
    host.readCache.mockReturnValueOnce(late.promise).mockResolvedValue(cached);
    comparison.open();
    await ready();
    comparison.close();
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    late.resolve({ ...cached, parsed: { ...cached.parsed, regions: [] } });
    await Promise.resolve();
    expect(document.documentElement.textContent).toContain('Fresh result');
    comparison.close();
    const slow = Promise.withResolvers<typeof cached>();
    host.readCache.mockReturnValueOnce(slow.promise);
    comparison.open();
    await ready();
    document.button('refreshCloud').emit('click');
    await vi.waitFor(() => expect(document.status()).toContain('saved'));
    slow.resolve(cached);
    await Promise.resolve();
    expect(document.status()).not.toContain('cacheReady');
    comparison.close();
  });

  it('does not save late cloud responses after close, or results whose PDF changed', async () => {
    const late = Promise.withResolvers<unknown>();
    host.request.mockReturnValueOnce(late.promise);
    comparison.open();
    await ready();
    document.button('refreshCloud').emit('click');
    await vi.waitFor(() => expect(host.request).toHaveBeenCalledTimes(1));
    comparison.close();
    late.resolve(payload);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.writeCache).not.toHaveBeenCalled();
    comparison.open();
    await ready();
    host.isCurrent.mockResolvedValue(false);
    document.button('refreshCloud').emit('click');
    await vi.waitFor(() =>
      expect(document.status()).toContain('Error: PDF changed; reopen the comparison'),
    );
    expect(host.writeCache).not.toHaveBeenCalled();
    comparison.close();
  });
  it('publishes only committed local body corrections, reopens them, restores them and undoes a saved restore', async () => {
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    const regionID = cached.parsed.regions[0]!.id;
    const pending = Promise.withResolvers<boolean>();
    host.saveCorrections.mockReturnValueOnce(pending.promise);
    host.dispatch!({ type: 'correct-body', column: 1, regionID });
    expect(host.models.at(-1)?.corrections.busy).toBe(true);
    expect(
      host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
    ).toBe(false);
    pending.resolve(false);
    await vi.waitFor(() => expect(host.models.at(-1)?.status).toContain('corrections.failed'));
    expect(
      host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
    ).toBe(false);
    host.dispatch!({ type: 'correct-body', column: 1, regionID });
    await vi.waitFor(() => expect(host.models.at(-1)?.status).toBe('corrections.saved'));
    expect(
      host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
    ).toBe(true);
    comparison.close();
    comparison.open();
    await vi.waitFor(() =>
      expect(
        host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
      ).toBe(true),
    );
    host.dispatch!({ type: 'correct-restore', column: 1, regionID });
    await vi.waitFor(() =>
      expect(
        host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
      ).toBe(false),
    );
    host.dispatch!({ type: 'correct-undo', column: 1 });
    await vi.waitFor(() =>
      expect(
        host.models.at(-1)?.columns[1]?.targets.find((t) => t.correction)?.correction?.corrected,
      ).toBe(true),
    );
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });

  it('contains a late successful correction result after the dialog owner closes', async () => {
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    const pending = Promise.withResolvers<boolean>();
    host.saveCorrections.mockReturnValueOnce(pending.promise);
    host.dispatch!({ type: 'correct-body', column: 1, regionID: cached.parsed.regions[0]!.id });
    comparison.close();
    const count = host.models.length;
    pending.resolve(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.models).toHaveLength(count);
    expect(host.models.at(-1)?.status).not.toBe('corrections.saved');
  });
  it('refuses corrections after same-ID parser output changes or the PDF is replaced', async () => {
    host.readCache.mockResolvedValue(cached);
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    host.readCache.mockResolvedValue({
      ...cached,
      parsed: {
        ...cached.parsed,
        regions: cached.parsed.regions.map((r) => ({ ...r, text: 'reparsed' })),
      },
    });
    host.dispatch!({ type: 'correct-body', column: 1, regionID: cached.parsed.regions[0]!.id });
    await vi.waitFor(() => expect(host.models.at(-1)?.status).toContain('corrections.failed'));
    expect(host.correctionRecords.size).toBe(0);
    host.isCurrent.mockResolvedValue(false);
    host.dispatch!({ type: 'correct-body', column: 1, regionID: cached.parsed.regions[0]!.id });
    await vi.waitFor(() => expect(host.models.at(-1)?.corrections.busy).toBe(false));
    expect(host.correctionRecords.size).toBe(0);
    comparison.close();
  });
  it('reassigns a caption to an explicitly selected same-page table and navigates its committed group after reopening', async () => {
    const template = cached.parsed.regions[0]!;
    const oldBody = {
      ...template,
      id: 'old-body',
      kind: 'image' as const,
      flow: 'auxiliary' as const,
      sourceBlock: { id: 'old-body-block', order: 0 },
      rect: [10, 400, 100, 500] as const,
      sourceObject: { id: 'old', kind: 'figure' as const },
    };
    const newBody = {
      ...template,
      id: 'new-body',
      kind: 'table' as const,
      flow: 'auxiliary' as const,
      sourceBlock: { id: 'new-body-block', order: 1 },
      rect: [200, 400, 400, 500] as const,
      sourceObject: { id: 'new', kind: 'table' as const },
    };
    const caption = {
      ...template,
      id: 'caption',
      kind: 'caption' as const,
      flow: 'auxiliary' as const,
      sourceBlock: { id: 'caption-block', order: 2 },
      text: 'Figure 9: Moved caption',
      rect: [10, 350, 100, 380] as const,
      sourceObject: { id: 'old', kind: 'figure' as const },
    };
    host.readCache.mockResolvedValue({
      ...cached,
      parsed: { ...cached.parsed, regions: [oldBody, newBody, caption] },
    });
    comparison.open();
    await vi.waitFor(() => expect(document.status()).toContain('cacheReady'));
    host.dispatch!({ type: 'correct-caption', column: 1, regionID: 'caption', bodyID: 'new-body' });
    await vi.waitFor(() => expect(host.models.at(-1)?.status).toBe('corrections.saved'));
    comparison.close();
    comparison.open();
    await vi.waitFor(() =>
      expect(
        host.models
          .at(-1)
          ?.columns[1]?.targets.some(
            (t) => t.correction?.regionID === 'caption' && t.correction.corrected,
          ),
      ).toBe(true),
    );
    const group = host.models
      .at(-1)!
      .columns[1]!.targets.find(
        (t) => t.id.includes(':group:') && t.text.startsWith(caption.text),
      )!;
    host.dispatch!({ type: 'locate', id: group.id });
    await vi.waitFor(() =>
      expect(host.navigate).toHaveBeenCalledWith({
        pageIndex: 0,
        rects: [newBody.rect, caption.rect],
      }),
    );
    expect(host.request).not.toHaveBeenCalled();
    comparison.close();
  });
  it.each([
    { observe: true, pending: false },
    { observe: false, pending: false },
    { observe: true, pending: true },
    { observe: false, pending: true },
  ])(
    'retires another dialog’s provider and reports cancelled corrections (observe=$observe, pending=$pending)',
    async ({ observe, pending }) => {
      const values = new Map<string, boolean | number | string>([
        ['documentAnalysis.provider', 'oxr'],
      ]);
      const listeners = new Map<string, Set<() => void>>();
      const preferences = {
        get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
        set: (key: string, value: boolean | number | string) => {
          if (values.get(key) === value) return;
          values.set(key, value);
          for (const listener of listeners.get(key) ?? []) listener();
        },
        ...(observe
          ? {
              observe: (key: string, listener: () => void) => {
                const set = listeners.get(key) ?? new Set<() => void>();
                set.add(listener);
                listeners.set(key, set);
                return () => {
                  set.delete(listener);
                };
              },
            }
          : {}),
      } as unknown as PreferenceStore;
      const make = () =>
        new ReaderDocumentComparison({
          reader: { itemID: 1 } as ReaderRuntime,
          preferences,
          language: () => 'en',
          themeRoot: () => () => {},
          copyText: vi.fn(),
          navigate: host.navigate,
          focusReader: vi.fn(),
          isCurrent: () => true,
          debug: vi.fn(),
        });
      host.readCache.mockImplementation(async (_source, key) =>
        key.backend === 'oxr' ? cached : null,
      );
      comparison = make();
      const other = make();
      comparison.open();
      const firstView = host.views.at(-1)!;
      other.open();
      const secondView = host.views.at(-1)!;
      try {
        await vi.waitFor(() => {
          expect(firstView.model.status).toBe('cacheReady');
          expect(secondView.model.status).toBe('cacheReady');
        });
        const command = {
          type: 'correct-body',
          column: 1,
          regionID: cached.parsed.regions[0]!.id,
        } as const;
        const started = Promise.withResolvers<void>();
        const gate = Promise.withResolvers<void>();
        if (pending) {
          host.saveCorrections.mockImplementationOnce(async (options) => {
            started.resolve();
            await gate.promise;
            return options.current();
          });
          firstView.dispatch(command);
          await started.promise;
          expect(firstView.model.status).toBe('corrections.saving');
        }
        secondView.dispatch({ type: 'provider', value: 'mineru' });
        if (observe) {
          expect(firstView.model.provider).toBe('mineru');
          expect(firstView.model.columns[1]?.targets).toEqual([]);
        }
        if (pending) gate.resolve();
        else firstView.dispatch(command);
        await vi.waitFor(() => expect(firstView.model.corrections.busy).toBe(false));
        expect(firstView.model.status).toContain('corrections.changed');
        expect(firstView.model.status).not.toBe('corrections.saving');
        expect(firstView.model.provider).toBe('mineru');
        expect(firstView.model.columns[1]?.targets).toEqual([]);
        expect(host.correctionRecords.size).toBe(0);
        if (!pending) expect(host.saveCorrections).not.toHaveBeenCalled();
        expect(host.request).not.toHaveBeenCalled();
      } finally {
        comparison.close();
        other.close();
      }
      expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    },
  );
});

describe('comparison settled credential storage', () => {
  it.each(['new-secret', ''])(
    'reopens with the settled shared value %j while an admitted write is pending',
    async (value) => {
      host.readToken.mockReturnValue('old-secret');
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const first = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      await vi.waitFor(() => expect(first.value).toBe('old-secret'));
      const gate = Promise.withResolvers<void>();
      const committed = gate.promise.then(() => {
        host.readToken.mockReturnValue(value);
      });
      host.saveToken.mockReturnValue(committed);
      host.readSettledToken.mockImplementation(async () => {
        await committed;
        return host.readToken();
      });
      first.value = value;
      first.emit('input');
      comparison.close();
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const reopened = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      expect(reopened.value).toBe('');
      gate.resolve();
      await committed;
      await vi.waitFor(() => expect(reopened.value).toBe(value));
      expect(host.models.at(-1)?.credentialStatus).toBe('');
      expect(host.checkCredential).not.toHaveBeenCalled();
      expect(host.request).not.toHaveBeenCalled();
      comparison.close();
    },
  );

  it.each(['edit', 'close', 'replace', 'provider'] as const)(
    'does not publish a settled prefill after %s',
    async (action) => {
      const settled = Promise.withResolvers<string>();
      host.readSettledToken.mockReturnValue(settled.promise);
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const input = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      if (action === 'edit') {
        input.value = 'fresh-secret';
        input.emit('input');
      } else if (action === 'close') {
        comparison.close();
      } else if (action === 'replace') {
        comparison.open();
        await ready();
      } else {
        host.dispatch!({ type: 'provider', value: 'oxr' });
      }
      settled.resolve('stale-secret');
      await settled.promise;
      await Promise.resolve();
      expect(input.value).toBe(
        action === 'edit' ? 'fresh-secret' : action === 'provider' ? 'dummy' : '',
      );
      expect(host.checkCredential).not.toHaveBeenCalled();
      comparison.close();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'waits for the current save to %s before processing one explicit verification',
    async (outcome) => {
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const input = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      const write = Promise.withResolvers<void>();
      host.saveToken.mockReturnValue(write.promise);
      input.value = 'unsaved-secret';
      input.emit('input');
      host.dispatch!({ type: 'credential-verify' });
      host.dispatch!({ type: 'credential-verify' });
      expect(input.disabled).toBe(false);
      expect(host.checkCredential).not.toHaveBeenCalled();
      if (outcome === 'resolve') {
        write.resolve();
        await vi.waitFor(() =>
          expect(host.models.at(-1)?.credentialStatus).toBe('credentials.validation.valid'),
        );
        expect(host.checkCredential).toHaveBeenCalledOnce();
      } else {
        write.reject(new Error('storage locked'));
        await vi.waitFor(() =>
          expect(host.models.at(-1)?.credentialStatus).toBe('documentCredentials.unavailable'),
        );
        host.dispatch!({ type: 'credential-verify' });
        expect(host.checkCredential).not.toHaveBeenCalled();
        expect(host.models.at(-1)?.credentialStatus).toBe('documentCredentials.unavailable');
      }
      expect(host.request).not.toHaveBeenCalled();
      expect(JSON.stringify(host.models)).not.toContain('unsaved-secret');
      comparison.close();
    },
  );

  it.each(['edit', 'close', 'replace', 'provider', 'endpoint'] as const)(
    'retires verification waiting on storage after %s',
    async (action) => {
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const input = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      const write = Promise.withResolvers<void>();
      host.saveToken.mockReturnValue(write.promise);
      input.value = 'pending-secret';
      input.emit('input');
      host.dispatch!({ type: 'credential-verify' });
      if (action === 'edit') {
        input.value = 'fresh-secret';
        input.emit('input');
      } else if (action === 'close') {
        comparison.close();
      } else if (action === 'replace') {
        comparison.open();
        await ready();
      } else if (action === 'provider') {
        host.dispatch!({ type: 'provider', value: 'oxr' });
      } else {
        host.dispatch!({ type: 'endpoint', value: 'https://other.example/api' });
      }
      write.resolve();
      await write.promise;
      await Promise.resolve();
      expect(host.checkCredential).not.toHaveBeenCalled();
      comparison.close();
    },
  );
});

describe('comparison prefill from another credential surface', () => {
  it.each(['external-secret', ''])(
    'waits for an externally admitted shared write of %j',
    async (value) => {
      host.readToken.mockReturnValue('old-secret');
      comparison.open();
      await ready();
      comparison.close();
      const gate = Promise.withResolvers<void>();
      const committed = gate.promise.then(() => {
        host.readToken.mockReturnValue(value);
      });
      host.saveToken.mockReturnValue(committed);
      host.readSettledToken.mockImplementation(async () => {
        await committed;
        return host.readToken();
      });
      // The shared storage port admits an edit from a different credential presentation.
      const externalWrite = host.saveToken(value);
      comparison.open();
      await ready();
      host.dispatch!({ type: 'provider', value: 'mineru' });
      const input = document.nodes.find((node) => node.isConnected && node.type === 'password')!;
      expect(input.value).toBe('');
      gate.resolve();
      await externalWrite;
      await vi.waitFor(() => expect(input.value).toBe(value));
      expect(host.checkCredential).not.toHaveBeenCalled();
      expect(host.request).not.toHaveBeenCalled();
      comparison.close();
    },
  );
});
