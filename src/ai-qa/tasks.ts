import type { AIClient } from '../ai/contracts';
import { aiErrorCode } from '../ai/errors';
import type {
  AIQARecord,
  AIQARepository,
  AIQATaskInput,
  AIQATaskState,
  AIQATasks,
} from './contracts';
import { AIQAError } from './errors';
import { parseAIQAOutput } from './output';
import { aiQAPrompt } from './prompts';

export function createAIQATasks(options: {
  client: AIClient;
  repository: AIQARepository;
  createAbortController: () => AbortController;
}): AIQATasks {
  const states = new Map<number, AIQATaskState>();
  const active = new Map<number, { controller: AbortController; id: string }>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* A subscriber cannot break a task. */
      }
    }
  };
  const idle = (itemID: number): AIQATaskState => ({
    itemID,
    taskID: null,
    phase: 'idle',
    kind: null,
    error: null,
    resultID: null,
  });
  return {
    state: (itemID) => states.get(itemID) ?? idle(itemID),
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel(itemID) {
      const job = active.get(itemID);
      if (!job) return;
      job.controller.abort();
      active.delete(itemID);
      const state = states.get(itemID)!;
      states.set(itemID, { ...state, phase: 'cancelled', error: 'cancelled' });
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of active.values()) job.controller.abort();
      active.clear();
      listeners.clear();
    },
    async run(input) {
      const itemID = input.source.itemID;
      if (disposed) throw new AIQAError('cancelled');
      if (active.has(itemID)) throw new AIQAError('busy');
      const controller = options.createAbortController();
      input = {
        ...input,
        source: { ...input.source },
        evidence: JSON.parse(JSON.stringify(input.evidence)) as AIQATaskInput['evidence'],
        images: input.images?.map((image) => ({ ...image })),
      };
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      const job = { controller, id };
      active.set(itemID, job);
      const setPhase = (
        phase: AIQATaskState['phase'],
        error: AIQATaskState['error'] = null,
        resultID: string | null = null,
      ) => {
        if (disposed || active.get(itemID) !== job) return;
        states.set(itemID, { itemID, taskID: id, kind: input.kind, phase, error, resultID });
        notify();
      };
      const current = async () => {
        if (disposed || controller.signal.aborted || active.get(itemID) !== job) return false;
        const valid = await input.isCurrent();
        return valid && !disposed && !controller.signal.aborted && active.get(itemID) === job;
      };
      const requireCurrent = async () => {
        if (!(await current()))
          throw new AIQAError(controller.signal.aborted || disposed ? 'cancelled' : 'stale-source');
      };
      try {
        setPhase('preparing');
        await requireCurrent();
        setPhase('requesting');
        const result = await options.client.generate(aiQAPrompt(input), {
          signal: controller.signal,
        });
        await requireCurrent();
        const output = parseAIQAOutput(result.output, input.evidence);
        const now = new Date().toISOString();
        const record: AIQARecord = {
          id,
          revision: 1,
          source: input.source,
          kind: input.kind,
          question: input.question,
          contextTitle: input.contextTitle,
          evidence: input.evidence,
          output,
          model: result.model,
          endpoint: result.endpoint,
          usage: result.usage,
          createdAt: now,
          updatedAt: now,
          userText: null,
        };
        setPhase('saving');
        const saved = await options.repository.add(record, current);
        setPhase('complete', null, saved.id);
        return saved;
      } catch (error) {
        const code =
          controller.signal.aborted || disposed
            ? 'cancelled'
            : error instanceof AIQAError
              ? error.code
              : aiErrorCode(error);
        setPhase(code === 'cancelled' ? 'cancelled' : 'failed', code);
        throw new AIQAError(code);
      } finally {
        if (active.get(itemID) === job) active.delete(itemID);
      }
    },
  };
}
