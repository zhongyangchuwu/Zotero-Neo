import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureTranslateForZotero248,
  readerSelectionPopupSource,
  translationMarkerPosition,
} from '../../src/toolkit/reader';
import type { ReaderRuntime } from '../../src/toolkit/reader';

afterEach(() => vi.unstubAllGlobals());

function popupHarness() {
  const textarea = Object.assign(new EventTarget(), {
    tagName: 'TEXTAREA',
    isConnected: true,
    value: 'Translated',
  });
  const attributes = new Map([
    ['translate-task-id', 'task-a'],
    ['zoteropdftranslate-prefix', 'prefix'],
  ]);
  const popup = {
    isConnected: true,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    contains: (element: unknown): boolean => element === popup || element === textarea,
    ownerDocument: { getElementById: () => textarea },
  };
  const nativePopup = { isConnected: true, contains: (element: unknown) => element === popup };
  const task = {
    id: 'task-a',
    type: 'text',
    raw: 'Source',
    itemId: 1,
    status: 'success',
    result: 'Translated',
  };
  const data = { popup: { currentPopup: popup }, translate: { queue: [task] } };
  vi.stubGlobal('Zotero', { PDFTranslate: { api: { getVersion: () => '2.4.8' }, data } });
  return { textarea, popup: nativePopup as unknown as Element, task, data, attributes };
}

describe('native translation source', () => {
  it('retains an edited completed result and retires when its task changes', () => {
    const { popup, textarea, attributes } = popupHarness();
    const capture = captureTranslateForZotero248(popup, 1, 'Source');
    expect(capture.read()).toEqual({ status: 'ready', text: 'Translated' });
    textarea.dispatchEvent(new Event('beforeinput'));
    textarea.value = 'Revised translation';
    textarea.dispatchEvent(new Event('input'));
    expect(capture.read()).toEqual({ status: 'ready', text: 'Revised translation' });
    attributes.set('translate-task-id', 'task-b');
    expect(capture.read()).toEqual({ status: 'retired' });
    capture.dispose();
  });

  it('verifies textarea-normalized CRLF and lone-CR results and preserves later revisions', () => {
    for (const ending of ['\r\n', '\r']) {
      const { popup, textarea, task } = popupHarness();
      task.result = `first${ending}second`;
      textarea.value = 'first\nsecond';
      const capture = captureTranslateForZotero248(popup, 1, 'Source');
      expect(capture.read()).toEqual({ status: 'ready', text: 'first\nsecond' });
      textarea.dispatchEvent(new Event('beforeinput'));
      textarea.value = 'first\nrevised';
      textarea.dispatchEvent(new Event('input'));
      expect(capture.read()).toEqual({ status: 'ready', text: 'first\nrevised' });
      capture.dispose();
    }
  });

  it('rejects a wrong item and a completed task whose result was never displayed', () => {
    const { popup, textarea } = popupHarness();
    expect(captureTranslateForZotero248(popup, 2, 'Source').read()).toEqual({
      status: 'not-ready',
    });
    textarea.value = 'Source';
    expect(captureTranslateForZotero248(popup, 1, 'Source').read()).toEqual({
      status: 'not-ready',
    });
  });

  it('binds a popup to only its exact split and retires on replacement', () => {
    const annotation = { text: 'Source' };
    const firstWindow = {} as Window;
    const secondWindow = {} as Window;
    const state = {
      primaryViewSelectionPopup: { annotation },
      secondaryViewSelectionPopup: null as { annotation: object } | null,
    };
    const internal = {
      _state: state,
      _primaryView: { _iframeWindow: firstWindow },
      _secondaryView: { _iframeWindow: secondWindow },
    };
    const reader = { _internalReader: internal } as unknown as ReaderRuntime;
    const source = readerSelectionPopupSource(reader, annotation);
    expect(source?.window).toBe(firstWindow);
    expect(source?.isCurrent()).toBe(true);
    state.secondaryViewSelectionPopup = { annotation };
    expect(readerSelectionPopupSource(reader, annotation)).toBeNull();
    state.primaryViewSelectionPopup = { annotation: { text: 'Source' } };
    expect(source?.isCurrent()).toBe(false);
  });
});

describe('translation marker geometry', () => {
  it('keeps a native pin beside the source when margin is available', () => {
    const position = JSON.parse(
      translationMarkerPosition({ pageIndex: 3, rects: [[70, 100, 180, 112]] })!,
    );
    expect(position.pageIndex).toBe(3);
    expect(position.rects[0][2]).toBeLessThan(70);
    expect(position.rects[0][3]).toBeGreaterThan(position.rects[0][1]);
  });

  it('rejects missing, inverted or non-finite source fragments', () => {
    for (const value of [
      null,
      { pageIndex: -1, rects: [[1, 2, 3, 4]] },
      { pageIndex: 0, rects: [[3, 2, 1, 4]] },
      { pageIndex: 0, rects: [[1, 2, Infinity, 4]] },
    ])
      expect(translationMarkerPosition(value)).toBeNull();
  });
});
