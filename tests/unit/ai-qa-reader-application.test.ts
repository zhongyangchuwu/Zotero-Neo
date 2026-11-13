import { describe, expect, it, vi } from 'vitest';
import type { AIGenerationResult, AIService } from '../../src/ai/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
import type { ReaderRuntime } from '../../src/toolkit/reader';
import type { AIQASourceCapture } from '../../src/ai-qa/evidence';
import type * as EvidenceModule from '../../src/ai-qa/evidence';
import { AIQAReaderApplication } from '../../src/ai-qa/reader-application';
import { createAIQARepository } from '../../src/ai-qa/repository';
import { createAIQATasks } from '../../src/ai-qa/tasks';

const host = vi.hoisted(() => ({ capture: vi.fn<() => Promise<AIQASourceCapture>>() }));
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
  readReaderDocumentCache: async () => null,
  readReaderDocument: async () => null,
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
  adoption.find
    .mockReset()
    .mockImplementation(async (records: { id: string }[]) =>
      Object.fromEntries(records.map((record) => [record.id, null])),
    );
  adoption.save.mockReset().mockResolvedValue({ itemID: 12, key: 'NOTE', reused: false });
  let contents: string | null = null;
  const repository = createAIQARepository({
    read: async () => contents,
    write: async (_source, value, isCurrent) => {
      if (!(await isCurrent())) return false;
      contents = value;
      return true;
    },
  });
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
    repository,
    createAbortController: () => new AbortController(),
  });
  const disposeTasks = vi.spyOn(tasks, 'dispose');
  const app = new AIQAReaderApplication({
    service,
    repository,
    tasks,
    preferences: {} as PreferenceStore,
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
  return { app, tasks, repository, service, generation, port, disposeTasks };
}

describe('headless Reader application lifetime', () => {
  it('persists an admitted request after reader release and reloads it in a new session', async () => {
    const f = fixture(async () => true);
    const release = f.app.register(f.port);
    f.app.capture(reader);
    const running = f.app.explain(reader);
    await vi.waitFor(() => expect(f.service.generate).toHaveBeenCalledOnce());
    release();
    expect(f.app.snapshot(reader)).toBeNull();
    f.generation.resolve(result);
    await running;
    expect((await f.repository.list(source))[0].evidence[0].text).toBe('Selected text');
    f.app.register(f.port);
    f.app.capture(reader);
    f.app.load(reader);
    await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toHaveLength(1));
    f.app.dispose();
    expect(f.disposeTasks).not.toHaveBeenCalled();
    expect(f.service.dispose).not.toHaveBeenCalled();
    f.tasks.dispose();
  });

  it('allows preparation already accepted to finish after reader release', async () => {
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
    expect(
      (await f.repository.list(source)).map((record) => ({
        kind: record.kind,
        text: record.evidence[0].text,
        output: record.output.paragraphs[0].text,
      })),
    ).toEqual([{ kind: 'explain', text: 'Selected text', output: 'Response' }]);
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
  await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toHaveLength(1));
  const record = f.app.snapshot(reader)!.records[0]!;
  await f.app.dispatch(reader, {
    type: 'save-note',
    resultID: record.id,
    revision: record.revision,
  });
  expect(f.app.snapshot(reader)?.notice).toBe('adoptedCreated');
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
  await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toHaveLength(1));
  const record = f.app.snapshot(reader)!.records[0]!;
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
  await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toHaveLength(1));
  const record = f.app.snapshot(reader)!.records[0]!;
  const lookup = Promise.withResolvers<Record<string, null>>();
  let lookupIDs: string[] = [];
  adoption.find.mockImplementation(async (records: { id: string }[]) => {
    if (records.length === 2) {
      lookupIDs = records.map((entry) => entry.id);
      return lookup.promise;
    }
    return Object.fromEntries(records.map((entry) => [entry.id, null]));
  });
  await f.app.explain(reader);
  await vi.waitFor(() => expect(lookupIDs).toHaveLength(2));
  await f.app.dispatch(reader, {
    type: 'save-note',
    resultID: record.id,
    revision: record.revision,
  });
  const receipt = { itemID: 12, key: 'NOTE', reused: false };
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual(receipt);
  lookup.resolve(Object.fromEntries(lookupIDs.map((id) => [id, null])));
  await vi.waitFor(() => expect(f.app.snapshot(reader)?.records).toHaveLength(2));
  expect(f.app.snapshot(reader)?.adoptions[record.id]).toEqual(receipt);
  expect(f.app.snapshot(reader)?.adoptions[lookupIDs.find((id) => id !== record.id)!]).toBeNull();
  f.app.dispose();
  f.tasks.dispose();
});
