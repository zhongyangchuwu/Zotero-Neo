import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderDocumentComparison } from '../../src/modules/reader-navigation/document-comparison';
import { oxrParsedDocument } from '../../src/document-analysis/oxr';
import { mineruParsedDocument } from '../../src/document-analysis/mineru';
import type { DocumentSource } from '../../src/document-analysis/contracts';
import type { ReaderRuntime } from '../../src/toolkit/reader';
import type { PreferenceStore } from '../../src/core/preference-store';

const host = vi.hoisted(() => ({
  window: null as unknown,
  readPDF: vi.fn(),
  isCurrent: vi.fn(),
  request: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
  native: vi.fn(),
  analysisChanged: vi.fn(),
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
}));
vi.mock('../../src/toolkit/reader', () => ({
  readerWindow: () => host.window,
  readerDocumentPageGeometry: async () => [{ viewRect: [0, 0, 600, 800], rotation: 0 }],
  structuredDocumentData: host.native,
}));
vi.mock('../../src/i18n', () => ({ t: (key: string) => key.replace('documentAnalysis.', '') }));

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
  document = new DocumentFixture();
  host.window = { document, AbortController };
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
    navigate: vi.fn(),
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
});
