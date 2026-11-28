import { structuredDocumentBlocks } from '../../toolkit/reader';
import { nativeDocumentRegions } from '../../document-analysis/native';
import type { DocumentObjectGroup, DocumentRegion } from '../../document-analysis/contracts';
import {
  documentObjectGroups,
  documentObjectLocation,
} from '../../document-analysis/object-groups';
import type { ReaderLocalLayout } from '../../reader/local-layout';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from '../../reader/types';

export interface ReaderCaptionTarget extends ReaderNativeOutlineEntry {
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly association?: DocumentObjectGroup['association'];
  readonly location: { readonly position: ReaderLinkPosition };
}

type CaptionState = 'idle' | 'loading' | 'ready' | 'unavailable';
const EMPTY: readonly ReaderCaptionTarget[] = [];
function headingText(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\s\u00ad\u200b]+/gu, '')
    .toLowerCase();
}

/** PDF-local caption targets and the independent native heading precision path. */
export class ReaderCaptionTargets {
  readonly #itemID: number | undefined;
  readonly #onChange: () => void;
  readonly #debug: (message: string) => void;
  readonly #isCurrent: () => boolean;
  readonly #layout: Pick<ReaderLocalLayout, 'figures' | 'isCurrent'>;
  #state: CaptionState = 'idle';
  #entries = EMPTY;
  #headings: readonly { readonly title: string; readonly position: ReaderLinkPosition }[] = [];
  #promise: Promise<readonly ReaderCaptionTarget[]> | null = null;
  #headingPromise: Promise<void> | null = null;
  #disposed = false;

  constructor(
    itemID: number | undefined,
    onChange: () => void,
    debug: (message: string) => void,
    isCurrent: () => boolean,
    layout: Pick<ReaderLocalLayout, 'figures' | 'isCurrent'>,
  ) {
    this.#itemID = itemID;
    this.#onChange = onChange;
    this.#debug = debug;
    this.#isCurrent = isCurrent;
    this.#layout = layout;
  }

  get state(): CaptionState {
    return this.sourceCurrent() ? this.#state : 'unavailable';
  }
  get entries(): readonly ReaderCaptionTarget[] {
    return this.sourceCurrent() ? this.#entries : EMPTY;
  }

  /**
   * After loadHeadings(), corrects authored bookmarks that precede a page-broken heading.
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
    if (!this.sourceCurrent()) return Promise.resolve(EMPTY);
    if (this.#promise) return this.#promise;
    this.#state = 'loading';
    this.#promise = Promise.resolve().then(async () => {
      if (!this.sourceCurrent()) return EMPTY;
      try {
        const regions = await this.#layout.figures();
        if (!this.sourceCurrent()) return EMPTY;
        this.#entries = this.targets(regions);
        this.#state = 'ready';
      } catch (error) {
        if (!this.sourceCurrent()) return EMPTY;
        this.#debug(`Reader local captions unavailable: ${String(error)}`);
        this.#state = 'unavailable';
        this.#promise = null;
      }
      this.#onChange();
      return this.#entries;
    });
    this.#onChange();
    return this.#promise;
  }

  dispose(): void {
    this.#disposed = true;
    this.#entries = EMPTY;
    this.#promise = null;
    this.#headings = [];
  }

  async loadHeadings(): Promise<void> {
    if (this.#disposed || !this.#isCurrent()) return;
    await (this.#headingPromise ??= this.readHeadings());
  }

  sourceCurrent(target?: ReaderCaptionTarget): boolean {
    return (
      !this.#disposed &&
      this.#isCurrent() &&
      this.#layout.isCurrent() &&
      (!target || this.#entries.includes(target))
    );
  }

  private targets(regions: readonly DocumentRegion[]): readonly ReaderCaptionTarget[] {
    const pages = new Map<number, DocumentRegion[]>();
    for (const region of regions) {
      const page = pages.get(region.pageIndex);
      if (page) page.push(region);
      else pages.set(region.pageIndex, [region]);
    }
    const targets: ReaderCaptionTarget[] = [];
    for (const page of pages.values()) {
      for (const group of documentObjectGroups(page)) {
        if (!group.label || !group.captionRegionIds.length) continue;
        targets.push({
          title: group.title,
          kind: group.kind,
          label: group.label,
          association: group.association,
          location: { position: documentObjectLocation(page, group) },
        });
      }
    }
    return targets;
  }

  private async readHeadings(): Promise<void> {
    try {
      const blocks = await structuredDocumentBlocks(
        this.#itemID,
        () => !this.#disposed && this.#isCurrent(),
      );
      if (this.#disposed || !this.#isCurrent() || !blocks) return;
      const regions = nativeDocumentRegions(blocks);
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
    } catch (error) {
      if (!this.#disposed && this.#isCurrent())
        this.#debug(`Reader heading precision unavailable: ${String(error)}`);
    }
  }
}
