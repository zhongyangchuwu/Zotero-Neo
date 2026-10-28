import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MainWindow, ReaderSelectionContext } from '../../src/core/contracts';
import { ModuleHost } from '../../src/core/module-host';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import { createCaptureModule } from '../../src/modules/capture';

afterEach(() => vi.unstubAllGlobals());

const context: ReaderSelectionContext = {
  text: 'Selected',
  itemID: 2,
  pageLabel: null,
  position: null,
};
const candidate = { id: 18, title: 'Note', search: 'note', group: 'library:1:item:2' };

function fixture() {
  const base = { id: 2, libraryID: 1, isAttachment: () => false, isNote: () => false };
  let body = '<p>Existing</p>';
  const save = vi.fn(async () => {});
  const note = {
    id: 18,
    libraryID: 1,
    parentItemID: 2,
    deleted: false,
    isNote: () => true,
    getDisplayTitle: () => 'Saved note',
    getNote: () => body,
    setNote: (value: string) => {
      body = value;
    },
    saveTx: save,
  };
  const get = vi.fn((id: number) => (id === 2 ? base : id === 18 ? note : false));
  vi.stubGlobal('Zotero', { Items: { get }, Utilities: { text2html: (text: string) => text } });
  return { note, save, get, body: () => body };
}

function harness() {
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  let chooser: { open: boolean; options: PickerOpenOptions } | null = null;
  let acquiring: (() => void) | null = null;
  const status = vi.fn();
  const capture = createCaptureModule(host, {
    window: {} as MainWindow,
    logger,
    pickerBusy: () => chooser?.open ?? false,
    status,
    choose: (options) => {
      if (chooser?.open) return null;
      const invocation = { open: true, options };
      chooser = invocation;
      acquiring?.();
      return () => {
        if (!invocation.open) return;
        invocation.open = false;
        options.onClose?.('retire');
      };
    },
  });
  return {
    host,
    capture,
    status,
    get chooser() {
      return chooser!;
    },
    onAcquire(callback: () => void) {
      acquiring = callback;
    },
    close(reason: 'cancel' | 'confirm' | 'retire') {
      if (!chooser) throw new Error('Expected chooser');
      chooser.open = false;
      chooser.options.onClose?.(reason);
    },
  };
}

describe('Capture module lifetimes', () => {
  it('isolates hosts and saves the immutable Reader snapshot', async () => {
    const f = fixture();
    const first = harness();
    const second = harness();
    const input = { ...context };
    const firstResult = first.capture.capture(input);
    const secondResult = second.capture.capture(input);
    input.text = 'Changed later';
    first.host.dispose();
    expect(await firstResult).toEqual({ retired: true, receipt: null });
    expect(first.chooser.open).toBe(false);
    expect(second.chooser.open).toBe(true);
    await second.chooser.options.confirm!(candidate, false);
    second.close('confirm');
    expect(await secondResult).toEqual({ noteID: 18, noteTitle: 'Saved note' });
    expect(f.body()).toContain('Selected');
    expect(f.body()).not.toContain('Changed later');
    second.host.dispose();
  });

  it('rejects stale confirmations without affecting a replacement', async () => {
    const f = fixture();
    const h = harness();
    const first = h.capture.capture(context);
    const stale = h.chooser;
    h.close('retire');
    expect(await first).toEqual({ retired: true, receipt: null });
    const second = h.capture.capture(context);
    const replacement = h.chooser;
    await stale.options.confirm!(candidate, false);
    expect(f.save).not.toHaveBeenCalled();
    expect(replacement.open).toBe(true);
    await replacement.options.confirm!(candidate, false);
    h.close('confirm');
    expect(await second).toEqual({ noteID: 18, noteTitle: 'Saved note' });
    h.host.dispose();
  });

  it.each(['saved', 'failed'] as const)(
    'waits for an admitted %s save after retirement',
    async (outcome) => {
      const f = fixture();
      let finish!: () => void;
      let fail!: (error: Error) => void;
      f.save.mockImplementation(
        () =>
          new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      );
      const h = harness();
      const result = h.capture.capture(context);
      const confirmation = Promise.resolve(h.chooser.options.confirm!(candidate, false));
      let settled = false;
      void result.then(() => {
        settled = true;
      });
      h.host.dispose();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(h.chooser.open).toBe(false);
      if (outcome === 'saved') {
        finish();
        await confirmation;
        expect(await result).toEqual({
          retired: true,
          receipt: { noteID: 18, noteTitle: 'Saved note' },
        });
      } else {
        const error = new Error('save failed');
        fail(error);
        await expect(confirmation).rejects.toBe(error);
        expect(await result).toEqual({ retired: true, receipt: null });
        expect(f.body()).toBe('<p>Existing</p>');
      }
    },
  );

  it('releases a lease acquired after disposal and ignores its confirmation', async () => {
    const f = fixture();
    const h = harness();
    h.onAcquire(() => h.host.dispose());
    const result = h.capture.capture(context);
    expect(await result).toEqual({ retired: true, receipt: null });
    expect(h.chooser.open).toBe(false);
    await h.chooser.options.confirm!(candidate, false);
    expect(f.save).not.toHaveBeenCalled();
  });

  it('checks busy before source lookup and rejects changed ownership for retry', async () => {
    const f = fixture();
    const h = harness();
    const result = h.capture.capture(context);
    f.get.mockClear();
    expect(await h.capture.capture(context)).toBeNull();
    expect(f.get).not.toHaveBeenCalled();
    f.note.parentItemID = 3;
    await expect(h.chooser.options.confirm!(candidate, false)).rejects.toBeInstanceOf(Error);
    expect(f.save).not.toHaveBeenCalled();
    expect(h.chooser.open).toBe(true);
    f.note.parentItemID = 2;
    await h.chooser.options.confirm!(candidate, false);
    h.close('confirm');
    expect(await result).toEqual({ noteID: 18, noteTitle: 'Saved note' });
    h.host.dispose();
  });
});
