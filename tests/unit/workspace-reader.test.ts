import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderWorkspaceModule,
  type ReaderWorkspaceModule,
  type ReaderWorkspaceModuleHost,
} from '../../src/modules/workspace/reader';
import type { PdfWindow } from '../../src/reader/types';
import type { FocusDirection } from '../../src/input/actions';

function createHarness() {
  let currentView = {} as PdfWindow;
  const window = currentView;
  const ports: ReaderWorkspaceModuleHost = {
    isViewCurrent: (candidate) => candidate === currentView,
    toggleSplit: vi.fn(),
    focusDirection: vi.fn(() => true),
    canFocusDirection: vi.fn(() => true),
  };
  const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
  const module = createReaderWorkspaceModule(host, ports);
  return {
    host,
    module,
    ports,
    window,
    replaceView: (replacement: PdfWindow) => {
      currentView = replacement;
    },
  };
}

describe('Reader workspace module', () => {
  it('rejects the replaced exact view before split or focus effects', () => {
    const { host, module, ports, window, replaceView } = createHarness();
    const replacement = {} as PdfWindow;
    replaceView(replacement);

    expect(module.executeAction('toggleReaderSplitHorizontal', window)).toBe(false);
    expect(module.focusDirection('left', window)).toBe(false);
    expect(module.executeAction('toggleReaderSplitVertical', replacement)).toBe(true);
    expect(module.focusDirection('right', replacement)).toBe(true);
    expect(ports.toggleSplit).toHaveBeenCalledTimes(1);
    expect(ports.focusDirection).toHaveBeenCalledTimes(1);
    expect(ports.focusDirection).toHaveBeenCalledWith('right');

    host.dispose();
  });

  it('returns native focus success and uses guarded native availability', () => {
    const { host, module, ports, window } = createHarness();
    vi.mocked(ports.focusDirection).mockReturnValue(false);
    vi.mocked(ports.canFocusDirection).mockReturnValue(false);

    expect(module.focusDirection('left', window)).toBe(false);
    expect(module.canFocusDirection('left')).toBe(false);
    expect(ports.focusDirection).toHaveBeenCalledWith('left');
    expect(ports.canFocusDirection).toHaveBeenCalledWith('left');

    host.dispose();
    expect(module.executeAction('toggleReaderSplitHorizontal', window)).toBe(false);
    expect(module.focusDirection('right', window)).toBe(false);
    expect(module.canFocusDirection('right')).toBe(false);
    expect(ports.toggleSplit).not.toHaveBeenCalled();
  });

  it('keeps nested native focus results local to each invocation', () => {
    const window = {} as PdfWindow;
    let module!: ReaderWorkspaceModule;
    let nestedResult = false;
    const focusDirection = vi.fn((direction: FocusDirection) => {
      if (direction === 'left') nestedResult = module.focusDirection('right', window);
      return direction === 'right';
    });
    const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
    module = createReaderWorkspaceModule(host, {
      isViewCurrent: (candidate) => candidate === window,
      toggleSplit: vi.fn(),
      focusDirection,
      canFocusDirection: vi.fn(() => true),
    });

    expect(module.focusDirection('left', window)).toBe(false);
    expect(nestedResult).toBe(true);
    expect(focusDirection).toHaveBeenNthCalledWith(1, 'left');
    expect(focusDirection).toHaveBeenNthCalledWith(2, 'right');

    host.dispose();
  });
});
