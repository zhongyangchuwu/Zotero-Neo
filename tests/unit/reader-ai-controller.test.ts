import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate as drain } from 'node:timers/promises';
import type { AIGenerationRequest, AIGenerationResult } from '../../src/ai/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { ReaderSelectionContext } from '../../src/core/contracts';
import type { ReaderAIPanelCallbacks, ReaderRuntime } from '../../src/toolkit/reader';
import type { ReaderAISourceCapture } from '../../src/reader-ai/evidence';
import type * as EvidenceModule from '../../src/reader-ai/evidence';
import type { ReaderAICommand, ReaderAIViewModel } from '../../src/reader-ai/view-contracts';
import type { ReaderDocumentSnapshot } from '../../src/reader/document-cache';
import type { DocumentRegion } from '../../src/document-analysis/contracts';
import { ReaderAIController } from '../../src/reader-ai/controller';

const host = vi.hoisted(() => ({
  generate: vi.fn<(request: AIGenerationRequest) => Promise<AIGenerationResult>>(),
  capture: vi.fn<() => Promise<ReaderAISourceCapture>>(),
  render: vi.fn(),
  current: vi.fn<() => Promise<boolean>>(),
  model: null as ReaderAIViewModel | null,
  dispatch: null as ((command: ReaderAICommand) => void) | null,
  contents: null as string | null,
  nativeDocument: null as ReaderDocumentSnapshot | null,
}));
vi.mock('../../src/ai/service', () => ({
  createAIService: () => ({
    configuration: () => ({
      api: 'openai-chat-completions',
      endpoint: 'https://fixture.test/v1',
      model: 'fixture',
      maxOutputTokens: 100,
      sendImages: false,
      configured: true,
      hasCredential: true,
    }),
    generate: host.generate,
    configure: async () => {},
    dispose() {},
  }),
}));
vi.mock('../../src/platform/ai-runtime', () => ({
  createAIAbortController: () => new AbortController(),
}));
vi.mock('../../src/platform/reader-ai-ui', () => ({ releaseReaderAIUI() {} }));
vi.mock('../../src/platform/reader-ai-storage', () => ({
  attachmentReadingStorage: () => ({
    read: async () => host.contents,
    write: async (_source: unknown, contents: string, current: () => Promise<boolean>) => {
      if (!(await current())) return false;
      host.contents = contents;
      return true;
    },
  }),
}));
vi.mock('../../src/reader-ai/evidence', async (importOriginal) => ({
  ...(await importOriginal<typeof EvidenceModule>()),
  captureReaderAISource: host.capture,
}));
vi.mock('../../src/reader/document-cache', () => ({
  readReaderDocumentCache: async () => null,
  readReaderDocument: async () => host.nativeDocument,
}));
vi.mock('../../src/reader-ai/view-host', () => ({
  mountReaderAIView: async (
    _uri: string,
    _lease: unknown,
    model: ReaderAIViewModel,
    dispatch: (command: ReaderAICommand) => void,
  ) => {
    host.model = model;
    host.dispatch = dispatch;
    return {
      update: (value: ReaderAIViewModel) => {
        host.model = value;
      },
      dispose() {},
    };
  },
}));
vi.mock('../../src/toolkit/reader', () => ({
  readerRegionPreview: (...args: unknown[]) => host.render(...args),
  ReaderAIPanelHost: class {
    callbacks: ReaderAIPanelCallbacks;
    release: (() => void) | null = null;
    readonly root = {
      ownerDocument: { createElementNS: () => ({ addEventListener() {}, textContent: '' }) },
      replaceChildren() {},
    } as unknown as HTMLElement;
    constructor(_id: string, _icon: string, callbacks: ReaderAIPanelCallbacks) {
      this.callbacks = callbacks;
    }
    open(reader: ReaderRuntime) {
      const lease = {
        reader,
        root: this.root,
        window: {} as Window,
        ownsWindow: false,
        isCurrent: () => true,
      };
      this.release ??= this.callbacks.mount(lease);
      this.callbacks.activate(lease);
      return true;
    }
    close() {}
    releaseReader() {
      this.release?.();
      this.release = null;
    }
    ownsTarget() {
      return false;
    }
    dispose() {
      this.release?.();
    }
  },
}));

const selection = (text: string, pageIndex = 0): ReaderSelectionContext => ({
  text,
  itemID: 1,
  pageLabel: String(pageIndex + 1),
  position: JSON.stringify({ pageIndex, rects: [[0, 0, 10, 10]] }),
});
const result: AIGenerationResult = {
  output: { paragraphs: [{ text: 'Fixture response', evidenceIDs: ['selection'] }], guide: [] },
  model: 'fixture',
  endpoint: 'https://fixture.test/v1',
  usage: { inputTokens: null, outputTokens: null },
};
const capture = {
  source: { itemID: 1, libraryID: 1, key: 'ABC', fingerprint: 'pdf', fileName: 'owned.pdf' },
  isCurrent: () => host.current(),
} as ReaderAISourceCapture;
let controller: ReaderAIController;
const reader = { itemID: 1 } as ReaderRuntime;
beforeEach(() => {
  host.generate.mockReset().mockResolvedValue(result);
  host.capture.mockReset().mockResolvedValue(capture);
  host.current.mockReset().mockResolvedValue(true);
  host.render
    .mockReset()
    .mockResolvedValue({ dataURL: 'data:image/png;base64,AA==', width: 1, height: 1 });
  host.model = null;
  host.dispatch = null;
  host.contents = null;
  host.nativeDocument = null;
  controller = new ReaderAIController({
    pluginID: 'fixture',
    rootURI: 'file:///fixture/',
    preferences: {} as PreferenceStore,
    logger: { debug() {}, diagnostic() {} },
  });
  controller.register({
    reader,
    captureSelection: () => selection('initial'),
    captureView: () => null,
    language: () => 'en',
    themeRoot: () => () => {},
    showStatus() {},
  });
});
afterEach(() => controller.dispose());

describe('Reader AI invocation ownership', () => {
  it('does not retarget an accepted selection while source loading is pending', async () => {
    const loading = Promise.withResolvers<ReaderAISourceCapture>();
    host.capture.mockReturnValue(loading.promise);
    const running = controller.explain(reader, selection('original selection'));
    controller.open(reader, selection('later selection'));
    loading.resolve(capture);
    await running;
    const prompt = JSON.parse(host.generate.mock.calls[0][0].prompt) as {
      evidence: { text: string }[];
    };
    expect(prompt.evidence.map((entry) => entry.text)).toEqual(['original selection']);
    expect(JSON.parse(host.contents!).records[0].evidence[0].text).toBe('original selection');
  });

  it('keeps a successful successor visible after a cancelled old request rejects late', async () => {
    controller.open(reader);
    await vi.waitFor(() => expect(host.model?.source?.itemID).toBe(1));
    const old = Promise.withResolvers<AIGenerationResult>();
    host.generate.mockImplementationOnce(() => old.promise);
    host.dispatch!({ type: 'ask', question: 'old request' });
    await vi.waitFor(() => expect(host.generate).toHaveBeenCalledTimes(1));
    host.dispatch!({ type: 'cancel' });
    host.dispatch!({ type: 'ask', question: 'successor' });
    await vi.waitFor(() =>
      expect(host.model?.records.some((value) => value.record.question === 'successor')).toBe(true),
    );
    old.reject(new Error('late transport failure'));
    await drain();
    expect(host.model?.task.phase).toBe('complete');
    expect(host.model?.error).toBeNull();
    expect(host.model?.records.map((value) => value.record.question)).toEqual(['successor']);
  });

  it('does not publish or rasterize an older preview after a newer validation completes', async () => {
    await controller.explain(reader, selection('first source', 0));
    await controller.explain(reader, selection('second source', 1));
    const records = JSON.parse(host.contents!).records as { id: string }[];
    await vi.waitFor(() =>
      expect(host.model?.records.map((value) => value.record.id)).toEqual(
        records.map((record) => record.id),
      ),
    );
    const first = Promise.withResolvers<boolean>(),
      second = Promise.withResolvers<boolean>();
    host.current
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    host.dispatch!({ type: 'preview', resultID: records[0].id, evidenceID: 'selection' });
    host.dispatch!({ type: 'preview', resultID: records[1].id, evidenceID: 'selection' });
    second.resolve(true);
    await vi.waitFor(() => expect(host.model?.preview?.id).toBe(`${records[1].id}/selection`));
    first.resolve(true);
    await drain();
    expect(host.model?.preview?.id).toBe(`${records[1].id}/selection`);
    expect(host.render).toHaveBeenCalledTimes(1);
    expect(host.render.mock.calls[0][1].pageIndex).toBe(1);
  });

  it('closes a pending validation before it can rasterize or publish a preview', async () => {
    await controller.explain(reader, selection('source'));
    const record = JSON.parse(host.contents!).records[0] as { id: string };
    await vi.waitFor(() =>
      expect(host.model?.records.some((value) => value.record.id === record.id)).toBe(true),
    );
    const pending = Promise.withResolvers<boolean>();
    host.current.mockImplementationOnce(() => pending.promise);
    host.dispatch!({ type: 'preview', resultID: record.id, evidenceID: 'selection' });
    host.dispatch!({ type: 'close' });
    pending.resolve(true);
    await drain();
    controller.open(reader);
    await drain();
    expect(host.render).not.toHaveBeenCalled();
    expect(host.model?.preview).toBeNull();
  });
  it('keeps a native-only chapter choice instead of silently requesting the first chapter', async () => {
    const region = (
      id: string,
      kind: DocumentRegion['kind'],
      pageIndex: number,
      text: string,
    ): DocumentRegion => ({
      id,
      kind,
      pageIndex,
      text,
      rect: [0, 0, 100, 10],
      format: 'text',
      flow: 'body',
      anchorPrecision: 'region',
    });
    const regions = [
      region('first-heading', 'heading', 0, 'First chapter'),
      region('first-body', 'text', 0, 'First chapter source'),
      region('second-heading', 'heading', 1, 'Second chapter'),
      region('second-body', 'text', 1, 'Second chapter source'),
    ];
    host.nativeDocument = {
      origin: 'native',
      textRegions: regions,
      isCurrent: async () => true,
      parsed: {
        schemaVersion: 1,
        sourceFingerprint: 'pdf',
        backend: 'native',
        modelRevision: null,
        durationMs: 0,
        pages: [0, 1].map((pageIndex) => ({
          pageIndex,
          viewBox: [0, 0, 600, 800] as const,
          rotation: 0 as const,
        })),
        regions,
      },
    };
    host.generate.mockResolvedValue({
      ...result,
      output: { paragraphs: [{ text: 'Native chapter result', evidenceIDs: [] }], guide: [] },
    });
    controller.open(reader);
    await vi.waitFor(() => expect(host.model?.source?.itemID).toBe(1));
    host.dispatch!({ type: 'guide' });
    await vi.waitFor(() => expect(host.model?.records).toHaveLength(1));
    host.dispatch!({ type: 'select-section', id: 'second-heading' });
    await vi.waitFor(() => expect(host.model?.selectedSectionID).toBe('second-heading'));
    host.dispatch!({ type: 'guide' });
    await vi.waitFor(() => expect(host.generate).toHaveBeenCalledTimes(2));
    const prompt = JSON.parse(host.generate.mock.calls[1][0].prompt) as {
      evidence: { text: string }[];
    };
    expect(prompt.evidence.map((entry) => entry.text)).toContain('Second chapter source');
    expect(prompt.evidence.map((entry) => entry.text)).not.toContain('First chapter source');
  });
});
