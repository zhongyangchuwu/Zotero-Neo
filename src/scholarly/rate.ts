import { ScholarlyError, type ScholarlySource } from './contracts';

interface WaitingRequest {
  signal: AbortSignal;
  start(): void;
  cancel(): void;
}
interface Gate {
  lastStart: number | null;
  active: number;
  timer?: ReturnType<typeof setTimeout>;
  queue: WaitingRequest[];
}
const gates: Record<ScholarlySource, Gate> = {
  'semantic-scholar': { lastStart: null, active: 0, queue: [] },
  arxiv: { lastStart: null, active: 0, queue: [] },
  crossref: { lastStart: null, active: 0, queue: [] },
  inspire: { lastStart: null, active: 0, queue: [] },
};
const interval = (source: ScholarlySource): number => (source === 'arxiv' ? 3000 : 1000);

function schedule(source: ScholarlySource): void {
  const gate = gates[source];
  clearTimeout(gate.timer);
  gate.timer = undefined;
  if (!gate.queue.length || ((source === 'arxiv' || source === 'crossref') && gate.active)) return;
  const delay =
    gate.lastStart === null ? 0 : Math.max(0, gate.lastStart + interval(source) - Date.now());
  if (delay) {
    gate.timer = setTimeout(() => schedule(source), delay);
    return;
  }
  const request = gate.queue.shift()!;
  request.signal.removeEventListener('abort', request.cancel);
  gate.lastStart = Date.now();
  gate.active++;
  request.start();
  schedule(source);
}

/** Module-owned admissions share rate limits across consumers and service instances. */
export function admitScholarlyRequest<T>(
  source: ScholarlySource,
  signal: AbortSignal,
  start: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Reference lookup cancelled'));
  const gate = gates[source];
  const delay =
    gate.lastStart === null ? 0 : Math.max(0, gate.lastStart + interval(source) - Date.now());
  if (delay + gate.queue.length * interval(source) > 30000)
    return Promise.reject(
      new ScholarlyError('rate', source, 'Reference service request queue is full'),
    );
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const request: WaitingRequest = {
    signal,
    start() {
      Promise.resolve()
        .then(() => {
          if (signal.aborted) throw new Error('Reference lookup cancelled');
          return start();
        })
        .then(resolve, reject)
        .finally(() => {
          gate.active--;
          schedule(source);
        });
    },
    cancel() {
      const index = gate.queue.indexOf(request);
      if (index < 0) return;
      gate.queue.splice(index, 1);
      signal.removeEventListener('abort', request.cancel);
      reject(new Error('Reference lookup cancelled'));
      schedule(source);
    },
  };
  gate.queue.push(request);
  signal.addEventListener('abort', request.cancel, { once: true });
  schedule(source);
  return promise;
}
