import { describe, expect, it } from 'vitest';

import { isMainExecutableAction } from '../../src/main/action-capabilities';
import { isReaderActionForMode } from '../../src/reader/action-capabilities';
import { actionsForBindingMode } from '../../src/input/binding-capabilities';

describe('action capability ownership', () => {
  it('rejects Reader-only and unknown commands in Main', () => {
    expect(isMainExecutableAction('zoomIn')).toBe(false);
    expect(isMainExecutableAction('not-an-action')).toBe(false);
  });

  it('guards commands by Reader mode and rejects unsafe catalog drift', () => {
    expect(isReaderActionForMode('normal', 'openCommandPalette')).toBe(true);
    expect(isReaderActionForMode('normal', 'switchTab')).toBe(true);
    expect(isReaderActionForMode('normal', 'addTag')).toBe(true);
    expect(isReaderActionForMode('normal', 'removeTag')).toBe(true);
    expect(isReaderActionForMode('normal', 'addToCollection')).toBe(true);
    expect(isReaderActionForMode('normal', 'removeFromCollection')).toBe(true);
    expect(isReaderActionForMode('normal', 'managePlugins')).toBe(true);
    expect(isReaderActionForMode('normal', 'openNeoSettings')).toBe(true);
    expect(isReaderActionForMode('normal', 'navigateBack')).toBe(true);
    expect(isReaderActionForMode('normal', 'navigateForward')).toBe(true);
    expect(isReaderActionForMode('normal', 'showInLibrary')).toBe(true);
    expect(isReaderActionForMode('normal', 'mainAddByIdentifier')).toBe(true);
    expect(isReaderActionForMode('visual', 'mainAddByIdentifier')).toBe(false);
    expect(actionsForBindingMode('note-normal')).not.toContain('mainAddByIdentifier');
    expect(actionsForBindingMode('main-select')).not.toContain('mainAddByIdentifier');
    expect(actionsForBindingMode('main-normal')).not.toContain('showInLibrary');
    expect(isReaderActionForMode('normal', 'toggleTagFilter')).toBe(false);
    expect(isReaderActionForMode('normal', 'mainTrashItems')).toBe(false);
    expect(isReaderActionForMode('visual', 'highlightYellow')).toBe(true);
    expect(isReaderActionForMode('visual', 'flashText')).toBe(true);
    expect(isReaderActionForMode('visual', 'openSelectionActions')).toBe(true);
    expect(isReaderActionForMode('visual', 'underlineSelection')).toBe(true);
    expect(isReaderActionForMode('visual', 'zoomIn')).toBe(false);
    expect(isReaderActionForMode('normal', 'flashText')).toBe(false);
    expect(isReaderActionForMode('normal', 'not-an-action')).toBe(false);
  });
});
