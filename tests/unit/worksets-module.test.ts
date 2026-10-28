import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import type { MainWindow } from '../../src/core/contracts';
import { resolveInteractionAppearance } from '../../src/main/interaction-appearance';
import type { PreferenceReader } from '../../src/core/preferences';
import { createWorksetsModule, type WorksetsModuleHost } from '../../src/modules/worksets';

function fixture() {
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const active = { id: 'item-tree-row-0' } as unknown as Element;
  const root = { contains: (node: unknown) => node === active };
  const rows = [10, 11].map((id) => ({ isObjectRow: true, ref: { id, libraryID: 1 } }));
  let focused = 0;
  const selection = {
    get focused() {
      return focused;
    },
    count: 1,
    select: (index: number) => {
      focused = index;
    },
  };
  const view = {
    domEl: root,
    rowCount: rows.length,
    selection,
    getRow: (index: number) => rows[index],
    getRowIndexByID: (id: number) => rows.findIndex((row) => row.ref.id === id),
    ensureRowIsVisible: vi.fn(),
  };
  const document = {
    activeElement: active,
    getElementById: () => null,
    querySelector: () => null,
    createElementNS: () => {
      const element = {
        id: '',
        className: '',
        textContent: '',
        style: {},
        append: vi.fn(),
        replaceChildren: vi.fn(),
        remove: vi.fn(),
        focus: vi.fn(),
        addEventListener: vi.fn(),
        children: [],
        dataset: {},
      };
      return element;
    },
    body: { append: vi.fn() },
    documentElement: { append: vi.fn() },
  };
  const window = {
    document,
    ZoteroPane: { itemsView: view, getSelectedItems: () => [rows[focused]!.ref] },
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
  } as unknown as MainWindow;
  const preferences = {
    get: ((_key: string, fallback: boolean | number | string) =>
      fallback) as PreferenceReader['get'],
  };
  const release = vi.fn();
  const ports: WorksetsModuleHost = {
    window,
    logger,
    appearance: {
      appearance: resolveInteractionAppearance(preferences, 'light'),
      observe: () => release,
    },
    themeRoot: () => () => {},
    refreshItemDecorations: vi.fn(),
    prepareSelectionPanel: vi.fn(),
    revealItem: () => null,
  };
  return { logger, ports, release };
}
describe('worksets module lifecycle', () => {
  it('retires selection and visual projections independently of a replacement host', () => {
    const f = fixture();
    let current = true;
    const firstHost = new ModuleHost(f.logger, () => current);
    const old = createWorksetsModule(firstHost, f.ports);
    expect(old.toggleCurrentTarget(false)).toBe(true);
    expect(old.selection.values()).toEqual([{ libraryID: 1, itemID: 10 }]);
    expect(old.marks.has({ libraryID: 1, itemID: 10 })).toBe(true);
    expect(old.enter()).toBe(true);
    expect(old.marks.visualRange()).toBeDefined();
    current = false;
    const replacementHost = new ModuleHost(f.logger, () => true);
    const replacement = createWorksetsModule(replacementHost, f.ports);
    expect(old.selection.size).toBe(0);
    expect(old.selection.remove({ libraryID: 1, itemID: 10 })).toBe(false);
    expect(old.marks.visualRange()).toBeUndefined();
    expect(old.enter()).toBe(false);
    firstHost.dispose();
    expect(replacement.selection.size).toBe(0);
    expect(replacement.toggleCurrentTarget(false)).toBe(true);
    expect(replacement.selection.size).toBe(1);
    replacementHost.dispose();
  });

  it('removes an acquired overlay if theming fails and keeps the original error', () => {
    const f = fixture();
    const error = new Error('theme failed');
    const append = vi.mocked(f.ports.window.document.body.append);
    const host = new ModuleHost(f.logger, () => true);
    const module = createWorksetsModule(host, {
      ...f.ports,
      themeRoot: () => {
        throw error;
      },
    });
    expect(() => module.manageSelection()).toThrow(error);
    const overlay = append.mock.calls[0]?.[0] as HTMLElement;
    expect(overlay.remove).toHaveBeenCalledOnce();
    expect(module.isPanelOpen).toBe(false);
    host.dispose();
  });

  it('releases partial acquisition and preserves the original activation error', () => {
    const f = fixture();
    const error = new Error('appearance unavailable');
    const host = new ModuleHost(f.logger, () => true);
    const ports = {
      ...f.ports,
      appearance: {
        ...f.ports.appearance,
        observe: () => {
          throw error;
        },
      },
    };
    expect(() => createWorksetsModule(host, ports)).toThrow(error);
    expect(f.ports.refreshItemDecorations).toHaveBeenCalled();
    const replacement = createWorksetsModule(host, f.ports);
    expect(replacement.selection.size).toBe(0);
    host.dispose();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('retires a Visual range before opening the persistent-selection inspector', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const module = createWorksetsModule(host, f.ports);
    module.enter();
    module.extend(1, 1);
    expect(module.marks.visualRange()).toEqual({ first: 0, last: 1, count: 2 });
    module.manageSelection();
    expect(module.isVisual).toBe(false);
    expect(module.isPanelOpen).toBe(true);
    expect(module.marks.visualRange()).toBeUndefined();
    host.dispose();
  });

  it('releases a theme acquired during reentrant retirement without focusing the retired overlay', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const releaseTheme = vi.fn();
    let overlay: HTMLElement | undefined;
    const module = createWorksetsModule(host, {
      ...f.ports,
      themeRoot: (root) => {
        overlay = root;
        host.dispose();
        return releaseTheme;
      },
    });
    module.manageSelection();
    expect(module.isPanelOpen).toBe(false);
    expect(releaseTheme).toHaveBeenCalledOnce();
    expect(overlay?.focus).not.toHaveBeenCalled();
    expect(overlay?.remove).toHaveBeenCalled();
  });

  it('keeps a replacement open when the old theme acquisition throws after reentry', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const original = new Error('old theme acquisition failed');
    const roots: HTMLElement[] = [];
    const releaseReplacement = vi.fn();
    const module = createWorksetsModule(host, {
      ...f.ports,
      themeRoot: (root) => {
        roots.push(root);
        if (roots.length === 1) {
          module.closePanel();
          module.manageSelection();
          throw original;
        }
        return releaseReplacement;
      },
    });
    expect(() => module.manageSelection()).toThrow(original);
    expect(module.isPanelOpen).toBe(true);
    expect(roots[0]?.remove).toHaveBeenCalled();
    expect(roots[1]?.remove).not.toHaveBeenCalled();
    expect(roots[1]?.focus).toHaveBeenCalledOnce();
    expect(releaseReplacement).not.toHaveBeenCalled();
    host.dispose();
    expect(releaseReplacement).toHaveBeenCalledOnce();
  });

  it('keeps the replacement open when the late old theme disposer throws', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const original = new Error('late old theme release failed');
    const roots: HTMLElement[] = [];
    const releaseReplacement = vi.fn();
    const releaseOld = vi.fn(() => {
      throw original;
    });
    const module = createWorksetsModule(host, {
      ...f.ports,
      themeRoot: (root) => {
        roots.push(root);
        if (roots.length === 1) {
          module.closePanel();
          module.manageSelection();
          return releaseOld;
        }
        return releaseReplacement;
      },
    });
    expect(() => module.manageSelection()).toThrow(original);
    expect(releaseOld).toHaveBeenCalledOnce();
    expect(module.isPanelOpen).toBe(true);
    expect(roots[0]?.remove).toHaveBeenCalled();
    expect(roots[1]?.remove).not.toHaveBeenCalled();
    expect(roots[1]?.focus).toHaveBeenCalledOnce();
    expect(releaseReplacement).not.toHaveBeenCalled();
    host.dispose();
  });

  it.each([false, true])(
    'does not restore stale focus when cleanup opens a replacement (closed again: %s)',
    (closeReplacement) => {
      const f = fixture();
      const previous = { isConnected: true, focus: vi.fn() };
      Object.defineProperty(f.ports.window.document, 'activeElement', {
        value: previous,
        configurable: true,
      });
      const host = new ModuleHost(f.logger, () => true);
      const roots: HTMLElement[] = [];
      const module = createWorksetsModule(host, {
        ...f.ports,
        themeRoot: (root) => {
          roots.push(root);
          if (roots.length !== 1) return () => {};
          return () => {
            module.manageSelection();
            if (closeReplacement) module.closePanel();
          };
        },
      });
      module.manageSelection();
      module.closePanel();
      expect(roots[1]?.focus).toHaveBeenCalledOnce();
      expect(module.isPanelOpen).toBe(!closeReplacement);
      // B's own close may restore its own captured focus; A must not do so afterwards.
      expect(previous.focus).toHaveBeenCalledTimes(closeReplacement ? 1 : 0);
      host.dispose();
    },
  );

  it('releases an appearance subscription returned after activation is retired', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const releaseAppearance = vi.fn();
    expect(() =>
      createWorksetsModule(host, {
        ...f.ports,
        appearance: {
          ...f.ports.appearance,
          observe: () => {
            host.dispose();
            return releaseAppearance;
          },
        },
      }),
    ).toThrow(Error);
    expect(releaseAppearance).toHaveBeenCalledOnce();
  });

  it('drains overlay, appearance and projection cleanup after a live theme-release failure', () => {
    const f = fixture();
    const host = new ModuleHost(f.logger, () => true);
    const failure = new Error('owned theme release failed');
    let overlay: HTMLElement | undefined;
    const module = createWorksetsModule(host, {
      ...f.ports,
      themeRoot: (root) => {
        overlay = root;
        return () => {
          throw failure;
        };
      },
    });
    module.manageSelection();
    vi.mocked(f.ports.refreshItemDecorations).mockClear();
    expect(() => host.dispose()).toThrow(failure);
    expect(overlay?.remove).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.ports.refreshItemDecorations).toHaveBeenCalledOnce();
    expect(module.isPanelOpen).toBe(false);
  });
});
