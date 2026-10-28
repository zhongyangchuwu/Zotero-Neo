import { describe, expect, it, vi } from 'vitest';
import type { MainWindow } from '../../src/core/contracts';
import { ModuleHost } from '../../src/core/module-host';
import type { PickerOpenOptions } from '../../src/main/picker/types';
import type { NavigationResult } from '../../src/navigation/types';
import { createLibraryModule, type LibraryModuleHost } from '../../src/modules/library';

function harness() {
  const logger = { debug: vi.fn(), diagnostic: vi.fn() };
  const host = new ModuleHost(logger, () => true);
  let chooser: { open: boolean; options: PickerOpenOptions } | null = null;
  let selectedItem = 17;
  let acquired: (() => void) | null = null;
  const ports: LibraryModuleHost = {
    window: {} as MainWindow,
    logger,
    status: () => {},
    language: () => 'en',
    panel: () => 'items',
    focusPanel: () => true,
    themeRoot: () => () => {},
    leaveVisual: () => {},
    prepareQuickSearch: () => {},
    prepareIdentifierLookup: () => {},
    choose: (_kind, options) => {
      if (chooser?.open) return null;
      const invocation = { open: true, options };
      chooser = invocation;
      acquired?.();
      return () => {
        invocation.open = false;
      };
    },
    selectItem: async (itemID): Promise<NavigationResult> => {
      selectedItem = itemID;
      return { kind: 'completed', evidence: 'settled-change', recorded: true };
    },
    executeNavigation: () => {
      throw new Error('Unexpected navigation admission');
    },
    scopeActivation: () => {
      throw new Error('Unexpected Scope activation');
    },
  };
  const library = createLibraryModule(host, ports);
  return {
    host,
    library,
    get chooser() {
      return chooser;
    },
    get selectedItem() {
      return selectedItem;
    },
    onAcquire(callback: () => void) {
      acquired = callback;
    },
  };
}

const candidate = {
  id: 18,
  title: 'Another item',
  search: 'another item',
  citekey: '',
  author: '',
  year: '',
};

describe('Library module composition', () => {
  it('retires a chooser and prevents its captured confirmation from selecting an item', async () => {
    const h = harness();
    h.library.findItems('all', 'main');
    const chooser = h.chooser!;
    expect(chooser.open).toBe(true);

    h.host.dispose();
    await chooser.options.confirm!(candidate, false);

    expect(chooser.open).toBe(false);
    expect(h.selectedItem).toBe(17);
  });

  it('releases a chooser acquired after retirement instead of leaving an orphan UI', async () => {
    const h = harness();
    h.onAcquire(() => h.host.dispose());

    h.library.findItems('collection', 'note');
    const chooser = h.chooser!;
    await chooser.options.confirm!(candidate, false);

    expect(chooser.open).toBe(false);
    expect(h.selectedItem).toBe(17);
  });

  it('does not close or admit work in another Main window when one module is retired', async () => {
    const first = harness();
    const second = harness();
    first.library.findItems('all', 'main');
    second.library.findItems('collection', 'reader');
    const retiredChooser = first.chooser!;
    const liveChooser = second.chooser!;

    first.host.dispose();
    await retiredChooser.options.confirm!(candidate, false);
    await liveChooser.options.confirm!(candidate, false);

    expect(retiredChooser.open).toBe(false);
    expect(liveChooser.open).toBe(true);
    expect(first.selectedItem).toBe(17);
    expect(second.selectedItem).toBe(18);
    second.host.dispose();
    expect(liveChooser.open).toBe(false);
  });
});
