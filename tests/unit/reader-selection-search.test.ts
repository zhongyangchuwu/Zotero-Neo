import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareReaderSelectionSearch } from '../../src/toolkit/reader';
import type { PdfWindow, ReaderRuntime } from '../../src/reader/types';

const cloned = new WeakSet<object>();
beforeEach(() => {
  vi.stubGlobal('Components', {
    utils: {
      isDeadWrapper: () => false,
      cloneInto: <T extends object>(value: T): T => {
        const result = { ...value };
        cloned.add(result);
        return result;
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function findReader() {
  type FindState = { popupOpen: boolean; query: string };
  const state = {
    primaryViewFindState: { popupOpen: false, query: 'primary query' } as FindState,
    secondaryViewFindState: { popupOpen: false, query: 'secondary query' } as FindState,
  };
  const makeInput = (primary: boolean) => {
    const field = primary ? 'primaryViewFindState' : 'secondaryViewFindState';
    const input = {
      value: state[field].query,
      dispatchEvent: (event: Event) => {
        if (event.type === 'input' && event.bubbles)
          state[field] = { ...state[field], query: input.value };
        return true;
      },
    };
    return input;
  };
  const primaryInput = makeInput(true),
    secondaryInput = makeInput(false);
  const primaryWindow = { document: {} } as unknown as PdfWindow;
  const secondaryWindow = { document: {} } as unknown as PdfWindow;
  const internal = {
    _primaryView: { _iframeWindow: primaryWindow },
    _secondaryView: { _iframeWindow: secondaryWindow },
    _state: state,
    toggleFindPopup: ({ primary, open }: { primary: boolean; open: boolean }) => {
      const field = primary ? 'primaryViewFindState' : 'secondaryViewFindState';
      state[field] = { ...state[field], popupOpen: open };
    },
  };
  const outer = {
    document: {
      querySelector: (selector: string) =>
        selector.startsWith('.primary-view') ? primaryInput : secondaryInput,
    },
    Event: class {
      readonly bubbles: boolean;
      constructor(
        readonly type: string,
        options: EventInit,
      ) {
        // Content cannot read an un-cloned chrome options object.
        this.bubbles = cloned.has(options) && !!options.bubbles;
      }
    },
  } as unknown as Window;
  const reader = { _iframeWindow: outer, _internalReader: internal } as unknown as ReaderRuntime;
  return { reader, internal, state, primaryWindow, secondaryWindow, primaryInput, secondaryInput };
}

describe('Reader selected-text Find ownership', () => {
  it('updates only the captured secondary Find query across the compartment boundary', () => {
    const fixture = findReader();
    const search = prepareReaderSelectionSearch(fixture.reader, fixture.secondaryWindow);
    expect(search?.('selected secondary text')).toBe(true);
    expect(fixture.state.secondaryViewFindState.query).toBe('selected secondary text');
    expect(fixture.state.primaryViewFindState.query).toBe('primary query');
    expect(fixture.primaryInput.value).toBe('primary query');
    expect(search?.('replayed text')).toBe(false);
    expect(fixture.state.secondaryViewFindState.query).toBe('selected secondary text');
  });

  it('preserves locally edited text while the native query is still debouncing', () => {
    const fixture = findReader();
    const search = prepareReaderSelectionSearch(fixture.reader, fixture.primaryWindow);
    fixture.primaryInput.value = 'new user query';
    expect(search?.('obsolete selection')).toBe(false);
    expect(fixture.state.primaryViewFindState.query).toBe('primary query');
    expect(fixture.primaryInput.value).toBe('new user query');
  });

  it('rejects a closed-and-reopened popup even with the same query and input node', () => {
    const fixture = findReader();
    const search = prepareReaderSelectionSearch(fixture.reader, fixture.primaryWindow);
    fixture.internal.toggleFindPopup({ primary: true, open: false });
    fixture.internal.toggleFindPopup({ primary: true, open: true });
    expect(search?.('obsolete selection')).toBe(false);
    expect(fixture.primaryInput.value).toBe('primary query');
  });

  it('keeps the newer admitted search when an older write arrives first', () => {
    const fixture = findReader();
    const old = prepareReaderSelectionSearch(fixture.reader, fixture.primaryWindow);
    const current = prepareReaderSelectionSearch(fixture.reader, fixture.primaryWindow);
    expect(old?.('old selection')).toBe(false);
    expect(current?.('current selection')).toBe(true);
    expect(fixture.state.primaryViewFindState.query).toBe('current selection');
  });

  it('rejects a replacement ReaderView that reuses the PDF window', () => {
    const fixture = findReader();
    const search = prepareReaderSelectionSearch(fixture.reader, fixture.primaryWindow);
    fixture.internal._primaryView = { _iframeWindow: fixture.primaryWindow };
    expect(search?.('old view selection')).toBe(false);
    expect(fixture.primaryInput.value).toBe('primary query');
  });
});
