import { structuredDocumentBlocks } from '../toolkit/reader';
import { outlineEntryKind } from './outline-presentation';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from './types';

export interface ReaderCaptionTarget extends ReaderNativeOutlineEntry {
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly location: { readonly position: ReaderLinkPosition };
}

type CaptionState = 'idle' | 'loading' | 'ready' | 'unavailable';
type RecordValue = Readonly<Record<string, unknown>>;

// Native caption anchors are quantized to hundredths of a PDF point, while image
// anchors retain finer precision. This only tolerates comparisons, never moves targets.
const ANCHOR_PRECISION = 0.01;

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

function blockText(block: RecordValue): string {
  if (!Array.isArray(block.content)) return '';
  let text = '';
  for (const part of block.content) {
    const value = record(part)?.text;
    if (typeof value === 'string') text += value;
  }
  return text.trim();
}

function headingText(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\s\u00ad\u200b]+/gu, '')
    .toLowerCase();
}

/** Only native caption blocks with real PDF anchors become document navigation targets. */
function captionTarget(value: unknown): ReaderCaptionTarget | null {
  const block = record(value);
  if (block?.type !== 'caption' || !Array.isArray(block.content)) return null;
  const title = blockText(block);
  const kind = outlineEntryKind(title, 0);
  if (kind !== 'figure' && kind !== 'table') return null;
  const label = captionLabel(title);
  if (!label) return null;
  const position = blockPosition(block);
  return position ? { title, kind, label, location: { position } } : null;
}

/** Native anchors use PDF coordinates, with larger Y values nearer the page top. */
function blockPosition(block: RecordValue): ReaderLinkPosition | null {
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
  return { pageIndex, rects };
}

function positionBounds(position: ReaderLinkPosition): readonly number[] {
  let left = Infinity;
  let bottom = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  for (const rect of position.rects) {
    left = Math.min(left, rect[0]);
    bottom = Math.min(bottom, rect[1]);
    right = Math.max(right, rect[2]);
    top = Math.max(top, rect[3]);
  }
  return [left, bottom, right, top];
}

/**
 * Require one same-page image above the caption in the same column. Native
 * excluded paragraphs may intervene only when their anchors lie inside the
 * image (for example, chart labels). Ambiguity retains the caption position.
 */
function figurePosition(
  blocks: readonly unknown[],
  index: number,
  caption: ReaderLinkPosition,
): ReaderLinkPosition {
  let imageIndex = index - 1;
  while (imageIndex >= 0) {
    const block = record(blocks[imageIndex]);
    if (block?.type !== 'paragraph' || block.flowClass !== 'excluded') break;
    imageIndex--;
  }
  const image = record(blocks[imageIndex]);
  if (image?.type !== 'image' || record(blocks[imageIndex - 1])?.type === 'image') return caption;
  const position = blockPosition(image);
  if (!position || position.pageIndex !== caption.pageIndex) return caption;
  const captionAnchor = record(record(blocks[index])?.anchor)?.pageRects;
  const imageAnchor = record(image.anchor)?.pageRects;
  if (
    !Array.isArray(captionAnchor) ||
    !Array.isArray(imageAnchor) ||
    !captionAnchor.every((rect) => rect[0] === caption.pageIndex) ||
    !imageAnchor.every((rect) => rect[0] === caption.pageIndex)
  )
    return caption;
  for (let intervening = imageIndex + 1; intervening < index; intervening++) {
    const block = record(blocks[intervening]);
    if (!block) return caption;
    const inside = blockPosition(block);
    const anchor = record(block.anchor)?.pageRects;
    if (
      !inside ||
      inside.pageIndex !== caption.pageIndex ||
      !Array.isArray(anchor) ||
      !anchor.every((rect) => rect[0] === caption.pageIndex) ||
      !inside.rects.every((rect) =>
        position.rects.some(
          (imageRect) =>
            imageRect[0] <= rect[0] + ANCHOR_PRECISION &&
            imageRect[1] <= rect[1] + ANCHOR_PRECISION &&
            rect[2] <= imageRect[2] + ANCHOR_PRECISION &&
            rect[3] <= imageRect[3] + ANCHOR_PRECISION,
        ),
      )
    )
      return caption;
  }
  const [captionLeft, , captionRight, captionTop] = positionBounds(caption);
  const [imageLeft, imageBottom, imageRight] = positionBounds(position);
  if (imageBottom + ANCHOR_PRECISION < captionTop) return caption;
  const sameColumn =
    (imageLeft <= captionLeft + ANCHOR_PRECISION &&
      captionRight <= imageRight + ANCHOR_PRECISION) ||
    (captionLeft <= imageLeft + ANCHOR_PRECISION && imageRight <= captionRight + ANCHOR_PRECISION);
  return sameColumn ? position : caption;
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
  #headings: readonly { readonly title: string; readonly position: ReaderLinkPosition }[] = [];
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

  /**
   * After load(), corrects authored bookmarks that precede a page-broken heading.
   * Only a unique native heading on the authored page or its next page can replace it.
   * This lookup performs no I/O and never adds headings to the authored hierarchy.
   */
  headingPosition(entry: ReaderNativeOutlineEntry): ReaderLinkPosition | null {
    const authored = entry.location?.position;
    if (this.#disposed || !authored) return null;
    const title = headingText(entry.title);
    if (!title) return null;
    let found: ReaderLinkPosition | null = null;
    for (const heading of this.#headings) {
      const pageDelta = heading.position.pageIndex - authored.pageIndex;
      if (pageDelta < 0 || pageDelta > 1) continue;
      if (heading.title !== title) {
        if (!heading.title.endsWith(title)) continue;
        const ordinal = heading.title.slice(0, -title.length);
        if (!/^(?:\d+(?:[.-]\d+)*|[a-z](?:\.\d+)*)[.)]?$/u.test(ordinal)) continue;
      }
      if (found) return null;
      found = heading.position;
    }
    return found;
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
    this.#headings = [];
  }

  private async read(): Promise<readonly ReaderCaptionTarget[]> {
    if (this.#disposed) return [];
    try {
      const blocks = await structuredDocumentBlocks(this.#itemID, () => !this.#disposed);
      if (this.#disposed) return [];
      if (!blocks) return this.finish([], false);
      const entries: ReaderCaptionTarget[] = [];
      const headings: { title: string; position: ReaderLinkPosition }[] = [];
      const seen = new Set<string>();
      for (let index = 0; index < blocks.length; index++) {
        const block = record(blocks[index]);
        if (block?.type === 'heading') {
          const position = blockPosition(block);
          const title = headingText(blockText(block));
          if (position && title) headings.push({ title, position });
          continue;
        }
        const target = captionTarget(blocks[index]);
        if (!target) continue;
        const key = `${target.kind}:${target.label}:${target.location.position.pageIndex}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const position =
          target.kind === 'figure'
            ? figurePosition(blocks, index, target.location.position)
            : target.location.position;
        entries.push(
          position === target.location.position ? target : { ...target, location: { position } },
        );
      }
      this.#headings = headings;
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
