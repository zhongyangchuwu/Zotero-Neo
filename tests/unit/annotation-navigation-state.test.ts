import { describe, expect, it } from 'vitest';

import { ReaderAnnotationNavigationState } from '../../src/reader/annotation-navigation-state';
import { COLORS, type ReaderRuntime } from '../../src/reader/types';

describe('ReaderAnnotationNavigationState', () => {
  it('prefers Zotero selected annotation state over the Neo fallback key', () => {
    const state = new ReaderAnnotationNavigationState();
    state.rememberAnnotation('neo-fallback');
    const reader = {
      _internalReader: {
        _state: { selectedAnnotationIDs: ['host-selected'] },
      },
    } as ReaderRuntime;

    expect(state.selectedAnnotationKey(reader)).toBe('host-selected');
  });

  it('uses the Neo key only as a fallback when Zotero exposes no selected annotation', () => {
    const state = new ReaderAnnotationNavigationState();
    const reader = {
      _internalReader: { _state: { selectedAnnotationIDs: [] } },
    } as unknown as ReaderRuntime;

    state.rememberAnnotation('neo-fallback');
    expect(state.selectedAnnotationKey(reader)).toBe('neo-fallback');

    state.clearAnnotation();
    expect(state.selectedAnnotationKey(reader)).toBeNull();
  });

  it('keeps filter color as a local compatibility cache for the write-only host seam', () => {
    const state = new ReaderAnnotationNavigationState();

    expect(state.filterColor()).toBeNull();
    state.setFilterColor(COLORS.red);
    expect(state.filterColor()).toBe(COLORS.red);
    state.setFilterColor(null);
    expect(state.filterColor()).toBeNull();
  });
});
