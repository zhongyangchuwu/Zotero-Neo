import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { ModuleHost } from '../../src/core/module-host';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import { createNotesModule } from '../../src/modules/notes';
import type { NavigationSurface } from '../../src/navigation/types';

afterEach(() => vi.unstubAllGlobals());

function harness() {
  vi.stubGlobal('Zotero', { Libraries: { userLibraryID: 1 } });
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  const opened: number[] = [];
  const selected: [number, NavigationSurface][] = [];
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
    language: () => 'en',
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
    selectNote: async (itemID, surface, isCurrent, afterSelection) => {
      selected.push([itemID, surface]);
      if (isCurrent()) await afterSelection();
      return { kind: 'completed', evidence: 'settled-change', recorded: true };
    },
  });
  return {
    host,
    notes,
    opened,
    selected,
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
  it('keeps the Reader Note picker and navigation alive when another window is retired', async () => {
    const first = harness();
    const second = harness();
    first.notes.findNotes(null, 'main');
    second.notes.findNotes(null, 'reader');

    first.host.dispose();
    await second.chooser!.options.confirm!(candidate, false);

    expect(first.chooser!.open).toBe(false);
    expect(first.selected).toEqual([]);
    expect(second.selected).toEqual([[18, 'reader']]);
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
    h.notes.findNotes(null, 'main');
    const cancelled = h.chooser!;
    h.cancel();
    h.notes.findNotes(null, 'main');
    const replacement = h.chooser!;

    await cancelled.options.confirm!(candidate, false);
    expect(h.selected).toEqual([]);
    expect(replacement.open).toBe(true);
    await replacement.options.confirm!(candidate, false);
    expect(h.selected).toEqual([[18, 'main']]);
    expect(h.opened).toEqual([18]);
    h.host.dispose();
  });
});
