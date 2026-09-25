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
  it('removes migrated Interaction and Reader editors from the legacy pane and binder', () => {
    for (const removed of [
      'zv-note-editor-enabled',
      'zv-picker-mouse-enabled',
      'zv-picker-mouse-status',
      'zv.mode.noteEditor',
      'zv.picker.mouse.enabled',
      'zv.picker.help',
      'zv-visual-enabled',
      'zv-insert-enabled',
      'zv-scroll-mode',
      'zv-scroll-step',
      'zv-smooth-follow-speed',
      'zv-smooth-initial-speed',
      'zv-smooth-max-speed',
      'zv-smooth-accel',
      'zv-smooth-decel',
      'zv-smooth-stop-on-release',
      'zv-marks-persist-enabled',
      'zv-default-color',
      'zv.mode.visual',
      'zv.mode.insert',
      'zv.scroll.',
      'zv.marks.',
      'zv.color.',
    ]) {
      expect(PANE).not.toContain(removed);
      expect(PREFERENCES_SOURCE).not.toContain(removed);
    }
  });

  it('keeps the launcher and all not-yet-migrated legacy groups available', () => {
    for (const retained of [
      'zv-open-neo-settings',
      'zv-language',
      'zv-appearance-theme',
      'zv-interaction-color-preset',
      'zv-key-guide-enabled',
      'zv-bindings-body',
    ]) {
      expect(PANE).toContain(retained);
    }
  });
});
