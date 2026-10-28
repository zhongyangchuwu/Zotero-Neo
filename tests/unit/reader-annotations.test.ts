import { describe, expect, it, vi } from 'vitest';
import { ModuleHost } from '../../src/core/module-host';
import {
  createReaderAnnotationsModule,
  type ReaderAnnotationsModulePorts,
} from '../../src/modules/reader-annotations';
import {
  COLORS,
  type AnnotationRuntime,
  type ItemRuntime,
  type PdfWindow,
  type ReaderRuntime,
} from '../../src/reader/types';

function annotationFixture() {
  let revision = 0;
  let selected = 'first';
  let finishSave!: () => void;
  let finishErase!: () => void;
  let savedColor: string | undefined;
  let erased = false;
  const first: AnnotationRuntime = {
    key: 'first',
    annotationColor: COLORS.yellow,
    saveTx: () =>
      new Promise<void>((resolve) => {
        finishSave = () => {
          savedColor = first.annotationColor;
          resolve();
        };
      }),
    eraseTx: () =>
      new Promise<void>((resolve) => {
        finishErase = () => {
          erased = true;
          resolve();
        };
      }),
  };
  const second: AnnotationRuntime = { key: 'second', saveTx: async () => undefined };
  const item: ItemRuntime = {
    key: 'attachment',
    saveTx: async () => undefined,
    getAnnotations: () => [first, second],
  };
  const window = {} as PdfWindow;
  const confirm = vi.fn(() => true);
  const reader = { _window: { confirm } } as unknown as ReaderRuntime;
  const status = vi.fn();
  const clearAnnotation = vi.fn();
  const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
  const ports: ReaderAnnotationsModulePorts = {
    reader,
    activeWindow: () => window,
    capturePresentation: () => {
      const captured = revision;
      return () => captured === revision;
    },
    captureView: () => () => true,
    selectionParams: () => null,
    itemForReader: () => item,
    selectedAnnotationKey: () => selected,
    rememberAnnotation: vi.fn(),
    clearAnnotation,
    clearNativeSelection: vi.fn(),
    setModeNormal: vi.fn(),
    releaseNativeInput: vi.fn(),
    defaultHighlightColor: () => COLORS.yellow,
    commentEnabled: () => true,
    themeRoot: () => () => undefined,
    nativeEditableFocused: () => false,
    onNativeEditorFocus: vi.fn(),
    onInputOwnerChanged: vi.fn(),
    onCommentExit: vi.fn(),
    language: () => 'en',
    locale: () => 'en',
    copyText: vi.fn(),
    beginSelectionAction: vi.fn(),
    showStatus: status,
    debug: vi.fn(),
  };
  return {
    host,
    window,
    first,
    confirm,
    status,
    clearAnnotation,
    module: createReaderAnnotationsModule(host, ports),
    selectNewer: () => {
      selected = 'second';
      revision += 1;
    },
    selected: () => selected,
    finishSave: () => finishSave(),
    finishErase: () => finishErase(),
    savedColor: () => savedColor,
    erased: () => erased,
  };
}

describe('Reader annotation operation retirement', () => {
  it('saves the original recolor without replacing a newer interaction status', async () => {
    const f = annotationFixture();
    const saving = f.module.recolor(f.window, COLORS.red);
    f.selectNewer();
    f.status('newer interaction');
    f.finishSave();
    await saving;

    expect(f.savedColor()).toBe(COLORS.red);
    expect(f.selected()).toBe('second');
    expect(f.status).toHaveBeenCalledTimes(1);
    expect(f.status).toHaveBeenLastCalledWith('newer interaction');
    f.host.dispose();
  });

  it('finishes an admitted deletion after module disposal without changing presentation', async () => {
    const f = annotationFixture();
    f.module.executeAction('deleteAnnotation', f.window);
    expect(f.confirm).toHaveBeenCalledOnce();
    f.host.dispose();
    f.finishErase();
    await Promise.resolve();
    await Promise.resolve();

    expect(f.erased()).toBe(true);
    expect(f.clearAnnotation).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
  });
});
