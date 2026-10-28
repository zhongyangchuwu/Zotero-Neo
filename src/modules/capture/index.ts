import type { Cleanup } from '../../core/cleanup';
import type {
  MainWindow,
  ReaderNoteCaptureReceipt,
  ReaderNoteCaptureResult,
  ReaderSelectionContext,
} from '../../core/contracts';
import type { Logger } from '../../core/logging';
import type { ModuleHost } from '../../core/module-host';
import type { PickerOpenOptions } from '../../main/picker/types';
import { createNotesProvider } from '../notes';
import { noteOwnerKey } from '../../platform/zotero-items';
import { appendReaderSelectionToNote, readerCaptureBaseItem } from './note';

export interface CaptureModuleHost {
  readonly window: MainWindow;
  readonly logger: Logger;
  pickerBusy(): boolean;
  status(message: string): void;
  choose(options: PickerOpenOptions): Cleanup | null;
}

export interface CaptureModule {
  capture(context: ReaderSelectionContext): Promise<ReaderNoteCaptureResult>;
}

interface CaptureChooser {
  retire(): void;
  release: Cleanup | null;
}

/** Owns the chooser lifetime without cancelling native saves already admitted by confirmation. */
export function createCaptureModule(host: ModuleHost, ports: CaptureModuleHost): CaptureModule {
  return host.activate('capture', (scope) => {
    let active: CaptureChooser | null = null;
    scope.add(() => {
      const chooser = active;
      active = null;
      if (!chooser) return;
      const release = chooser.release;
      chooser.retire();
      release?.();
    });

    return {
      async capture(context) {
        if (!scope.isCurrent()) return { retired: true, receipt: null };
        if (ports.pickerBusy()) {
          ports.status('✗ Close the current picker before capturing');
          return null;
        }
        const snapshot: ReaderSelectionContext = Object.freeze({
          text: context.text,
          itemID: context.itemID,
          pageLabel: context.pageLabel,
          position: context.position,
        });
        const base = readerCaptureBaseItem(snapshot);
        if (!base || !Number.isInteger(base.libraryID) || base.libraryID <= 0) {
          ports.status('✗ Reader item is unavailable');
          return null;
        }
        const libraryID = base.libraryID;

        return await new Promise<ReaderNoteCaptureResult>((resolve, reject) => {
          let receipt: ReaderNoteCaptureReceipt | null = null;
          let saving = false;
          let closed = false;
          let retired = false;
          const settle = (): void => resolve(retired ? { retired: true, receipt } : receipt);
          const close = (forced: boolean): void => {
            if (closed) return;
            closed = true;
            retired = forced;
            if (active === chooser) active = null;
            chooser.release = null;
            if (!saving) settle();
          };
          const chooser: CaptureChooser = { release: null, retire: () => close(true) };
          const previous = active;
          active = chooser;
          let release: Cleanup | null;
          try {
            release = ports.choose({
              source: createNotesProvider(ports.window, ports.logger, {
                baseItem: base,
                libraryID,
              }),
              onClose: (reason) => close(reason === 'retire'),
              confirm: async (candidate) => {
                if (!scope.isCurrent() || closed || active !== chooser) return;
                saving = true;
                try {
                  const note = Zotero.Items.get(Number(candidate.id));
                  if (!note) throw new Error('Note target is unavailable');
                  if (noteOwnerKey(note) !== candidate.group)
                    throw new Error(
                      'Note source changed. Refresh the Notes source before confirming.',
                    );
                  const noteTitle =
                    note.getDisplayTitle?.().trim() ||
                    note.getNoteTitle?.().trim() ||
                    candidate.title;
                  await appendReaderSelectionToNote(note, snapshot, libraryID);
                  receipt = { noteID: note.id, noteTitle };
                } finally {
                  saving = false;
                  if (closed) settle();
                }
              },
            });
          } catch (error) {
            if (active === chooser) active = previous;
            reject(error);
            return;
          }
          if (!release) {
            if (active === chooser) active = previous;
            if (!closed) resolve(null);
            return;
          }
          if (!scope.isCurrent() || closed || active !== chooser) {
            if (!closed) close(true);
            release();
            return;
          }
          chooser.release = release;
          if (previous) {
            const oldRelease = previous.release;
            previous.retire();
            oldRelease?.();
          }
        });
      },
    };
  });
}
