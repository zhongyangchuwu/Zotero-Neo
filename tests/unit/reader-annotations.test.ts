import { afterEach, describe, expect, it, vi } from 'vitest';
import { textAdmissionFixture } from '../fixtures/reader-text-admission';
import { leaseReaderTextAdmission } from '../../src/toolkit/reader/text-admission';
import { bodyTextAdmission } from '../../src/modules/reader-selection/body-text';

afterEach(() => vi.unstubAllGlobals());
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
    captureViewLifetime: () => () => true,
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
    ports,
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
  it.each(['valid', 'source-changed', 'view-retired'] as const)(
    'revalidates a filtered native text/geometry snapshot before save: %s',
    async (outcome) => {
      vi.stubGlobal('Components', { utils: { isDeadWrapper: () => false } });
      const t = textAdmissionFixture();
      const f = annotationFixture();
      Object.assign(f.window, t.window);
      Reflect.set(t.selection, 'removeAllRanges', vi.fn());
      Reflect.set(f.ports, 'itemForReader', () => ({ id: 7, libraryID: 1 }));
      const saves: { annotationText: string; annotationPosition: string }[] = [];
      vi.stubGlobal('Zotero', {
        Item: class {
          key = 'saved';
          async saveTx() {
            saves.push(this as unknown as (typeof saves)[number]);
          }
        },
      });
      t.document.documentElement.setAttribute('data-zv-select-active', '');
      const pending = Promise.withResolvers<boolean>();
      const release = leaseReaderTextAdmission(
        f.window,
        bodyTextAdmission([
          {
            id: 'chart',
            kind: 'image',
            pageIndex: 0,
            rect: [95, 765, 155, 785],
            text: '',
            format: 'text',
            flow: 'auxiliary',
            anchorPrecision: 'region',
          },
        ]),
        () => true,
        () => pending.promise,
      );
      const saving = f.module.highlight(f.window, COLORS.yellow);
      expect(saves).toEqual([]);
      if (outcome === 'view-retired') f.selectNewer();
      pending.resolve(outcome !== 'source-changed');
      await saving;
      if (outcome === 'valid') {
        expect(saves).toHaveLength(1);
        expect(saves[0]!.annotationText).toBe('alpha omega');
        expect(JSON.parse(saves[0]!.annotationPosition).rects).toEqual([
          [10, 780, 50, 790],
          [10, 760, 50, 770],
        ]);
      } else expect(saves).toEqual([]);
      release();
      f.host.dispose();
    },
  );
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
