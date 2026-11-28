// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { textAdmissionFixture } from '../fixtures/reader-text-admission';
import {
  beginReaderTextSelection,
  leaseReaderTextAdmission,
} from '../../src/toolkit/reader/text-admission';
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
import type { KeyGuideLanguage } from '../../src/input/key-guide-config';

function annotationFixture(language: KeyGuideLanguage = 'en') {
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
  const second: AnnotationRuntime = { key: 'second', saveTx: vi.fn(async () => undefined) };
  const annotations = [first, second];
  const item: ItemRuntime = {
    key: 'attachment',
    saveTx: async () => undefined,
    getAnnotations: () => annotations,
  };
  const window = {} as PdfWindow;
  const confirm = vi.fn(() => true);
  const state = {
    selectedAnnotationIDs: [] as string[],
    annotations: [] as { id: string; readOnly?: boolean }[],
    readOnly: false,
  };
  const reader = {
    _window: { confirm },
    _internalReader: { _state: state },
  } as unknown as ReaderRuntime;
  const status = vi.fn();
  const clearAnnotation = vi.fn();
  const host = new ModuleHost({ debug: vi.fn(), diagnostic: vi.fn() }, () => true);
  const ports: ReaderAnnotationsModulePorts = {
    reader,
    capturePresentation: () => {
      const captured = revision;
      return () => captured === revision;
    },
    captureView: () => () => true,
    selectionParams: () => null,
    itemForReader: () => item,
    selectedAnnotationKey: () => state.selectedAnnotationIDs[0] ?? selected,
    rememberAnnotation: vi.fn(),
    clearAnnotation,
    clearNativeSelection: vi.fn(),
    setModeNormal: vi.fn(),
    defaultHighlightColor: () => COLORS.yellow,
    language: () => language,
    copyText: vi.fn(),
    beginSelectionAction: vi.fn(),
    showStatus: status,
    debug: vi.fn(),
  };
  return {
    host,
    window,
    first,
    second,
    annotations,
    state,
    confirm,
    status,
    clearAnnotation,
    module: createReaderAnnotationsModule(host, ports),
    ports,
    selectNewer: () => {
      selected = 'second';
      if (state.selectedAnnotationIDs.length) state.selectedAnnotationIDs = [selected];
      revision += 1;
    },
    selected: ports.selectedAnnotationKey,
    finishSave: () => finishSave(),
    finishErase: () => finishErase(),
    savedColor: () => savedColor,
    erased: () => erased,
  };
}

describe('Reader native comment surfaces', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('waits for the selected native comment in the requesting split, not another editable field', () => {
    vi.useFakeTimers();
    const f = annotationFixture();
    Reflect.set(f.ports.reader, '_iframeWindow', window);
    const state = {
      ...f.state,
      selectedAnnotationIDs: ['first'],
      annotations: [{ id: 'first', type: 'highlight' }],
      primaryViewAnnotationPopup: { annotation: { id: 'first' } },
      secondaryViewAnnotationPopup: { annotation: { id: 'other' } },
    };
    Reflect.set(f.ports.reader, '_internalReader', {
      _state: state,
      _primaryView: { _iframeWindow: {} },
      _secondaryView: {
        _iframeWindow: f.window,
        _openAnnotationPopup: () => {
          state.secondaryViewAnnotationPopup = { annotation: { id: 'first' } };
        },
      },
    });
    document.body.innerHTML = `
      <section class="primary-view">
        <div class="annotation-popup"><div class="comment">
          <div id="first" class="content" role="textbox" tabindex="-1"
            contenteditable="true" aria-readonly="false"></div>
        </div></div>
      </section>
      <section class="secondary-view">
        <div class="annotation-popup"><div class="comment">
          <div id="other" class="content" role="textbox" tabindex="-1"
            contenteditable="true" aria-readonly="false"></div>
        </div></div>
      </section>`;
    f.module.executeAction('editAnnotation', f.window);
    vi.advanceTimersByTime(25);
    expect(document.activeElement).toBe(document.body);

    const comment = document.querySelector('.secondary-view .comment')!;
    comment.innerHTML = `
      <div id="first" class="content" role="textbox" tabindex="-1"
        contenteditable="false" aria-readonly="true"><span>Read-only preview</span></div>`;
    vi.advanceTimersByTime(25);
    expect(document.activeElement).toBe(document.body);

    const input = comment.firstElementChild!;
    const pane = comment.closest<HTMLElement>('.secondary-view')!;
    pane.style.display = 'none';
    vi.advanceTimersByTime(25);
    expect(document.activeElement).toBe(document.body);

    // Zotero 10.0.8 reports an empty aria-readonly value in writable popups.
    input.setAttribute('contenteditable', 'true');
    input.setAttribute('aria-readonly', '');
    vi.advanceTimersByTime(25);
    expect(document.activeElement).toBe(document.body);

    pane.style.display = '';
    vi.advanceTimersByTime(25);
    expect(document.activeElement).toBe(input);
    expect(f.status).not.toHaveBeenCalled();
    input.remove();
    vi.advanceTimersByTime(2500);
    expect(document.activeElement).toBe(document.body);
    expect(f.status).not.toHaveBeenCalled();
    f.host.dispose();
  });

  it('releases the focus waiter immediately when the annotations module is disabled', () => {
    vi.useFakeTimers();
    const f = annotationFixture();
    Reflect.set(f.ports.reader, '_iframeWindow', window);
    Reflect.set(f.ports.reader, '_internalReader', {
      _state: {
        ...f.state,
        annotations: [{ id: 'first', type: 'highlight' }],
        selectedAnnotationIDs: ['first'],
        sidebarOpen: true,
        sidebarView: 'annotations',
      },
      _primaryView: { _iframeWindow: f.window },
    });
    f.module.executeAction('editAnnotation', f.window);
    expect(vi.getTimerCount()).toBe(1);

    f.host.release('reader-annotations');
    expect(vi.getTimerCount()).toBe(0);
    document.body.innerHTML = `
      <section id="annotations"><div data-sidebar-annotation-id="first"><div class="comment">
        <div id="first" class="content" role="textbox" tabindex="-1"
          contenteditable="true" aria-readonly="false"></div>
      </div></div></section>`;
    vi.advanceTimersByTime(2500);
    expect(document.activeElement).toBe(document.body);
    expect(f.status).not.toHaveBeenCalled();
    f.host.dispose();
  });
});

describe('Reader annotation batches', () => {
  it.each(['yankAnnotation', 'yankAnnotationComment'] as const)(
    'copies only available %s fields once and in native selection order',
    (action) => {
      const f = annotationFixture();
      f.first.annotationText = '  First\nexcerpt  ';
      f.first.annotationComment = ' First\ncomment ';
      f.second.annotationText = 'Ｓecond\nexcerpt';
      f.second.annotationComment = 'Ｓecond\ncomment';
      f.annotations.push(
        { key: 'empty', annotationText: ' ', annotationComment: '\n', saveTx: async () => {} },
        {
          key: 'unreadable',
          get annotationText(): string {
            throw new Error('native field access failed');
          },
          get annotationComment(): string {
            throw new Error('native field access failed');
          },
          saveTx: async () => {},
        },
      );
      const keys = ['second', 'missing', 'empty', 'unreadable', 'first', 'second'];
      Object.freeze(keys);
      f.state.selectedAnnotationIDs = keys;

      f.module.executeAction(action, f.window);

      const field = action === 'yankAnnotation' ? 'excerpt' : 'comment';
      expect(f.ports.copyText).toHaveBeenCalledExactlyOnceWith(`Second ${field}\n\nFirst ${field}`);
      expect(f.status.mock.lastCall?.[0]).toContain('Annotations copied: 2');
      expect(f.status.mock.lastCall?.[0]).toContain('Skipped 3');
      expect(f.ports.debug).toHaveBeenCalledWith(
        expect.stringContaining('native field access failed'),
      );
      expect(f.state.selectedAnnotationIDs).toEqual(keys);
      expect(f.ports.rememberAnnotation).not.toHaveBeenCalled();
      expect(f.ports.clearNativeSelection).not.toHaveBeenCalled();
      f.host.dispose();
    },
  );

  it('reports a partial annotation copy in the Reader language', () => {
    const f = annotationFixture('zh-CN');
    f.first.annotationText = 'Excerpt';
    f.state.selectedAnnotationIDs = ['first', 'second'];

    f.module.executeAction('yankAnnotation', f.window);

    expect(f.ports.copyText).toHaveBeenCalledExactlyOnceWith('Excerpt');
    expect(f.status.mock.lastCall?.[0]).toContain('已复制 1 条批注');
    expect(f.status.mock.lastCall?.[0]).toContain('1 条缺少要复制的文本');
    f.host.dispose();
  });

  it('does not use the remembered annotation when explicit native targets are unavailable', () => {
    const f = annotationFixture();
    f.first.annotationText = 'remembered';
    f.state.selectedAnnotationIDs = ['missing'];
    f.module.executeAction('yankAnnotation', f.window);
    expect(f.ports.copyText).not.toHaveBeenCalled();
    expect(f.status.mock.lastCall?.[0]).toContain('No annotations copied');

    f.state.selectedAnnotationIDs = [];
    f.module.executeAction('yankAnnotation', f.window);
    expect(f.ports.copyText).toHaveBeenCalledExactlyOnceWith('remembered');
    f.host.dispose();
  });

  it('does not claim a copy succeeded when the clipboard write throws', () => {
    const f = annotationFixture();
    f.first.annotationText = 'first';
    f.second.annotationText = 'second';
    f.state.selectedAnnotationIDs = ['first', 'second'];
    vi.mocked(f.ports.copyText).mockImplementation(() => {
      throw new Error('clipboard unavailable from host');
    });

    f.module.executeAction('yankAnnotation', f.window);

    expect(f.status.mock.lastCall?.[0]).toContain('No annotations copied');
    expect(f.status.mock.lastCall?.[0]).toContain('2 failed');
    expect(f.status.mock.lastCall?.[0]).not.toContain('clipboard unavailable from host');
    expect(f.ports.debug).toHaveBeenCalledWith(
      expect.stringContaining('clipboard unavailable from host'),
    );
    f.host.dispose();
  });

  it('recolors after failures and skips read-only, unchanged, and stale targets', async () => {
    const f = annotationFixture();
    const failed = vi.fn(async () => {
      throw new Error('native save rejected');
    });
    const skipped = vi.fn(async () => undefined);
    const locked = { key: 'locked', annotationColor: COLORS.yellow, saveTx: skipped };
    const unwritable = {
      key: 'unwritable',
      isEditable: () => false,
      annotationColor: COLORS.yellow,
      saveTx: skipped,
    };
    const external = {
      key: 'external',
      annotationIsExternal: true,
      annotationColor: COLORS.yellow,
      saveTx: skipped,
    };
    f.annotations.push(
      { key: 'failed', saveTx: failed },
      locked,
      unwritable,
      external,
      { key: 'same', annotationColor: COLORS.red, saveTx: skipped },
      { key: 'deleted', deleted: true, saveTx: skipped },
    );
    f.state.annotations = [{ id: locked.key, readOnly: true }];
    const keys = [
      'failed',
      'locked',
      'unwritable',
      'external',
      'same',
      'missing',
      'deleted',
      'second',
      'second',
    ];
    Object.freeze(keys);
    f.state.selectedAnnotationIDs = keys;

    await f.module.recolor(f.window, COLORS.red);

    expect(failed).toHaveBeenCalledOnce();
    expect(f.second.annotationColor).toBe(COLORS.red);
    expect(f.second.saveTx).toHaveBeenCalledExactlyOnceWith({ skipSelect: true });
    expect(skipped).not.toHaveBeenCalled();
    expect(locked.annotationColor).toBe(COLORS.yellow);
    expect(unwritable.annotationColor).toBe(COLORS.yellow);
    expect(external.annotationColor).toBe(COLORS.yellow);
    expect(f.status.mock.lastCall?.[0]).toContain('Annotations recolored: 1');
    expect(f.status.mock.lastCall?.[0]).toContain('Skipped 7');
    expect(f.status.mock.lastCall?.[0]).toContain('1 already up to date');
    expect(f.status.mock.lastCall?.[0]).toContain('1 failed');
    expect(f.ports.debug).toHaveBeenCalledWith(expect.stringContaining('native save rejected'));
    expect(f.state.selectedAnnotationIDs).toEqual(keys);
    expect(f.ports.rememberAnnotation).not.toHaveBeenCalled();
    f.host.dispose();
  });

  it('does not recolor when the native Reader is read-only', async () => {
    const f = annotationFixture();
    f.state.selectedAnnotationIDs = ['second'];
    f.state.readOnly = true;

    await f.module.recolor(f.window, COLORS.red);

    expect(f.second.saveTx).not.toHaveBeenCalled();
    expect(f.second.annotationColor).toBeUndefined();
    expect(f.status.mock.lastCall?.[0]).toContain('1 unavailable or read-only');
    f.host.dispose();
  });
});

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
      const pending = Promise.withResolvers<boolean>();
      let savingStarted = false;
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
        () => (savingStarted ? pending.promise : true),
      );
      const end = beginReaderTextSelection(f.window, t.nodes[0]!);
      savingStarted = true;
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
      end?.();
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

  it('does not start a later recolor after the Reader invocation retires', async () => {
    const f = annotationFixture();
    f.state.selectedAnnotationIDs = ['first', 'second'];
    const saving = f.module.recolor(f.window, COLORS.red);
    f.selectNewer();
    f.finishSave();
    await saving;

    expect(f.savedColor()).toBe(COLORS.red);
    expect(f.second.saveTx).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
    expect(f.state.selectedAnnotationIDs).toEqual(['second']);
    f.host.dispose();
  });

  it('finishes an admitted deletion after module disposal without changing presentation', async () => {
    const f = annotationFixture();
    const eraseSecond = vi.fn(async () => undefined);
    f.state.selectedAnnotationIDs = ['first', 'second'];
    Reflect.set(f.second, 'eraseTx', eraseSecond);
    f.module.executeAction('deleteAnnotation', f.window);
    expect(f.confirm).toHaveBeenCalledOnce();
    f.host.dispose();
    f.finishErase();
    await Promise.resolve();
    await Promise.resolve();

    expect(f.erased()).toBe(true);
    expect(eraseSecond).not.toHaveBeenCalled();
    expect(f.clearAnnotation).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
  });
});
