import { describe, expect, it } from 'vitest';
import { inspectShortcut } from '../../src/input/binding-editor';

describe('single shortcut validation', () => {
  it('identifies the exact owner after canonicalizing an expression', () => {
    const bindings = { 'reader-normal:<Enter>': 'editAnnotation' } as const;
    const target = { context: 'reader-normal', action: 'scrollDown', previous: 'j' } as const;
    expect(inspectShortcut(bindings, target, '<CR>')).toMatchObject({
      sequence: '<Enter>',
      exact: 'editAnnotation',
      prefixes: [],
    });
  });

  it('names prefix conflicts in either direction, excluding the replaced key and other contexts', () => {
    const bindings = {
      'reader-normal:g': 'scrollTop',
      'reader-normal:gaa': 'firstPage',
      'reader-normal:gab': 'lastPage',
      'main-normal:ga': 'mainNavUp',
      'reader-normal:<F1>': 'nextPage',
    } as const;
    expect(
      inspectShortcut(
        bindings,
        { context: 'reader-normal', action: 'lastPage', previous: 'gab' },
        'ga',
      ),
    ).toEqual({
      sequence: 'ga',
      exact: undefined,
      prefixes: [
        { sequence: 'g', action: 'scrollTop' },
        { sequence: 'gaa', action: 'firstPage' },
      ],
    });
  });

  it('distinguishes named keys, unfinished expressions and native reservations', () => {
    const reader = { context: 'reader-normal', action: 'scrollDown', previous: null } as const;
    const outline = { context: 'reader-outline', action: 'uiConfirm', previous: null } as const;
    expect(inspectShortcut({}, reader, '<')).toEqual({ problem: 'malformed' });
    expect(inspectShortcut({ 'reader-normal:e': 'scrollUp' }, reader, '<Enter>')).toMatchObject({
      sequence: '<Enter>',
      prefixes: [],
    });
    expect(inspectShortcut({}, outline, '<F1><Enter>')).toEqual({ problem: 'native' });
  });
});
