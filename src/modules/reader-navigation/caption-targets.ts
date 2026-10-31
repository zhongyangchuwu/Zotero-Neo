import { structuredDocumentBlocks } from '../../toolkit/reader';
import { nativeDocumentRegions } from '../../document-analysis/native';
import type { DocumentObjectGroup } from '../../document-analysis/contracts';
import {
  documentObjectGroups,
  documentObjectLocation,
} from '../../document-analysis/object-groups';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from '../../reader/types';

export interface ReaderCaptionTarget extends ReaderNativeOutlineEntry {
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly association?: DocumentObjectGroup['association'];
  readonly location: { readonly position: ReaderLinkPosition };
}

type CaptionState = 'idle' | 'loading' | 'ready' | 'unavailable';
function headingText(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\s\u00ad\u200b]+/gu, '')
    .toLowerCase();
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
  readonly #isCurrent: () => boolean;
  #state: CaptionState = 'idle';
  #entries: readonly ReaderCaptionTarget[] = [];
  #headings: readonly { readonly title: string; readonly position: ReaderLinkPosition }[] = [];
  #promise: Promise<readonly ReaderCaptionTarget[]> | null = null;
  #disposed = false;

  constructor(
    itemID: number | undefined,
    onChange: () => void,
    debug: (message: string) => void,
    isCurrent: () => boolean,
  ) {
    this.#itemID = itemID;
    this.#onChange = onChange;
    this.#debug = debug;
    this.#isCurrent = isCurrent;
  }

  get state(): CaptionState {
    return this.#state;
  }
  get entries(): readonly ReaderCaptionTarget[] {
    return !this.#disposed && this.#isCurrent() ? this.#entries : [];
  }

  /**
   * After load(), corrects authored bookmarks that precede a page-broken heading.
   * Only a unique native heading on the authored page or its next page can replace it.
   * This lookup performs no I/O and never adds headings to the authored hierarchy.
   */
  headingPosition(entry: ReaderNativeOutlineEntry): ReaderLinkPosition | null {
    const authored = entry.location?.position;
    if (this.#disposed || !this.#isCurrent() || !authored) return null;
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
    if (this.#disposed || !this.#isCurrent()) return Promise.resolve([]);
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
    if (this.#disposed || !this.#isCurrent()) return [];
    try {
      const blocks = await structuredDocumentBlocks(
        this.#itemID,
        () => !this.#disposed && this.#isCurrent(),
      );
      if (this.#disposed || !this.#isCurrent()) return [];
      if (!blocks) return this.finish([], false);
      const regions = nativeDocumentRegions(blocks);
      const entries: ReaderCaptionTarget[] = documentObjectGroups(regions).map((group) => ({
        title: group.title,
        kind: group.kind,
        label: group.label,
        association: group.association,
        location: { position: documentObjectLocation(regions, group) },
      }));
      const headings: { title: string; position: ReaderLinkPosition }[] = [];
      const seen = new Set<string>();
      for (const region of regions) {
        if (region.kind !== 'heading') continue;
        const key = region.sourceBlock?.id ?? region.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const parts = regions.filter((part) => (part.sourceBlock?.id ?? part.id) === key);
        const pageIndex = Math.min(...parts.map((part) => part.pageIndex));
        headings.push({
          title: headingText(region.text),
          position: {
            pageIndex,
            rects: parts.filter((part) => part.pageIndex === pageIndex).map((part) => part.rect),
          },
        });
      }
      this.#headings = headings;
      return this.finish(entries, true);
    } catch (error) {
      if (!this.#disposed && this.#isCurrent())
        this.#debug(`reader caption loading failed: ${String(error)}`);
      return this.finish([], false);
    }
  }

  private finish(
    entries: readonly ReaderCaptionTarget[],
    available: boolean,
  ): readonly ReaderCaptionTarget[] {
    if (this.#disposed || !this.#isCurrent()) return [];
    this.#entries = entries;
    this.#state = available ? 'ready' : 'unavailable';
    this.#onChange();
    return entries;
  }
}
