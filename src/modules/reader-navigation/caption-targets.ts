import { structuredDocumentBlocks } from '../../toolkit/reader';
import { nativeDocumentRegions } from '../../document-analysis/native';
import type { DocumentObjectGroup, DocumentRegion } from '../../document-analysis/contracts';
import type { ReaderCachedDocument } from './document-cache';
import {
  documentObjectGroups,
  documentObjectLocation,
} from '../../document-analysis/object-groups';
import type { ReaderLinkPosition, ReaderNativeOutlineEntry } from '../../reader/types';

export interface ReaderCaptionTarget extends ReaderNativeOutlineEntry {
  readonly id?: string;
  readonly source?: 'cache' | 'native';
  readonly kind: 'figure' | 'table';
  readonly label: string;
  readonly association?: DocumentObjectGroup['association'];
  readonly location: { readonly position: ReaderLinkPosition };
}

export interface ReaderCaptionCache {
  read(): Promise<ReaderCachedDocument | null>;
  unnamedTitle(kind: 'figure' | 'table', pageIndex: number): string;
}

type CaptionState = 'idle' | 'loading' | 'ready' | 'unavailable';
function headingText(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\s\u00ad\u200b]+/gu, '')
    .toLowerCase();
}

/**
 * Session-owned graph targets prefer validated external cache; native extraction remains explicit fallback.
 * Headings retain their separate native source. Retirement fences both sources without claiming SDK cancellation.
 */
export class ReaderCaptionTargets {
  readonly #itemID: number | undefined;
  readonly #onChange: () => void;
  readonly #debug: (message: string) => void;
  readonly #isCurrent: () => boolean;
  readonly #cache: ReaderCaptionCache | undefined;
  #state: CaptionState = 'idle';
  #entries: readonly ReaderCaptionTarget[] = [];
  #headings: readonly { readonly title: string; readonly position: ReaderLinkPosition }[] = [];
  #promise: Promise<readonly ReaderCaptionTarget[]> | null = null;
  #nativePromise: Promise<readonly ReaderCaptionTarget[] | null> | null = null;
  #cacheCurrent: (() => Promise<boolean>) | null = null;
  #settled = false;
  #revision = 0;
  #disposed = false;

  constructor(
    itemID: number | undefined,
    onChange: () => void,
    debug: (message: string) => void,
    isCurrent: () => boolean,
    cache?: ReaderCaptionCache,
  ) {
    this.#itemID = itemID;
    this.#onChange = onChange;
    this.#debug = debug;
    this.#isCurrent = isCurrent;
    this.#cache = cache;
  }

  get state(): CaptionState {
    return this.#state;
  }
  get entries(): readonly ReaderCaptionTarget[] {
    return !this.#disposed && this.#isCurrent() ? this.#entries : [];
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
    if (this.#disposed || !this.#isCurrent()) return Promise.resolve([]);
    if (this.#promise && this.#settled && this.#cacheCurrent) {
      const previous = this.#promise;
      return this.sourceCurrent().then((valid) => (valid ? previous : this.load()));
    }
    if (this.#promise) return this.#promise;
    const revision = this.#revision;
    this.#state = 'loading';
    this.#promise = Promise.resolve()
      .then(() => this.read(revision))
      .finally(() => {
        if (revision === this.#revision) this.#settled = true;
      });
    this.#onChange();
    return this.#promise;
  }

  dispose(): void {
    this.#disposed = true;
    this.#revision++;
    this.#entries = [];
    this.#headings = [];
    this.#cacheCurrent = null;
  }

  /** A saved analysis or a selected-service change retires published graph targets, not native heading data. */
  invalidate(): void {
    if (this.#disposed || !this.#isCurrent()) return;
    this.#revision++;
    this.#promise = null;
    this.#settled = false;
    this.#cacheCurrent = null;
    this.#entries = [];
    this.#state = 'idle';
    this.#onChange();
  }

  async loadHeadings(): Promise<void> {
    if (!this.#disposed && this.#isCurrent()) await this.native();
  }

  /** Revalidate at use time, including sidebar choices made after a PDF or service change. */
  async sourceCurrent(target?: ReaderCaptionTarget): Promise<boolean> {
    if (this.#disposed || !this.#isCurrent()) return false;
    if (target?.source === 'cache' && !this.#entries.includes(target)) return false;
    const guard = this.#cacheCurrent;
    if (!guard) return target?.source !== 'cache';
    let valid = false;
    try {
      valid = await guard();
    } catch {
      this.#debug('Reader cached navigation source unavailable');
    }
    if (this.#disposed || !this.#isCurrent() || guard !== this.#cacheCurrent) return false;
    if (!valid) {
      this.#nativePromise = null;
      this.#headings = [];
      this.invalidate();
    }
    return valid && (!target || target.source !== 'cache' || this.#entries.includes(target));
  }

  private targets(
    regions: readonly DocumentRegion[],
    source: 'cache' | 'native',
  ): readonly ReaderCaptionTarget[] {
    return documentObjectGroups(regions).map((group) => {
      const position = documentObjectLocation(regions, group);
      return {
        id: group.id,
        source,
        title:
          group.title ||
          this.#cache?.unnamedTitle(group.kind, position.pageIndex) ||
          `${group.kind} · ${position.pageIndex + 1}`,
        kind: group.kind,
        label: group.label,
        association: group.association,
        location: { position },
      };
    });
  }

  private async read(revision: number): Promise<readonly ReaderCaptionTarget[]> {
    const current = (): boolean =>
      !this.#disposed && this.#isCurrent() && revision === this.#revision;
    if (!current()) return [];
    try {
      const cached = await this.#cache?.read();
      if (!current()) return [];
      if (cached) {
        const targets = this.targets(cached.parsed.regions, 'cache');
        if (targets.length) {
          this.#cacheCurrent = cached.isCurrent;
          return this.finish(targets, true);
        }
      }
    } catch {
      if (current()) this.#debug('Reader document cache unavailable; using native targets');
    }
    if (!current()) return [];
    const native = await this.native();
    if (!current()) return [];
    return this.finish(native ?? [], native !== null);
  }

  private native(): Promise<readonly ReaderCaptionTarget[] | null> {
    return (this.#nativePromise ??= this.readNative());
  }

  private async readNative(): Promise<readonly ReaderCaptionTarget[] | null> {
    if (this.#disposed || !this.#isCurrent()) return null;
    try {
      const blocks = await structuredDocumentBlocks(
        this.#itemID,
        () => !this.#disposed && this.#isCurrent(),
      );
      if (this.#disposed || !this.#isCurrent()) return null;
      if (!blocks) return null;
      const regions = nativeDocumentRegions(blocks);
      const entries = this.targets(regions, 'native');
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
      return entries;
    } catch (error) {
      if (!this.#disposed && this.#isCurrent())
        this.#debug(`reader caption loading failed: ${String(error)}`);
      return null;
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
