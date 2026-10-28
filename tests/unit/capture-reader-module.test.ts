import { describe, expect, it, vi } from 'vitest';

import type { ReaderNoteCaptureResult, ReaderSelectionContext } from '../../src/core/contracts';
import { ModuleHost } from '../../src/core/module-host';
import { createReaderCaptureModule } from '../../src/modules/capture/reader';

const selection: ReaderSelectionContext = {
  text: ' selected text ',
  itemID: 42,
  pageLabel: '7',
  position: '{"pageIndex":6}',
};

function createHost(isCurrent: () => boolean = () => true) {
  const host = new ModuleHost({ debug: () => {}, diagnostic: () => {} }, isCurrent);
  return host;
}

describe('Reader capture contribution', () => {
  it('admits only a linked item with nonblank selection', () => {
    const capture = vi.fn(async () => ({ noteID: 9, noteTitle: 'Reading Notes' }));
    const host = createHost();
    const module = createReaderCaptureModule(host, capture);
    const english = module.selectionAction('en');
    expect(english.isAvailable?.(selection)).toBe(true);
    expect(english.isAvailable?.({ ...selection, text: '  \n' })).toBe(false);
    expect(english.isAvailable?.({ ...selection, itemID: null })).toBe(false);
    host.dispose();
  });

  it('blocks a stale contribution before capture admission', async () => {
    const capture = vi.fn(async () => ({ noteID: 9, noteTitle: 'Reading Notes' }));
    const host = createHost();
    const action = createReaderCaptureModule(host, capture).selectionAction('en');

    host.dispose();

    expect(action.isAvailable?.(selection)).toBe(false);
    expect(await action.run(selection)).toEqual({ retired: true });
    expect(capture).not.toHaveBeenCalled();
  });

  it('waits for an admitted save but retires its obsolete UI result', async () => {
    let saveFinished = false;
    const { promise: pending, resolve: resolveCapture } =
      Promise.withResolvers<ReaderNoteCaptureResult>();
    const capture = vi.fn(async () => {
      const result = await pending;
      saveFinished = true;
      return result;
    });
    const host = createHost();
    const action = createReaderCaptureModule(host, capture).selectionAction('en');

    const result = action.run(selection);
    expect(capture).toHaveBeenCalledOnce();
    expect(saveFinished).toBe(false);
    host.dispose();
    resolveCapture({ noteID: 9, noteTitle: 'Reading Notes' });

    await expect(result).resolves.toEqual({ retired: true });
    expect(saveFinished).toBe(true);
  });

  it('does not expose a cancelled capture as a status result', async () => {
    const capture = vi.fn(async (): Promise<ReaderNoteCaptureResult> => null);
    const host = createHost();
    const action = createReaderCaptureModule(host, capture).selectionAction('en');

    await expect(action.run(selection)).resolves.toBeUndefined();
    host.dispose();
  });
});
