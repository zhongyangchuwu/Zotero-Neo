import { outlineEntryKind } from './outline-presentation';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from './types';

export interface ReaderCaptionTarget extends ReaderNativeOutlineEntry {
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly location: { readonly position: ReaderLinkPosition };
}

type CaptionState = 'idle' | 'loading' | 'ready' | 'unavailable';
type RecordValue = Readonly<Record<string, unknown>>;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : null;
}

/** Shared identity for explicit native and structured-document caption targets. */
export function captionLabel(title: string): string | null {
  return (
    /^(?:figure|fig\.?|table|图|表)\s*(\d+(?:[.-]\d+)*|[零〇一二三四五六七八九十百千万两]+(?:[.．-][零〇一二三四五六七八九十百千万两]+)*)/iu.exec(
      title.trim(),
    )?.[1] ?? null
  );
}

/** Only native caption blocks with real PDF anchors become document navigation targets. */
function captionTarget(value: unknown): ReaderCaptionTarget | null {
  const block = record(value);
  if (block?.type !== 'caption' || !Array.isArray(block.content)) return null;
  let text = '';
  for (const part of block.content) {
    const value = record(part)?.text;
    if (typeof value === 'string') text += value;
  }
  const title = text.trim();
  const kind = outlineEntryKind(title, 0);
  if (kind !== 'figure' && kind !== 'table') return null;
  const label = captionLabel(title);
  if (!label) return null;
  const pageRects = record(block.anchor)?.pageRects;
  if (!Array.isArray(pageRects)) return null;
  let pageIndex = Infinity;
  for (const rect of pageRects) {
    if (
      !Array.isArray(rect) ||
      rect.length !== 5 ||
      !rect.every(Number.isFinite) ||
      !Number.isInteger(rect[0]) ||
      rect[0] < 0 ||
      rect[1] >= rect[3] ||
      rect[2] >= rect[4]
    )
      return null;
    pageIndex = Math.min(pageIndex, rect[0]);
  }
  if (!Number.isFinite(pageIndex)) return null;
  const rects: number[][] = [];
  for (const rect of pageRects) {
    if (rect[0] === pageIndex) rects.push([rect[1], rect[2], rect[3], rect[4]]);
  }
  return { title, kind, label, location: { position: { pageIndex, rects } } };
}

/**
 * Session-owned, single-flight access to Zotero's native structured-document cache.
 * Loading is explicit: a cold SDK call can process the whole PDF locally and cannot be cancelled.
 * Disposal retires results without pretending to cancel native worker work.
 */
export class ReaderCaptionTargets {
  readonly #itemID: number | undefined;
  readonly #onChange: () => void;
  readonly #debug: (message: string) => void;
  #state: CaptionState = 'idle';
  #entries: readonly ReaderCaptionTarget[] = [];
  #promise: Promise<readonly ReaderCaptionTarget[]> | null = null;
  #disposed = false;

  constructor(itemID: number | undefined, onChange: () => void, debug: (message: string) => void) {
    this.#itemID = itemID;
    this.#onChange = onChange;
    this.#debug = debug;
  }

  get state(): CaptionState {
    return this.#state;
  }
  get entries(): readonly ReaderCaptionTarget[] {
    return this.#entries;
  }

  load(): Promise<readonly ReaderCaptionTarget[]> {
    if (this.#disposed) return Promise.resolve([]);
    if (this.#promise) return this.#promise;
    this.#state = 'loading';
    this.#promise = Promise.resolve().then(() => this.read());
    this.#onChange();
    return this.#promise;
  }

  dispose(): void {
    this.#disposed = true;
    this.#entries = [];
  }

  private async read(): Promise<readonly ReaderCaptionTarget[]> {
    if (this.#disposed) return [];
    try {
      const sdk = typeof Zotero === 'undefined' ? null : record(Reflect.get(Zotero, 'SDT'));
      const getReader = sdk?.getReader;
      if (typeof getReader !== 'function' || !this.#itemID) return this.finish([], false);
      const reader = record(await getReader.call(sdk, this.#itemID));
      if (this.#disposed) return [];
      if (
        !reader ||
        typeof reader.getTopLevelBlockCount !== 'function' ||
        typeof reader.getBlocks !== 'function'
      )
        return this.finish([], false);
      const count: unknown = await reader.getTopLevelBlockCount();
      if (this.#disposed) return [];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
        return this.finish([], false);
      const blocks: unknown = count ? await reader.getBlocks(0, count - 1) : [];
      if (this.#disposed) return [];
      if (!Array.isArray(blocks)) return this.finish([], false);
      const entries: ReaderCaptionTarget[] = [];
      const seen = new Set<string>();
      for (const block of blocks) {
        const target = captionTarget(block);
        if (!target) continue;
        const key = `${target.kind}:${target.label}:${target.location.position.pageIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(target);
      }
      return this.finish(entries, true);
    } catch (error) {
      if (!this.#disposed) this.#debug(`reader caption loading failed: ${String(error)}`);
      return this.finish([], false);
    }
  }

  private finish(
    entries: readonly ReaderCaptionTarget[],
    available: boolean,
  ): readonly ReaderCaptionTarget[] {
    if (this.#disposed) return [];
    this.#entries = entries;
    this.#state = available ? 'ready' : 'unavailable';
    this.#onChange();
    return entries;
  }
}
