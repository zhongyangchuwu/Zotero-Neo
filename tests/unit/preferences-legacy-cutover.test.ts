import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const PANE = readFileSync(
  new URL('../../assets/package/content/preferences/pane.xhtml', import.meta.url),
  'utf8',
);
const PREFERENCES_SOURCE = readFileSync(
  new URL('../../src/preferences/index.ts', import.meta.url),
  'utf8',
);

describe('legacy Preferences migration boundary', () => {
  it('keeps only the launcher after every editable setting has moved to Neo Settings', () => {
    expect(PANE).toContain('zv-open-neo-settings');
    expect(PREFERENCES_SOURCE).toContain('bindOpenNeoSettingsButton');

    for (const removed of [
      'zv-language',
      'zv-appearance-theme',
      'zv-interaction-color-preset',
      'zv-interaction-marker-width',
      'zv-interaction-status-style',
      'zv-note-editor-enabled',
      'zv-picker-mouse-enabled',
      'zv-visual-enabled',
      'zv-insert-enabled',
      'zv-scroll-mode',
      'zv-scroll-step',
      'zv-marks-persist-enabled',
      'zv-default-color',
      'zv-key-guide-enabled',
      'zv-key-guide-delay',
      'zv-key-guide-font-size',
      'zv-bindings-body',
      'zv-add-binding',
      'zv-reset-bindings',
      'zv-save',
      'bindLegacyInteraction',
      'setPreference(',
      'getPreference(',
    ]) {
      expect(PANE).not.toContain(removed);
      expect(PREFERENCES_SOURCE).not.toContain(removed);
    }
  });

  it('explains that the legacy pane is a compatibility bridge, not a second settings surface', () => {
    expect(PANE).toContain('All Zotero Neo settings are managed in the Neo Settings workspace.');
    expect(PANE).toContain('Open Neo Settings');
  });
});
