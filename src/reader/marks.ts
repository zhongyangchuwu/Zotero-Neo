import type { PreferenceStore } from '../core/preference-store';
import { readerMarksPersist } from '../core/preferences';
import type { ItemRuntime, Mark, MarksPayload, PdfWindow, ReaderRuntime } from './types';

interface ItemRepository {
  get(id: number): ItemRuntime | false | null;
}

interface ZoteroItemsRuntime {
  readonly Items: ItemRepository;
}

interface LegacyExtraItem {
  extra?: string;
}

export interface MarksHost {
  readonly preferences: PreferenceStore;
  readonly itemForReader: (reader: ReaderRuntime) => ItemRuntime | null;
  readonly schedule: (delay: number, task: () => void) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly log: (message: string) => void;
  readonly scrollToPageRatio: (
    pdfWindow: PdfWindow,
    pageIndex: number,
    ratio: number,
  ) => Promise<boolean>;
  readonly scrollDocumentToRatio: (pdfWindow: PdfWindow, ratio: number) => boolean;
  readonly pageNavigationSupported: (reader: ReaderRuntime) => boolean;
  readonly annotationPageRatio: (
    pdfWindow: PdfWindow,
    annotation: ItemRuntime,
  ) => Promise<{ pageIndex: number; ratio: number }>;
  readonly onJump: (
    pdfWindow: PdfWindow,
    perform: (isCurrent: () => boolean) => Promise<boolean>,
  ) => Promise<boolean>;
}

function items(): ItemRepository {
  // Zotero's public declaration intentionally omits private storage access.
  const host = Zotero as unknown as ZoteroItemsRuntime;
  return host.Items;
}

function isMark(value: unknown): value is Omit<Mark, 'ts'> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('pageIndex' in value) ||
    !('ratio' in value) ||
    !('key' in value)
  )
    return false;
  return (
    (typeof value.pageIndex === 'number' || value.pageIndex === null) &&
    typeof value.ratio === 'number' &&
    (typeof value.key === 'string' || value.key === null)
  );
}

function isPayload(value: unknown): value is MarksPayload {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('v' in value) ||
    !('marks' in value) ||
    value.v !== 1 ||
    !value.marks ||
    typeof value.marks !== 'object' ||
    Array.isArray(value.marks)
  )
    return false;
  return Object.values(value.marks).every(isMark);
}

function normalizeMark(value: Omit<Mark, 'ts'>): Mark {
  return {
    pageIndex: value.pageIndex,
    ratio: Math.max(0, Math.min(1, value.ratio)),
    key: value.key,
    ts: 0,
  };
}

export class ReaderMarks {
  readonly #host: MarksHost;
  readonly #marks: Record<string, Mark> = {};

  constructor(host: MarksHost) {
    this.#host = host;
  }

  values(): Readonly<Record<string, Mark>> {
    return this.#marks;
  }

  position(pdfWindow: PdfWindow): { pageIndex: number | null; ratio: number } {
    try {
      const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
      const container = viewer?.container ?? pdfWindow.document.getElementById('viewerContainer');
      if (viewer && container) {
        const pageNumber = viewer.currentPageNumber ?? 1;
        const page = pdfWindow.document.querySelector<HTMLElement>(
          `.page[data-page-number="${pageNumber}"]`,
        );
        if (page && page.offsetHeight > 0) {
          const ratio =
            (container.scrollTop - page.offsetTop + container.clientHeight / 2) / page.offsetHeight;
          return { pageIndex: pageNumber - 1, ratio: Math.max(0, Math.min(1, ratio)) };
        }
        return { pageIndex: pageNumber - 1, ratio: 0 };
      }
      const fallbackContainer =
        pdfWindow.document.scrollingElement ?? pdfWindow.document.documentElement;
      const range = Math.max(0, fallbackContainer.scrollHeight - fallbackContainer.clientHeight);
      return { pageIndex: null, ratio: range ? fallbackContainer.scrollTop / range : 0 };
    } catch {
      return { pageIndex: null, ratio: 0 };
    }
  }

  async set(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    char: string,
    annotationKey: string | null,
  ): Promise<void> {
    const position = this.position(pdfWindow);
    this.#marks[char] = { ...position, key: annotationKey, ts: Date.now() };
    let persisted = '';
    if (readerMarksPersist(this.#host.preferences)) persisted = await this.save(reader);
    const page = position.pageIndex === null ? '' : `  p.${position.pageIndex + 1}`;
    this.#host.showStatus(
      `✓ mark ${char} set${page}${persisted ? ` · saved (${persisted})` : ''}`,
      1200,
    );
  }

  async jump(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    char: string,
    selectAnnotation: (key: string | null) => void,
  ): Promise<boolean> {
    const mark = this.#marks[char];
    if (!mark) {
      this.#host.showStatus(`✗ mark ${char} not set`, 2000);
      return false;
    }
    let annotationExists = true;
    const moved = await this.#host.onJump(pdfWindow, async (isCurrent) => {
      let { pageIndex, ratio } = mark;
      try {
        if (mark.key) {
          const target =
            this.#host
              .itemForReader(reader)
              ?.getAnnotations?.()
              .find((annotation) => annotation.key === mark.key) ?? null;
          if (!isCurrent()) return false;
          if (target) {
            selectAnnotation(mark.key);
            if (pageIndex === null) {
              const resolved = await this.#host.annotationPageRatio(pdfWindow, target);
              if (!isCurrent()) return false;
              ({ pageIndex, ratio } = resolved);
            }
          } else {
            annotationExists = false;
            selectAnnotation(null);
          }
        }
        if (!isCurrent()) return false;
        if (pageIndex !== null && this.#host.pageNavigationSupported(reader)) {
          const viewer = pdfWindow.PDFViewerApplication?.pdfViewer;
          if (viewer) viewer.currentPageNumber = pageIndex + 1;
          return this.#host.scrollToPageRatio(pdfWindow, pageIndex, ratio);
        }
        return this.#host.scrollDocumentToRatio(pdfWindow, ratio);
      } catch (error) {
        this.#host.log(`mark jump failed: ${String(error)}`);
        return false;
      }
    });
    if (!moved) return false;
    this.#host.showStatus(`→ mark ${char}${annotationExists ? '' : ' · annotation gone'}`, 1200);
    return true;
  }

  async delete(reader: ReaderRuntime, char: string): Promise<void> {
    if (!this.#marks[char]) {
      this.#host.showStatus(`✗ mark ${char} not set`, 2000);
      return;
    }
    delete this.#marks[char];
    if (readerMarksPersist(this.#host.preferences)) await this.save(reader);
    this.#host.showStatus(`✓ mark ${char} deleted`, 1200);
  }

  async clear(reader: ReaderRuntime): Promise<void> {
    for (const char of Object.keys(this.#marks)) delete this.#marks[char];
    if (readerMarksPersist(this.#host.preferences)) await this.save(reader);
    this.#host.showStatus('✓ all marks deleted', 1200);
  }

  async save(reader: ReaderRuntime): Promise<'extra' | 'local' | ''> {
    const attachment = this.#host.itemForReader(reader);
    if (!attachment) return '';
    const payload: MarksPayload = {
      v: 1,
      marks: Object.fromEntries(
        Object.entries(this.#marks).map(([char, mark]) => [
          char,
          {
            pageIndex: mark.pageIndex,
            ratio: mark.ratio,
            key: mark.key,
          },
        ]),
      ),
    };
    const hasMarks = Object.keys(payload.marks).length > 0;
    const attachmentKey = attachment.key;
    try {
      const store = this.storeItem(attachment);
      if (!store) throw new Error('no storage item');
      if (hasMarks) await this.writeExtra(store, attachmentKey, payload);
      else await this.clearExtra(store, attachmentKey);
      this.clearPreference(reader);
      return 'extra';
    } catch (error) {
      this.#host.log(`mark extra persistence failed: ${String(error)}`);
    }
    try {
      if (hasMarks)
        this.#host.preferences.set(`marks.data.${reader.itemID ?? ''}`, JSON.stringify(payload));
      else this.clearPreference(reader);
      return 'local';
    } catch (error) {
      this.#host.log(`mark preference persistence failed: ${String(error)}`);
      this.#host.showStatus('✗ persist failed', 4000);
      return '';
    }
  }

  load(reader: ReaderRuntime, retry = 0): void {
    if (!readerMarksPersist(this.#host.preferences)) return;
    const attachment = this.#host.itemForReader(reader);
    if (!attachment) {
      if (retry < 20) this.#host.schedule(500, () => this.load(reader, retry + 1));
      return;
    }
    const fromExtra = this.readExtra(this.storeItem(attachment), attachment.key);
    const fromPreference = fromExtra ?? this.readPreference(reader);
    if (fromPreference) {
      for (const [char, mark] of Object.entries(fromPreference.marks))
        this.#marks[char] = normalizeMark(mark);
    }
    let migrated = false;
    for (const annotation of attachment.getAnnotations?.() ?? []) {
      for (const tag of annotation.tags ?? []) {
        const match = /^zv-mark:([a-z0-9])$/.exec(tag.tag);
        if (match?.[1] && !this.#marks[match[1]]) {
          this.#marks[match[1]] = { pageIndex: null, ratio: 0, key: annotation.key, ts: 0 };
          migrated = true;
        }
      }
    }
    if (migrated) void this.save(reader);
  }

  private storeItem(attachment: ItemRuntime): ItemRuntime | null {
    try {
      return attachment.parentItemID ? items().get(attachment.parentItemID) || null : attachment;
    } catch {
      return null;
    }
  }

  private extra(item: ItemRuntime | null): string {
    if (!item) return '';
    try {
      // Older Zotero versions expose Extra as a private property rather than getField().
      const legacyItem = item as unknown as LegacyExtraItem;
      return item.getField?.('extra') ?? legacyItem.extra ?? '';
    } catch {
      return '';
    }
  }

  private setExtra(item: ItemRuntime, value: string): void {
    if (item.setField) {
      item.setField('extra', value);
      return;
    }
    // Older Zotero versions expose Extra as a private property rather than setField().
    const legacyItem = item as unknown as LegacyExtraItem;
    legacyItem.extra = value;
  }

  private prefix(attachmentKey: string): string {
    return `zv-marks-${attachmentKey}: `;
  }

  private readExtra(item: ItemRuntime | null, attachmentKey: string): MarksPayload | null {
    const line = this.extra(item)
      .split('\n')
      .find((candidate) => candidate.startsWith(this.prefix(attachmentKey)));
    if (!line) return null;
    try {
      const parsed: unknown = JSON.parse(line.slice(this.prefix(attachmentKey).length));
      return isPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeExtra(
    item: ItemRuntime,
    attachmentKey: string,
    payload: MarksPayload,
  ): Promise<void> {
    const prefix = this.prefix(attachmentKey);
    const lines = this.extra(item)
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith(prefix));
    lines.push(`${prefix}${JSON.stringify(payload)}`);
    this.setExtra(item, lines.join('\n'));
    await item.saveTx();
  }

  private async clearExtra(item: ItemRuntime, attachmentKey: string): Promise<void> {
    const prefix = this.prefix(attachmentKey);
    const current = this.extra(item);
    const next = current
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith(prefix))
      .join('\n');
    if (next !== current) {
      this.setExtra(item, next);
      await item.saveTx();
    }
  }

  private readPreference(reader: ReaderRuntime): MarksPayload | null {
    try {
      const raw = this.#host.preferences.get(`marks.data.${reader.itemID ?? ''}`, '');
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return isPayload(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private clearPreference(reader: ReaderRuntime): void {
    this.#host.preferences.set(`marks.data.${reader.itemID ?? ''}`, '');
  }
}
