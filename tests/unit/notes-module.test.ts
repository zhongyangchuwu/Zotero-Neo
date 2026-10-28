import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { ModuleHost } from '../../src/core/module-host';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import { createNotesModule } from '../../src/modules/notes';

afterEach(() => vi.unstubAllGlobals());

function harness() {
  vi.stubGlobal('Zotero', { Libraries: { userLibraryID: 1 } });
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  const opened: number[] = [];
  const selected: number[] = [];
  const window = {
    ZoteroPane: {
      openNote: (itemID: number) => {
        opened.push(itemID);
      },
    },
  } as unknown as MainWindow;
  let chooser: { open: boolean; options: PickerOpenOptions } | null = null;
  let acquiring: (() => void) | null = null;
  const notes = createNotesModule(host, {
    window,
    logger,
    status: () => {},
    choose: (options) => {
      if (chooser?.open) return null;
      const invocation = { open: true, options };
      chooser = invocation;
      acquiring?.();
      return () => {
        invocation.open = false;
        options.onClose?.('retire');
      };
    },
    selectNote: async (itemID, _surface, isCurrent, afterSelection) => {
      selected.push(itemID);
      if (isCurrent()) await afterSelection();
      return { kind: 'completed', evidence: 'settled-change', recorded: true };
    },
  });
  const document = {
    createElement: () => ({ id: '', textContent: '', remove: () => {} }),
    head: { append: () => {} },
    documentElement: { classList: { toggle: () => {}, remove: () => {} } },
  } as unknown as Document;
  return {
    host,
    notes,
    opened,
    selected,
    target: { ownerDocument: document } as HTMLElement,
    get chooser() {
      return chooser;
    },
    onAcquire(callback: () => void) {
      acquiring = callback;
    },
    cancel() {
      if (!chooser) throw new Error('Expected an active chooser');
      chooser.open = false;
      chooser.options.onClose?.('cancel');
    },
  };
}

const candidate = { id: 18, title: 'A note', search: 'a note', citekey: '', author: '', year: '' };

describe('Notes module composition', () => {
  it('keeps editing and Note navigation isolated when another window is retired', async () => {
    const first = harness();
    const second = harness();
    first.notes.editing.executeAction('enterInsert', first.target, 0);
    second.notes.findNotes(null, 'reader');
    expect(first.notes.editing.mode).toBe('insert');
    expect(second.notes.editing.mode).toBe('normal');

    first.host.dispose();
    await second.chooser!.options.confirm!(candidate, false);

    expect(first.notes.editing.mode).toBe('normal');
    expect(first.selected).toEqual([]);
    expect(second.opened).toEqual([18]);
    expect(second.chooser!.open).toBe(true);
    second.host.dispose();
    expect(second.chooser!.open).toBe(false);
  });

  it('releases acquisition completed after retirement and rejects the captured confirmation', async () => {
    const h = harness();
    h.onAcquire(() => h.host.dispose());
    h.notes.findNotes(null, 'main');

    await h.chooser!.options.confirm!(candidate, false);

    expect(h.chooser!.open).toBe(false);
    expect(h.selected).toEqual([]);
    expect(h.opened).toEqual([]);
  });

  it('cannot navigate from a cancelled invocation or disturb its replacement', async () => {
    const h = harness();
    h.notes.findNotes(null, 'note');
    const cancelled = h.chooser!;
    h.cancel();
    h.notes.findNotes(null, 'note');
    const replacement = h.chooser!;

    await cancelled.options.confirm!(candidate, false);
    expect(h.selected).toEqual([]);
    expect(replacement.open).toBe(true);
    await replacement.options.confirm!(candidate, false);
    expect(h.opened).toEqual([18]);
    h.host.dispose();
  });
});
