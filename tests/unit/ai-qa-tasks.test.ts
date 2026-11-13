import { describe, expect, it, vi } from 'vitest';
import { createAIQATasks } from '../../src/ai-qa/tasks';
import { createAIQARepository, type AIQAStorage } from '../../src/ai-qa/repository';
import type { AIClient, AIGenerationResult } from '../../src/ai/contracts';
import type { AIQATaskInput } from '../../src/ai-qa/contracts';

const result: AIGenerationResult = {
  output: { paragraphs: [{ text: 'Answer', evidenceIDs: ['a'] }], guide: [] },
  model: 'actual-model',
  endpoint: 'https://example.test',
  usage: { inputTokens: 4, outputTokens: 2 },
};
const input: AIQATaskInput = {
  source: { itemID: 1, libraryID: 2, key: 'ABC', fingerprint: 'v1', fileName: 'paper.pdf' },
  kind: 'question',
  question: 'Why?',
  contextTitle: 'Paper',
  evidence: [
    {
      id: 'a',
      kind: 'text',
      title: 'Excerpt',
      text: 'Evidence',
      format: 'text',
      pageLabel: '1',
      precision: 'text',
      location: null,
      nativePosition: null,
    },
  ],
  isCurrent: async () => true,
};
function setup(generate: AIClient['generate']) {
  let contents: string | null = null;
  const storage: AIQAStorage = {
    async read() {
      return contents;
    },
    async write(_source, value, current) {
      if (!(await current())) return false;
      contents = value;
      return true;
    },
  };
  const repository = createAIQARepository(storage);
  return {
    repository,
    tasks: createAIQATasks({
      client: { generate },
      repository,
      createAbortController: () => new AbortController(),
    }),
  };
}
describe('reader AI tasks', () => {
  it('prevents duplicate requests and retires a cancelled late model response', async () => {
    const { promise, resolve } = Promise.withResolvers<AIGenerationResult>();
    const generate = vi.fn(() => promise);
    const { tasks, repository } = setup(generate);
    const running = tasks.run(input);
    const rejected = expect(running).rejects.toThrow('cancelled');
    await expect(tasks.run(input)).rejects.toThrow('busy');
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    tasks.cancel(input.source.itemID);
    resolve(result);
    await rejected;
    expect(tasks.state(1).phase).toBe('cancelled');
    expect(await repository.list(input.source)).toEqual([]);
  });
  it('rejects a source changed during a request, and invalid model references', async () => {
    let current = true;
    const { tasks, repository } = setup(async () => {
      current = false;
      return result;
    });
    await expect(tasks.run({ ...input, isCurrent: async () => current })).rejects.toThrow(
      'stale-source',
    );
    expect(await repository.list(input.source)).toEqual([]);
    const invalid = setup(async () => ({
      ...result,
      output: { paragraphs: [{ text: 'Claim', evidenceIDs: ['missing'] }], guide: [] },
    }));
    await expect(invalid.tasks.run(input)).rejects.toThrow('invalid-output');
    expect(await invalid.repository.list(input.source)).toEqual([]);
  });
  it('does not commit when the source changes while the write is staged', async () => {
    const staged = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let contents: string | null = null;
    let current = true;
    const storage: AIQAStorage = {
      async read() {
        return contents;
      },
      async write(_source, value, isCurrent) {
        staged.resolve();
        await release.promise;
        if (!(await isCurrent())) return false;
        contents = value;
        return true;
      },
    };
    const repository = createAIQARepository(storage);
    const tasks = createAIQATasks({
      client: { generate: async () => result },
      repository,
      createAbortController: () => new AbortController(),
    });
    const running = tasks.run({ ...input, isCurrent: async () => current });
    const rejected = expect(running).rejects.toThrow('stale-source');
    await staged.promise;
    current = false;
    release.resolve();
    await rejected;
    expect(contents).toBeNull();
  });
  it('persists completed results without ephemeral image bytes', async () => {
    const generate = vi.fn<AIClient['generate']>(async () => result);
    const { tasks, repository } = setup(generate);
    const saved = await tasks.run({
      ...input,
      images: [{ evidenceID: input.evidence[0]!.id, data: 'base64-image', mediaType: 'image/png' }],
    });
    expect((await repository.list(input.source)).map((record) => record.id)).toEqual([saved.id]);
    expect(JSON.stringify(await repository.list(input.source))).not.toContain('base64-image');
  });
});
