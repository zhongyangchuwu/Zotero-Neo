import { PREFERENCE_PREFIX } from '../core/preferences';
import type { AnnotationCommentTarget } from '../modules/reader-annotations/comment-editor';
import type { AnnotationRuntime } from '../reader/types';

interface Draft {
  id: string;
  base: string;
  text: string;
}

const claimed = new Set<string>();
const activeDrafts = new Map<string, AnnotationCommentDraft>();
const queues = new Map<string, Promise<void>>();
const volatile = new Map<string, Draft[]>();
let sequence = 0;

function storageKey(target: AnnotationCommentTarget): string {
  if (target.libraryID === null || !target.key) throw new Error('Annotation identity unavailable');
  return `annotationComment.drafts.${target.libraryID}.${target.key}`;
}

function read(key: string): Draft[] {
  const fullKey = `${PREFERENCE_PREFIX}.${key}`;
  const raw =
    Services.prefs.getPrefType(fullKey) === 0 ? '' : Services.prefs.getStringPref(fullKey);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(
      (d) =>
        d && typeof d.id === 'string' && typeof d.base === 'string' && typeof d.text === 'string',
    )
  )
    throw new Error('Invalid annotation draft storage');
  return value as Draft[];
}

function write(key: string, drafts: Draft[]): void {
  const fullKey = `${PREFERENCE_PREFIX}.${key}`;
  if (drafts.length) Services.prefs.setStringPref(fullKey, JSON.stringify(drafts));
  else if (Services.prefs.getPrefType(fullKey) !== 0) Services.prefs.clearUserPref(fullKey);
}

export type DraftSaveResult = 'saved' | 'failed' | 'conflict';

/** Drafts are independent per editor, while native saves for an annotation are serialized. */
export class AnnotationCommentDraft {
  readonly #key: string;
  readonly #id: string;
  #base: string;
  #text: string;
  #stored = true;

  constructor(target: AnnotationCommentTarget, nativeText: string, recover = true) {
    this.#key = storageKey(target);
    const memory = recover
      ? volatile.get(this.#key)?.find((item) => !claimed.has(`${this.#key}:${item.id}`))
      : undefined;
    const draft = recover
      ? (memory ?? read(this.#key).find((item) => !claimed.has(`${this.#key}:${item.id}`)))
      : undefined;
    this.#stored = !memory;
    this.#id =
      draft?.id ??
      `${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.#base = draft?.base ?? nativeText;
    this.#text = draft?.text ?? nativeText;
    claimed.add(`${this.#key}:${this.#id}`);
    activeDrafts.set(`${this.#key}:${this.#id}`, this);
  }

  get text(): string {
    return this.#text;
  }
  get base(): string {
    return this.#base;
  }
  get stored(): boolean {
    return this.#stored;
  }

  update(text: string): void {
    this.#text = text;
    this.#stored = false;
    const memory = (volatile.get(this.#key) ?? []).filter((draft) => draft.id !== this.#id);
    memory.push({ id: this.#id, base: this.#base, text });
    volatile.set(this.#key, memory);
    const drafts = read(this.#key).filter((draft) => draft.id !== this.#id);
    drafts.push({ id: this.#id, base: this.#base, text });
    write(this.#key, drafts);
    volatile.set(
      this.#key,
      memory.filter((draft) => draft.id !== this.#id),
    );
    this.#stored = true;
  }

  discard(): void {
    write(
      this.#key,
      read(this.#key).filter((draft) => draft.id !== this.#id),
    );
    volatile.set(
      this.#key,
      (volatile.get(this.#key) ?? []).filter((draft) => draft.id !== this.#id),
    );
    this.#stored = true;
  }

  release(): void {
    claimed.delete(`${this.#key}:${this.#id}`);
    const identity = `${this.#key}:${this.#id}`;
    if (activeDrafts.get(identity) === this) activeDrafts.delete(identity);
  }

  save(
    resolve: () => Promise<AnnotationRuntime | null>,
    overwrite = false,
  ): Promise<DraftSaveResult> {
    const text = this.#text;
    const previous = queues.get(this.#key) ?? Promise.resolve();
    const result = previous.then(async (): Promise<DraftSaveResult> => {
      try {
        const annotation = await resolve();
        if (!annotation || annotation.deleted) return 'failed';
        const current = annotation.annotationComment ?? '';
        if (!overwrite && current !== this.#base && current !== text) return 'conflict';
        if (current !== text) {
          annotation.annotationComment = text;
          try {
            await annotation.saveTx();
          } catch (error) {
            if (annotation.annotationComment === text) annotation.annotationComment = current;
            throw error;
          }
        }
        const oldBase = this.#base;
        this.#base = text;
        const active = activeDrafts.get(`${this.#key}:${this.#id}`);
        if (active && active.#base === oldBase) active.#base = text;
        const memory = volatile.get(this.#key)?.find((item) => item.id === this.#id);
        if (memory && memory.base === oldBase) memory.base = text;
        const drafts = read(this.#key);
        const draft = drafts.find((item) => item.id === this.#id);
        if (draft && draft.text === text)
          write(
            this.#key,
            drafts.filter((item) => item.id !== this.#id),
          );
        else if (draft && draft.base === oldBase) {
          draft.base = text;
          write(this.#key, drafts);
        }
        return 'saved';
      } catch {
        return 'failed';
      }
    });
    const tail = result.then(() => {});
    queues.set(this.#key, tail);
    void tail.then(() => {
      if (queues.get(this.#key) === tail) queues.delete(this.#key);
    });
    return result;
  }
}
