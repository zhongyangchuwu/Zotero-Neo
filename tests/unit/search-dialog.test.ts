import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SearchDialogReactCommand,
  SearchDialogReactModel,
} from '../../src/ui/search-dialog-react-model';
import { DocumentFixture, type DialogElement } from '../fixtures/dialog-dom';

const host = vi.hoisted(() => ({
  views: [] as {
    model: SearchDialogReactModel;
    dispatch: (command: SearchDialogReactCommand) => void;
    disposed: boolean;
  }[],
}));
vi.mock('../../src/platform/native-ui', () => ({
  mountNativeReactView: (options: {
    root: unknown;
    model: SearchDialogReactModel;
    dispatch: (command: SearchDialogReactCommand) => void;
  }) => {
    const root = options.root as DialogElement;
    const doc = root.ownerDocument;
    const input = doc.createElementNS('', 'input');
    const scopes = doc.createElementNS('', 'select');
    const results = doc.createElementNS('', 'div');
    const preview = doc.createElementNS('', 'div');
    root.append(input, scopes, results, preview);
    const parts: Record<string, DialogElement> = { input, scopes, results, preview };
    const view = { model: options.model, dispatch: options.dispatch, disposed: false };
    host.views.push(view);
    return {
      ready: Promise.resolve(),
      update: (model: SearchDialogReactModel) => {
        if (!view.disposed) view.model = model;
      },
      getElement: (part: string) => parts[part] ?? null,
      dispose: () => {
        view.disposed = true;
      },
    };
  },
}));
import { SearchDialog, type SearchDialogOptions } from '../../src/ui/search-dialog';

beforeEach(() => {
  host.views.length = 0;
  vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
});
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const doc = new DocumentFixture();
  const dialog = new SearchDialog<string>();
  const current = vi.fn(() => true);
  const confirm = vi.fn(async () => true);
  const restoreFocus = vi.fn();
  const untheme = vi.fn();
  const options: SearchDialogOptions<string> = {
    owner: { document: doc, AbortController } as unknown as Window,
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
  it('cancels a superseded preview and ignores its late result', async () => {
    const t = harness();
    const first = Promise.withResolvers<{ images: { dataURL: string; alt: string }[] }>();
    const signals: AbortSignal[] = [];
    t.dialog.open({
      ...t.options,
      preview: (item, signal) => {
        signals.push(signal);
        return item === 'alpha'
          ? first.promise
          : Promise.resolve({ images: [{ dataURL: 'current', alt: 'beta' }] });
      },
    });
    await Promise.resolve();
    t.key('ArrowDown');
    await Promise.resolve();
    expect(signals[0]!.aborted).toBe(true);
    expect(host.views[0]!.model.previewImages[0]?.dataURL).toBe('current');
    first.resolve({ images: [{ dataURL: 'stale', alt: 'alpha' }] });
    await Promise.resolve();
    expect(host.views[0]!.model.previewImages[0]?.dataURL).toBe('current');
    t.dialog.close();
    expect(signals[1]!.aborted).toBe(true);
  });
  it('offers caller actions without letting an unavailable action write', async () => {
    const t = harness();
    const action = vi.fn(async () => true);
    t.dialog.open({
      ...t.options,
      actions: [{ label: 'Save', available: (item) => item === 'beta', run: action }],
    });
    await Promise.resolve();
    const view = host.views[0]!;
    expect(view.model.actions[0]?.disabled).toBe(true);
    view.dispatch({ type: 'action', index: 0 });
    expect(action).not.toHaveBeenCalled();
    t.key('ArrowDown');
    expect(view.model.actions[0]?.disabled).toBe(false);
    view.dispatch({ type: 'action', index: 0 });
    await Promise.resolve();
    expect(action).toHaveBeenCalledExactlyOnceWith('beta');
    expect(view.disposed).toBe(true);
  });
  it('contains a late source load after cancellation without navigation', async () => {
    const t = harness();
    const pending = Promise.withResolvers<{ items: string[] }>();
    t.dialog.open({ ...t.options, load: () => pending.promise });
    await Promise.resolve();
    t.key('Escape');
    pending.resolve({ items: ['late'] });
    await Promise.resolve();
    expect(host.views[0]!.disposed).toBe(true);
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.restoreFocus).toHaveBeenCalledOnce();
    expect(t.untheme).toHaveBeenCalledOnce();
  });
  it('does not confirm an IME candidate and admits ordinary Enter once', async () => {
    const t = harness();
    const pending = Promise.withResolvers<boolean>();
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
    expect(host.views[0]!.disposed).toBe(true);
  });
  it('never lets an old confirmation close a replacement dialog or restore retired focus', async () => {
    const t = harness();
    const pending = Promise.withResolvers<boolean>();
    t.confirm.mockReturnValueOnce(pending.promise);
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('Enter');
    t.dialog.open(t.options);
    await Promise.resolve();
    pending.resolve(true);
    await Promise.resolve();
    expect(host.views[1]!.disposed).toBe(false);
    expect(t.restoreFocus).not.toHaveBeenCalled();
    t.current.mockReturnValue(false);
    t.key('Escape');
    expect(t.restoreFocus).not.toHaveBeenCalled();
    expect(host.views[1]!.disposed).toBe(true);
  });
  it('keeps the query open if the caller rejects a changed source', async () => {
    const t = harness();
    t.confirm.mockResolvedValue(false);
    t.dialog.open(t.options);
    await Promise.resolve();
    t.key('Enter');
    await Promise.resolve();
    expect(host.views[0]!.disposed).toBe(false);
    expect(host.views[0]!.model.status).toBe('unavailable');
    expect(t.restoreFocus).not.toHaveBeenCalled();
    t.dialog.close();
  });
  it('does not apply a late source to a replacement dialog', async () => {
    const t = harness();
    const pending = Promise.withResolvers<{ items: string[] }>();
    t.dialog.open({ ...t.options, load: () => pending.promise });
    expect(host.views[0]!.model.status).toBe('loading');
    t.dialog.open(t.options);
    await Promise.resolve();
    pending.resolve({ items: ['late'] });
    await Promise.resolve();
    expect(host.views[1]!.model.rows).toEqual(['alpha', 'beta']);
    t.dialog.close();
  });
  it('renders empty and failed source states', async () => {
    const t = harness();
    t.dialog.open({ ...t.options, load: async () => ({ items: [] }) });
    await Promise.resolve();
    expect(host.views[0]!.model.loaded).toBe(true);
    expect(host.views[0]!.model.rows).toEqual([]);
    t.dialog.open({
      ...t.options,
      load: async () => {
        throw new Error('failed');
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(host.views[1]!.model.status).toBe('unavailable');
    expect(t.options.debug).toHaveBeenCalledOnce();
    t.dialog.close();
  });
});
