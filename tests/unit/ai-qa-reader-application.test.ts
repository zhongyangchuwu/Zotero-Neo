import { describe, expect, it, vi } from 'vitest';
import type { AIGenerationResult, AIService } from '../../src/ai/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import { LOCAL_RULES_KEY } from '../../src/document-analysis/settings';
import type { ParsedDocument } from '../../src/document-analysis/contracts';
import type { ReaderRuntime } from '../../src/toolkit/reader';
import type { AIQASourceCapture } from '../../src/ai-qa/evidence';
import type * as EvidenceModule from '../../src/ai-qa/evidence';
import { AIQAReaderApplication } from '../../src/ai-qa/reader-application';
import { createAIQARepository, type AIQAStorage } from '../../src/ai-qa/repository';
import { createAIQATasks } from '../../src/ai-qa/tasks';

const host = vi.hoisted(() => ({
  capture: vi.fn<() => Promise<AIQASourceCapture>>(),
  cache: vi.fn(),
  prepared: vi.fn(),
}));
const adoption = vi.hoisted(() => ({ find: vi.fn(), save: vi.fn() }));
vi.mock('../../src/ai-qa/adoption', () => ({
  findAIQAAdoptions: adoption.find,
  saveAIQAToNote: adoption.save,
}));
vi.mock('../../src/ai-qa/evidence', async (importOriginal) => ({
  ...(await importOriginal<typeof EvidenceModule>()),
  captureAIQASource: host.capture,
}));
vi.mock('../../src/platform/ai-runtime', () => ({
  createAIAbortController: () => new AbortController(),
}));
vi.mock('../../src/reader/document-cache', () => ({
  readReaderDocumentCache: host.cache,
  readReaderDocument: host.prepared,
}));

const reader = { itemID: 1 } as ReaderRuntime;
const source = { itemID: 1, libraryID: 1, key: 'ABC', fingerprint: 'pdf', fileName: 'owned.pdf' };
const result: AIGenerationResult = {
  output: { paragraphs: [{ text: 'Response', evidenceIDs: ['selection'] }], guide: [] },
  model: 'fixture',
  endpoint: 'https://fixture.test/v1',
  usage: { inputTokens: null, outputTokens: null },
};

function fixture(current: () => Promise<boolean>) {
  host.cache.mockReset().mockResolvedValue(null);
  host.prepared.mockReset().mockResolvedValue(null);
  adoption.find
    .mockReset()
    .mockImplementation(async (records: { id: string }[]) =>
      Object.fromEntries(records.map((record) => [record.id, null])),
    );
  adoption.save.mockReset().mockResolvedValue({ itemID: 12, key: 'NOTE', reused: false });
  let contents: string | null = null;
  const read = vi.fn(async () => contents);
  const write = vi.fn<AIQAStorage['write']>(async (_source, value, isCurrent) => {
    if (!(await isCurrent())) return false;
    contents = value;
    return true;
  });
  const repository = createAIQARepository({ read, write });
  const generation = Promise.withResolvers<AIGenerationResult>();
  const service: AIService = {
    configuration: () => ({
      api: 'openai-chat-completions',
      endpoint: 'https://fixture.test/v1',
      model: 'fixture',
      maxOutputTokens: 100,
      sendImages: false,
      configured: true,
      hasCredential: true,
    }),
    generate: vi.fn(() => generation.promise),
    configure: vi.fn(),
    dispose: vi.fn(),
  };
  const tasks = createAIQATasks({
    client: service,
    createAbortController: () => new AbortController(),
  });
  const disposeTasks = vi.spyOn(tasks, 'dispose');
  const values = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const preferences = {
    get: (key: string, fallback: string) => values.get(key) ?? fallback,
    set: (key: string, value: string) => {
      values.set(key, value);
      for (const listener of listeners.get(key) ?? []) listener();
    },
    observe: (key: string, listener: () => void) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
  } as unknown as PreferenceStore;
  const app = new AIQAReaderApplication({
    service,
    repository,
    tasks,
    preferences,
    logger: { debug() {}, diagnostic() {} },
  });
  host.capture.mockResolvedValue({ source, isCurrent: current } as AIQASourceCapture);
  const port = {
    reader,
    captureSelection: () => ({
      text: 'Selected text',
      itemID: 1,
      pageLabel: '1',
      position: JSON.stringify({ pageIndex: 0, rects: [[0, 0, 10, 10]] }),
    }),
    captureView: () => null,
    language: () => 'en' as const,
    openNote: vi.fn(async () => {}),
  };
  return {
    app,
    tasks,
    repository,
    read,
    write,
    service,
    generation,
    port,
    disposeTasks,
    preferences,
    listeners,
  };
}

describe('headless Reader application lifetime', () => {
  it('retires a temporary answer on Reader release, without sharing it with another Reader', async () => {
    const f = fixture(async () => true);
    const release = f.app.register(f.port);
    f.app.capture(reader);
    const running = f.app.explain(reader);
    await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
    const otherReader = { itemID: 1 } as ReaderRuntime;
    f.app.register({ ...f.port, reader: otherReader });
    f.app.load(otherReader);
    f.generation.resolve(result);
    await running;
    expect(f.app.snapshot(reader)?.temporary?.record.evidence[0].text).toBe('Selected text');
    expect(f.app.snapshot(otherReader)?.temporary).toBeNull();
    expect(f.write).not.toHaveBeenCalled();
    release();
    expect(f.app.snapshot(reader)).toBeNull();
    f.app.register(f.port);
    f.app.capture(reader);
    f.app.load(reader);
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.loading).toBe(false));
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(f.app.snapshot(reader)?.records).toEqual([]);
    f.app.dispose();
    expect(f.disposeTasks).not.toHaveBeenCalled();
    expect(f.service.dispose).not.toHaveBeenCalled();
    f.tasks.dispose();
  });

  it('lets admitted preparation finish after release but never publishes its result', async () => {
    const current = Promise.withResolvers<boolean>();
    const f = fixture(() => current.promise);
    const release = f.app.register(f.port);
    f.app.capture(reader);
    const running = f.app.explain(reader);
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.task.phase).toBe('preparing'));
    release();
    current.resolve(true);
    await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
    f.generation.resolve(result);
    await running;
    expect(f.write).not.toHaveBeenCalled();
    expect(await f.repository.list(source)).toEqual([]);
    f.app.dispose();
    f.tasks.dispose();
  });

  it.each([false, true])(
    'retires cached AI context without starting work when the local profile changes (pending=%s)',
    async (pending) => {
      const f = fixture(async () => true);
      const parsed: ParsedDocument = {
        schemaVersion: 1,
        sourceFingerprint: source.fingerprint,
        backend: 'local-rules',
        modelRevision: null,
        durationMs: 0,
        pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
        regions: [
          {
            id: 'heading',
            kind: 'heading',
            flow: 'body',
            pageIndex: 0,
            rect: [20, 700, 300, 720],
            text: 'Profile chapter',
            format: 'text',
            anchorPrecision: 'region',
          },
          {
            id: 'paragraph',
            kind: 'text',
            flow: 'body',
            pageIndex: 0,
            rect: [20, 600, 300, 680],
            text: 'The current profile supplies this context.',
            format: 'text',
            anchorPrecision: 'region',
          },
        ],
      };
      const gate = Promise.withResolvers<{
        parsed: ParsedDocument;
        isCurrent: () => Promise<boolean>;
      }>();
      const snapshot = { parsed, isCurrent: async () => true };
      host.cache.mockReturnValue(pending ? gate.promise : Promise.resolve(snapshot));
      f.app.register(f.port);
      f.app.load(reader);
      await vi.waitFor(() => expect(host.cache).toHaveBeenCalledOnce());
      if (!pending)
        await vi.waitFor(() => expect(f.app.snapshot(reader)?.sections.length).toBeGreaterThan(0));
      f.preferences.set(LOCAL_RULES_KEY, '{');
      if (pending) gate.resolve(snapshot);
      await vi.waitFor(() => expect(f.app.snapshot(reader)?.loading).toBe(false));
      expect(f.app.snapshot(reader)?.sections).toEqual([]);
      expect(f.app.snapshot(reader)?.selectedSectionID).toBeNull();
      expect(f.service.generate).not.toHaveBeenCalled();
      expect(host.cache).toHaveBeenCalledOnce();
      f.app.dispose();
      expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
      f.tasks.dispose();
    },
  );
});

describe('explicit AI history saving', () => {
  it('keeps the exact answer while history loads and coalesces simultaneous saves on retry', async () => {
    const f = fixture(async () => true);
    const pendingHistory = Promise.withResolvers<null>();
    f.read.mockReturnValueOnce(pendingHistory.promise);
    const release = f.app.register(f.port);
    f.app.capture(reader);
    f.generation.resolve(result);
    await f.app.explain(reader);
    const draft = f.app.snapshot(reader)!.temporary!.record;
    const save = { type: 'save-history', resultID: draft.id, revision: draft.revision } as const;
    expect(f.app.snapshot(reader)?.historyLoading).toBe(true);
    expect(f.write).not.toHaveBeenCalled();
    await f.app.dispatch(reader, save);
    expect(f.app.snapshot(reader)?.temporary).toMatchObject({
      record: draft,
      saveError: 'history-loading',
    });
    pendingHistory.resolve(null);
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.historyLoading).toBe(false));

    await Promise.all([f.app.dispatch(reader, save), f.app.dispatch(reader, save)]);
    await f.app.dispatch(reader, save);
    expect(f.write).toHaveBeenCalledOnce();
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(f.app.snapshot(reader)?.notice).toBe('historySaved');
    expect(await f.repository.list(source)).toEqual([draft]);
    release();

    f.app.register(f.port);
    f.app.load(reader);
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toEqual([draft]));
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(f.write).toHaveBeenCalledOnce();
    f.app.dispose();
    f.tasks.dispose();
  });

  it('retains the previous answer on generation and write failure, then saves it on retry', async () => {
    const f = fixture(async () => true);
    f.app.register(f.port);
    f.app.capture(reader);
    f.generation.resolve(result);
    await f.app.explain(reader);
    const draft = f.app.snapshot(reader)!.temporary!.record;
    const save = { type: 'save-history', resultID: draft.id, revision: draft.revision } as const;
    vi.mocked(f.service.generate).mockRejectedValueOnce(new Error('offline'));
    await f.app.dispatch(reader, { type: 'ask', question: 'Replacement answer?' });
    expect(f.app.snapshot(reader)?.temporary?.record).toEqual(draft);
    expect(f.write).not.toHaveBeenCalled();

    f.write.mockRejectedValueOnce(new Error('could not publish'));
    await f.app.dispatch(reader, save);
    expect(f.app.snapshot(reader)?.temporary).toMatchObject({
      record: draft,
      saving: false,
      saveError: 'storage',
    });
    expect(await f.repository.list(source)).toEqual([]);
    await f.app.dispatch(reader, save);
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(await f.repository.list(source)).toEqual([draft]);
    expect(f.write).toHaveBeenCalledTimes(2);
    f.app.dispose();
    f.tasks.dispose();
  });

  it('reconciles a published result when its first save failed while refreshing history', async () => {
    const f = fixture(async () => true);
    f.app.register(f.port);
    f.app.capture(reader);
    f.generation.resolve(result);
    await f.app.explain(reader);
    const draft = f.app.snapshot(reader)!.temporary!.record;
    const save = { type: 'save-history', resultID: draft.id, revision: draft.revision } as const;
    const persist = f.write.getMockImplementation()!;
    f.write.mockImplementationOnce(async (...args) => {
      await persist(...args);
      throw new Error('post-publication refresh failed');
    });
    await f.app.dispatch(reader, save);
    expect(f.app.snapshot(reader)?.temporary?.saveError).toBe('storage');
    await f.app.dispatch(reader, save);
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(f.app.snapshot(reader)?.records).toEqual([draft]);
    expect(f.write).toHaveBeenCalledOnce();
    f.app.dispose();
    f.tasks.dispose();
  });

  it('saves only the dispatched record when another answer replaces it during the write', async () => {
    const f = fixture(async () => true);
    f.app.register(f.port);
    f.app.capture(reader);
    f.generation.resolve(result);
    await f.app.explain(reader);
    const first = f.app.snapshot(reader)!.temporary!.record;
    const staged = Promise.withResolvers<void>();
    const persist = f.write.getMockImplementation()!;
    f.write.mockImplementationOnce(async (...args) => {
      await staged.promise;
      return persist(...args);
    });
    const saving = f.app.dispatch(reader, {
      type: 'save-history',
      resultID: first.id,
      revision: first.revision,
    });
    await vi.waitFor(() => expect(f.write).toHaveBeenCalledOnce());
    await f.app.dispatch(reader, { type: 'ask', question: 'New answer?' });
    const next = f.app.snapshot(reader)!.temporary!.record;
    expect(next.id).not.toBe(first.id);
    staged.resolve();
    await saving;
    expect(f.app.snapshot(reader)?.temporary?.record).toEqual(next);
    expect(await f.repository.list(source)).toEqual([first]);
    f.app.dispose();
    f.tasks.dispose();
  });

  it('does not commit a staged history save after its PDF source changes', async () => {
    let current = true;
    const f = fixture(async () => current);
    f.app.register(f.port);
    f.app.capture(reader);
    f.generation.resolve(result);
    await f.app.explain(reader);
    const draft = f.app.snapshot(reader)!.temporary!.record;
    const staged = Promise.withResolvers<void>();
    const persist = f.write.getMockImplementation()!;
    f.write.mockImplementationOnce(async (...args) => {
      await staged.promise;
      return persist(...args);
    });
    const saving = f.app.dispatch(reader, {
      type: 'save-history',
      resultID: draft.id,
      revision: draft.revision,
    });
    await vi.waitFor(() => expect(f.write).toHaveBeenCalledOnce());
    current = false;
    staged.resolve();
    await saving;
    expect(f.app.snapshot(reader)?.temporary).toMatchObject({
      record: draft,
      saveError: 'stale-source',
    });
    expect(await f.repository.list(source)).toEqual([]);
    f.app.dispose();
    f.tasks.dispose();
  });
});

it('opens only a revalidated note and reports a deleted note instead of opening it', async () => {
  const f = fixture(async () => true);
  f.app.register(f.port);
  f.app.capture(reader);
  const running = f.app.explain(reader);
  await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
  f.generation.resolve(result);
  await running;
  const record = f.app.snapshot(reader)!.temporary!.record;
  await f.app.dispatch(reader, {
    type: 'save-note',
    resultID: record.id,
    revision: record.revision,
  });
  expect(f.app.snapshot(reader)?.notice).toBe('adoptedCreated');
  expect(f.write).not.toHaveBeenCalled();
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual({
    itemID: 12,
    key: 'NOTE',
    reused: false,
  });
  adoption.find.mockResolvedValue({ [record.id]: { itemID: 12, key: 'NOTE', reused: true } });
  await f.app.dispatch(reader, {
    type: 'open-note',
    resultID: record.id,
    revision: record.revision,
  });
  expect(f.port.openNote).toHaveBeenCalledWith(12);
  adoption.find.mockResolvedValue({ [record.id]: 'unavailable' });
  await f.app.dispatch(reader, {
    type: 'open-note',
    resultID: record.id,
    revision: record.revision,
  });
  expect(f.port.openNote).toHaveBeenCalledTimes(1);
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toBe('unavailable');
  f.app.dispose();
  f.tasks.dispose();
});

it('publishes a completed save after a newer preview without replacing its notice', async () => {
  const f = fixture(async () => true);
  f.app.register(f.port);
  f.app.capture(reader);
  const running = f.app.explain(reader);
  await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
  f.generation.resolve(result);
  await running;
  const record = f.app.snapshot(reader)!.temporary!.record;
  const saved = Promise.withResolvers<{ itemID: number; key: string; reused: boolean }>();
  adoption.save.mockReturnValueOnce(saved.promise);
  const saving = f.app.dispatch(reader, {
    type: 'save-note',
    resultID: record.id,
    revision: record.revision,
  });
  await vi.waitFor(() => expect(adoption.save).toHaveBeenCalledOnce());
  await f.app.dispatch(reader, {
    type: 'preview',
    resultID: record.id,
    evidenceID: record.evidence[0]!.id,
  });
  const notice = f.app.snapshot(reader)!.notice;
  const receipt = { itemID: 12, key: 'NOTE', reused: false };
  saved.resolve(receipt);
  await saving;
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual(receipt);
  expect(f.app.snapshot(reader)?.notice).toBe(notice);
  f.app.dispose();
  f.tasks.dispose();
});

it('keeps a new result and a concurrent save when its earlier adoption lookup finishes', async () => {
  const f = fixture(async () => true);
  f.app.register(f.port);
  f.app.capture(reader);
  const first = f.app.explain(reader);
  await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
  f.generation.resolve(result);
  await first;
  const record = f.app.snapshot(reader)!.temporary!.record;
  await f.app.dispatch(reader, { type: 'save-history', resultID: record.id, revision: 1 });
  await f.app.explain(reader);
  const next = f.app.snapshot(reader)!.temporary!.record;
  await f.app.dispatch(reader, { type: 'save-history', resultID: next.id, revision: 1 });
  const lookup = Promise.withResolvers<Record<string, null>>();
  let lookupIDs: string[] = [];
  adoption.find.mockImplementation(async (records: { id: string }[]) => {
    if (records.length === 2) {
      lookupIDs = records.map((entry) => entry.id);
      return lookup.promise;
    }
    return Object.fromEntries(records.map((entry) => [entry.id, null]));
  });
  f.app.load(reader);
  await vi.waitFor(() => expect(lookupIDs).toHaveLength(2));
  await f.app.dispatch(reader, {
    type: 'save-note',
    resultID: record.id,
    revision: record.revision,
  });
  const receipt = { itemID: 12, key: 'NOTE', reused: false };
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual(receipt);
  lookup.resolve(Object.fromEntries(lookupIDs.map((id) => [id, null])));
  await vi.waitFor(() => expect(f.app.snapshot(reader)?.historyLoading).toBe(false));
  expect(f.app.snapshot(reader)?.records).toHaveLength(2);
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual(receipt);
  expect(f.app.snapshot(reader)?.adoptions[lookupIDs.find((id) => id !== record.id)!]).toBeNull();
  f.app.dispose();
  f.tasks.dispose();
});

it.each(['preparing', 'requesting'] as const)(
  'does not apply retired chapter context while %s',
  async (phase) => {
    const finalCheck = Promise.withResolvers<boolean>();
    const checking = Promise.withResolvers<void>();
    let holdSourceCheck = false;
    const f = fixture(async () => {
      if (!holdSourceCheck) return true;
      checking.resolve();
      return finalCheck.promise;
    });
    const parsed: ParsedDocument = {
      schemaVersion: 1,
      sourceFingerprint: source.fingerprint,
      backend: 'local-rules',
      modelRevision: null,
      durationMs: 0,
      pages: [{ pageIndex: 0, viewBox: [0, 0, 600, 800], rotation: 0 }],
      regions: [
        {
          id: 'heading',
          kind: 'heading',
          flow: 'body',
          pageIndex: 0,
          rect: [20, 700, 300, 720],
          text: 'Retired profile chapter',
          format: 'text',
          anchorPrecision: 'region',
        },
        {
          id: 'paragraph',
          kind: 'text',
          flow: 'body',
          pageIndex: 0,
          rect: [20, 600, 300, 680],
          text: 'Context from the previous local rule profile.',
          format: 'text',
          anchorPrecision: 'region',
        },
      ],
    };
    f.app.register(f.port);
    f.app.load(reader);
    await vi.waitFor(() => expect(host.cache).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.loading).toBe(false));
    host.prepared.mockImplementationOnce(async () => {
      holdSourceCheck = phase === 'preparing';
      return { parsed, origin: 'local', textRegions: parsed.regions, isCurrent: async () => true };
    });
    const running = f.app.dispatch(reader, { type: 'guide' });
    if (phase === 'preparing') await checking.promise;
    else await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
    f.preferences.set(LOCAL_RULES_KEY, '{');
    if (phase === 'preparing') finalCheck.resolve(true);
    else
      f.generation.resolve({
        ...result,
        output: { paragraphs: [{ text: 'Stale chapter answer', evidenceIDs: [] }], guide: [] },
      });
    await running;
    expect(f.app.snapshot(reader)?.sections).toEqual([]);
    expect(f.app.snapshot(reader)?.selectedSectionID).toBeNull();
    expect(f.app.snapshot(reader)?.temporary).toBeNull();
    expect(f.service.generate).toHaveBeenCalledTimes(phase === 'preparing' ? 0 : 1);
    expect(f.write).not.toHaveBeenCalled();
    f.app.dispose();
    f.tasks.dispose();
  },
);
