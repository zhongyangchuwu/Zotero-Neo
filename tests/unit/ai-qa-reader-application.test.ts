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
