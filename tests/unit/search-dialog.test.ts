import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchDialog, type SearchDialogOptions } from '../../src/ui/search-dialog';
import { DocumentFixture } from '../fixtures/dialog-dom';

beforeEach(() => vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } }));
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const doc = new DocumentFixture(),
    dialog = new SearchDialog<string>();
  const current = vi.fn(() => true),
    confirm = vi.fn(async () => true),
    restoreFocus = vi.fn(),
    untheme = vi.fn();
  const options: SearchDialogOptions<string> = {
    owner: { document: doc } as unknown as Window,
    current,
    confirm,
    restoreFocus,
    themeRoot: () => untheme,
    title: 'title',
    placeholder: 'query',
    help: 'help',
    loading: 'loading',
    unavailable: 'unavailable',
    close: 'close',
    empty: 'empty',
    load: async () => ({ items: ['alpha', 'beta'] }),
    filter: (items, query) => items.filter((s) => s.includes(query)),
    label: (s) => s,
    debug: vi.fn(),
  };
  const key = (value: string, extra = {}) =>
    dialog.handleKey({
      key: value,
      target: doc.activeElement,
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      ...extra,
    } as unknown as KeyboardEvent);
  return { doc, dialog, current, confirm, restoreFocus, untheme, options, key };
}
describe('query dialog lifetime', () => {
  it('cancels a superseded preview and does not let its late image replace the current object', async () => {
    const t = harness(),
      first = Promise.withResolvers<{ images: { dataURL: string; alt: string }[] }>();
    const signals: AbortSignal[] = [];
    t.options = {
      ...t.options,
      owner: { document: t.doc, AbortController } as unknown as Window,
      preview: (item, signal) => {
        signals.push(signal);
        return item === 'alpha'
          ? first.promise
          : Promise.resolve({ images: [{ dataURL: 'current', alt: 'beta' }] });
      },
    };
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('ArrowDown');
    await Promise.resolve();
    expect(signals[0]!.aborted).toBe(true);
    expect(t.doc.find('img').src).toBe('current');
    first.resolve({ images: [{ dataURL: 'stale', alt: 'alpha' }] });
    await Promise.resolve();
    expect(t.doc.find('img').src).toBe('current');
    t.dialog.close();
    expect(signals[1]!.aborted).toBe(true);
  });

  it('offers explicit caller actions without letting a disabled action write', async () => {
    const t = harness(),
      action = vi.fn(async () => true);
    t.options = {
      ...t.options,
      actions: [{ label: 'Save', available: (item) => item === 'beta', run: action }],
    };
    t.dialog.open(t.options);
    await Promise.resolve();
    const button = t.doc.nodes.find(
      (node) => node.tagName === 'button' && node.textContent === 'Save',
    )!;
    expect(button.disabled).toBe(true);
    button.emit('click');
    expect(action).not.toHaveBeenCalled();
    t.key('ArrowDown');
    expect(button.disabled).toBe(false);
    button.emit('click');
    await Promise.resolve();
    expect(action).toHaveBeenCalledExactlyOnceWith('beta');
    expect(t.doc.find('section')).toBeUndefined();
  });
  it('contains a late source load after cancellation without navigation', async () => {
    const t = harness(),
      pending = Promise.withResolvers<{ items: string[] }>();
    t.options = { ...t.options, load: () => pending.promise };
    t.dialog.open(t.options);
    t.key('Escape');
    pending.resolve({ items: ['late'] });
    await Promise.resolve();
    expect(t.doc.find('section')).toBeUndefined();
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.restoreFocus).toHaveBeenCalledOnce();
    expect(t.untheme).toHaveBeenCalledOnce();
  });
  it('does not confirm an IME candidate and admits ordinary Enter once', async () => {
    const t = harness(),
      pending = Promise.withResolvers<boolean>();
    t.confirm.mockReturnValue(pending.promise);
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('Enter', { isComposing: true });
    expect(t.confirm).not.toHaveBeenCalled();
    t.key('ArrowDown');
    t.key('Enter');
    t.key('Enter');
    expect(t.confirm).toHaveBeenCalledExactlyOnceWith('beta');
    pending.resolve(true);
    await Promise.resolve();
    expect(t.doc.find('section')).toBeUndefined();
  });
  it('never lets an old confirmation close a replacement dialog or restore retired focus', async () => {
    const t = harness(),
      pending = Promise.withResolvers<boolean>();
    t.confirm.mockReturnValueOnce(pending.promise);
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('Enter');
    t.dialog.open(t.options);
    await Promise.resolve();
    pending.resolve(true);
    await Promise.resolve();
    expect(t.doc.find('section')).toBeDefined();
    expect(t.restoreFocus).not.toHaveBeenCalled();
    t.current.mockReturnValue(false);
    t.key('Escape');
    expect(t.restoreFocus).not.toHaveBeenCalled();
    expect(t.doc.find('section')).toBeUndefined();
  });
  it('keeps the query open if the caller rejects a changed source', async () => {
    const t = harness();
    t.confirm.mockResolvedValue(false);
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('Enter');
    await Promise.resolve();
    expect(t.doc.find('section')).toBeDefined();
    expect(t.restoreFocus).not.toHaveBeenCalled();
    t.dialog.close();
  });
});
