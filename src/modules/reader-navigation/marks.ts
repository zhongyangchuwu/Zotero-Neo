import {
  readerMarkPosition,
  readerMarkTolerance,
  readerPageCount,
  setReaderMarkPage,
  readerMarkExtra,
  setReaderMarkExtra,
} from '../../toolkit/reader';
import type { PreferenceStore } from '../../core/preference-store';
import { readerMarksPersist } from '../../core/preferences';
import { zoteroItem } from '../../platform/zotero-items';
import type { ItemRuntime, Mark, MarksPayload, PdfWindow, ReaderRuntime } from '../../reader/types';

export interface MarksHost {
  readonly isCurrent: () => boolean;
  readonly capturePresentation: () => () => boolean;
  readonly preferences: PreferenceStore;
  readonly itemForReader: (reader: ReaderRuntime) => ItemRuntime | null;
  readonly schedule: (delay: number, task: () => void) => void;
  readonly showStatus: (message: string, duration?: number) => void;
  readonly log: (message: string) => void;
  readonly onChange?: () => void;
  readonly scrollToPageRatio: (
    pdfWindow: PdfWindow,
    pageIndex: number,
    ratio: number,
    isCurrent: () => boolean,
  ) => Promise<boolean>;
  readonly scrollDocumentToRatio: (
    pdfWindow: PdfWindow,
    ratio: number,
    isCurrent: () => boolean,
  ) => boolean;
  readonly pageNavigationSupported: (reader: ReaderRuntime, pdfWindow: PdfWindow) => boolean;
  readonly annotationPageRatio: (
    pdfWindow: PdfWindow,
    annotation: ItemRuntime,
  ) => Promise<{ pageIndex: number; ratio: number }>;
  readonly onJump: (
    pdfWindow: PdfWindow,
    perform: (isCurrent: () => boolean) => Promise<boolean>,
  ) => Promise<boolean>;
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
const EMPTY_MARKS: Readonly<Record<string, Mark>> = Object.freeze({});

export class ReaderMarks {
  readonly #host: MarksHost;
  readonly #marks: Record<string, Mark> = {};
  #disposed = false;

  constructor(host: MarksHost) {
    this.#host = host;
  }

  private isCurrent(): boolean {
    return !this.#disposed && this.#host.isCurrent();
  }

  dispose(): void {
    this.#disposed = true;
    for (const char of Object.keys(this.#marks)) delete this.#marks[char];
  }

  values(): Readonly<Record<string, Mark>> {
    return this.isCurrent() ? this.#marks : EMPTY_MARKS;
  }

  position(pdfWindow: PdfWindow): { pageIndex: number | null; ratio: number } {
    return readerMarkPosition(pdfWindow);
  }

  async set(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    char: string,
    annotationKey: string | null,
  ): Promise<void> {
    if (!this.isCurrent()) return;
    const position = this.position(pdfWindow);
    this.#marks[char] = { ...position, key: annotationKey, ts: Date.now() };
    this.#host.onChange?.();
    const presentationCurrent = this.#host.capturePresentation();
    let persisted = '';
    if (readerMarksPersist(this.#host.preferences))
      persisted = await this.save(reader, presentationCurrent);
    if (!this.isCurrent() || !presentationCurrent()) return;
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
    if (!this.isCurrent()) return false;
    const mark = this.#marks[char];
    if (!mark) {
      this.#host.showStatus(`✗ mark ${char} not set`, 2000);
      return false;
    }
    let annotationExists = true;
    const moved = await this.#host.onJump(pdfWindow, (isCurrent) =>
      this.jumpMark(
        reader,
        pdfWindow,
        mark,
        selectAnnotation,
        () => this.isCurrent() && isCurrent(),
        () => {
          annotationExists = false;
        },
      ),
    );
    if (!moved || !this.isCurrent()) return false;
    this.#host.showStatus(`→ mark ${char}${annotationExists ? '' : ' · annotation gone'}`, 1200);
    return true;
  }

  /** Traverses persisted and legacy marks in document order through the same managed jump. */
  async traverse(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    direction: -1 | 1,
    selectAnnotation: (key: string | null) => void,
  ): Promise<boolean> {
    if (!this.isCurrent()) return false;
    const entries = Object.entries(this.#marks);
    if (!entries.length) {
      this.#host.showStatus('✗ no bookmarks', 2000);
      return false;
    }
    let char = '';
    let annotationExists = true;
    const moved = await this.#host.onJump(pdfWindow, async (invocationCurrent) => {
      const isCurrent = () => this.isCurrent() && invocationCurrent();
      if (!isCurrent()) return false;
      const pages = readerPageCount(pdfWindow);
      const annotations = this.#host.itemForReader(reader)?.getAnnotations?.() ?? [];
      const ordered: { char: string; mark: Mark; position: number }[] = [];
      for (const [name, mark] of entries) {
        let pageIndex = mark.pageIndex;
        let ratio = mark.ratio;
        if (pageIndex === null && mark.key) {
          const annotation = annotations.find((entry) => entry.key === mark.key);
          if (annotation) {
            const resolved = await this.#host.annotationPageRatio(pdfWindow, annotation);
            if (!isCurrent()) return false;
            ({ pageIndex, ratio } = resolved);
          }
        }
        if (!isCurrent()) return false;
        ordered.push({
          char: name,
          mark:
            pageIndex === mark.pageIndex && ratio === mark.ratio
              ? mark
              : { ...mark, pageIndex, ratio },
          position: pageIndex === null ? ratio * pages : pageIndex + ratio,
        });
      }
      ordered.sort((a, b) => a.position - b.position || a.char.localeCompare(b.char));
      const current = this.position(pdfWindow);
      const position =
        current.pageIndex === null ? current.ratio * pages : current.pageIndex + current.ratio;
      const tolerance = readerMarkTolerance(pdfWindow, current.pageIndex, pages);
      let target = direction > 0 ? ordered[0] : ordered[ordered.length - 1];
      if (direction > 0)
        target = ordered.find((entry) => entry.position > position + tolerance) ?? target;
      else {
        for (let index = ordered.length - 1; index >= 0; index -= 1) {
          if (ordered[index].position < position - tolerance) {
            target = ordered[index];
            break;
          }
        }
      }
      if (!target || !isCurrent()) return false;
      char = target.char;
      return this.jumpMark(reader, pdfWindow, target.mark, selectAnnotation, isCurrent, () => {
        annotationExists = false;
      });
    });
    if (!this.isCurrent()) return false;
    if (moved)
      this.#host.showStatus(`→ mark ${char}${annotationExists ? '' : ' · annotation gone'}`, 1200);
    return moved;
  }

  private async jumpMark(
    reader: ReaderRuntime,
    pdfWindow: PdfWindow,
    mark: Mark,
    selectAnnotation: (key: string | null) => void,
    isCurrent: () => boolean,
    onMissingAnnotation?: () => void,
  ): Promise<boolean> {
    let { pageIndex, ratio } = mark;
    try {
      if (!isCurrent()) return false;
      if (mark.key) {
        const target = this.#host
          .itemForReader(reader)
          ?.getAnnotations?.()
          .find((annotation) => annotation.key === mark.key);
        if (!isCurrent()) return false;
        if (target) {
          selectAnnotation(mark.key);
          if (pageIndex === null) {
            const resolved = await this.#host.annotationPageRatio(pdfWindow, target);
            if (!isCurrent()) return false;
            ({ pageIndex, ratio } = resolved);
          }
        } else {
          onMissingAnnotation?.();
          selectAnnotation(null);
        }
      }
      if (!isCurrent()) return false;
      if (pageIndex !== null && this.#host.pageNavigationSupported(reader, pdfWindow)) {
        setReaderMarkPage(pdfWindow, pageIndex);
        const moved = await this.#host.scrollToPageRatio(pdfWindow, pageIndex, ratio, isCurrent);
        return isCurrent() && moved;
      }
      return this.#host.scrollDocumentToRatio(pdfWindow, ratio, isCurrent);
    } catch (error) {
      if (this.isCurrent()) this.#host.log(`mark jump failed: ${String(error)}`);
      return false;
    }
  }

  async delete(reader: ReaderRuntime, char: string): Promise<void> {
    if (!this.isCurrent()) return;
    if (!this.#marks[char]) {
      this.#host.showStatus(`✗ mark ${char} not set`, 2000);
      return;
    }
    delete this.#marks[char];
    this.#host.onChange?.();
    const presentationCurrent = this.#host.capturePresentation();
    if (readerMarksPersist(this.#host.preferences)) await this.save(reader, presentationCurrent);
    if (!this.isCurrent() || !presentationCurrent()) return;
    this.#host.showStatus(`✓ mark ${char} deleted`, 1200);
  }

  async clear(reader: ReaderRuntime): Promise<void> {
    if (!this.isCurrent()) return;
    for (const char of Object.keys(this.#marks)) delete this.#marks[char];
    this.#host.onChange?.();
    const presentationCurrent = this.#host.capturePresentation();
    if (readerMarksPersist(this.#host.preferences)) await this.save(reader, presentationCurrent);
    if (!this.isCurrent() || !presentationCurrent()) return;
    this.#host.showStatus('✓ all marks deleted', 1200);
  }

  async save(
    reader: ReaderRuntime,
    presentationCurrent = this.#host.capturePresentation(),
  ): Promise<'extra' | 'local' | ''> {
    if (!this.isCurrent()) return '';
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
      if (this.isCurrent()) this.#host.log(`mark extra persistence failed: ${String(error)}`);
    }
    try {
      if (hasMarks)
        this.#host.preferences.set(`marks.data.${reader.itemID ?? ''}`, JSON.stringify(payload));
      else this.clearPreference(reader);
      return 'local';
    } catch (error) {
      if (this.isCurrent()) {
        this.#host.log(`mark preference persistence failed: ${String(error)}`);
        if (presentationCurrent()) this.#host.showStatus('✗ persist failed', 4000);
      }
      return '';
    }
  }

  load(reader: ReaderRuntime, retry = 0): void {
    if (!this.isCurrent() || !readerMarksPersist(this.#host.preferences)) return;
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
    this.#host.onChange?.();
    if (migrated) void this.save(reader);
  }

  /** Bookmark storage belongs to the attachment's parent, or the standalone attachment. */
  private storeItem(attachment: ItemRuntime): ItemRuntime | null {
    try {
      return attachment.parentItemID
        ? ((zoteroItem(attachment.parentItemID) as ItemRuntime | undefined) ?? null)
        : attachment;
    } catch {
      return null;
    }
  }

  private prefix(attachmentKey: string): string {
    return `zv-marks-${attachmentKey}: `;
  }

  private readExtra(item: ItemRuntime | null, attachmentKey: string): MarksPayload | null {
    const line = readerMarkExtra(item)
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
    const lines = readerMarkExtra(item)
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith(prefix));
    lines.push(`${prefix}${JSON.stringify(payload)}`);
    setReaderMarkExtra(item, lines.join('\n'));
    await item.saveTx();
  }

  private async clearExtra(item: ItemRuntime, attachmentKey: string): Promise<void> {
    const prefix = this.prefix(attachmentKey);
    const current = readerMarkExtra(item);
    const next = current
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith(prefix))
      .join('\n');
    if (next !== current) {
      setReaderMarkExtra(item, next);
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
