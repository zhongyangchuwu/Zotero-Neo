import { describe, expect, it, vi } from 'vitest';
import { createAIQATasks } from '../../src/ai-qa/tasks';
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
  return createAIQATasks({
    client: { generate },
    createAbortController: () => new AbortController(),
  });
}
describe('reader AI tasks', () => {
  it('prevents duplicate requests and retires a cancelled late model response', async () => {
    const { promise, resolve } = Promise.withResolvers<AIGenerationResult>();
    const generate = vi.fn(() => promise);
    const tasks = setup(generate);
    const running = tasks.run(input);
    const rejected = expect(running).rejects.toThrow('cancelled');
    await expect(tasks.run(input)).rejects.toThrow('busy');
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    tasks.cancel(input.source.itemID);
    resolve(result);
    await rejected;
    expect(tasks.state(1).phase).toBe('cancelled');
  });
  it('rejects a source changed during a request, and invalid model references', async () => {
    let current = true;
    const tasks = setup(async () => {
      current = false;
      return result;
    });
    await expect(tasks.run({ ...input, isCurrent: async () => current })).rejects.toThrow(
      'stale-source',
    );
    const invalid = setup(async () => ({
      ...result,
      output: { paragraphs: [{ text: 'Claim', evidenceIDs: ['missing'] }], guide: [] },
    }));
    await expect(invalid.run(input)).rejects.toThrow('invalid-output');
    expect(invalid.state(input.source.itemID).phase).toBe('failed');
  });
  it.each(['explain', 'question', 'guide'] as const)(
    'returns a validated %s answer without any history dependency or image bytes',
    async (kind) => {
      const generate = vi.fn<AIClient['generate']>(async () => result);
      const tasks = setup(generate);
      const answer = await tasks.run({
        ...input,
        kind,
        images: [
          { evidenceID: input.evidence[0]!.id, data: 'base64-image', mediaType: 'image/png' },
        ],
      });
      expect(answer).toMatchObject({
        kind,
        source: input.source,
        evidence: input.evidence,
        output: result.output,
        revision: 1,
      });
      expect(JSON.stringify(answer)).not.toContain('base64-image');
      expect(tasks.state(input.source.itemID).phase).toBe('complete');
    },
  );
});
