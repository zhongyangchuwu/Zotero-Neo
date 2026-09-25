import { describe, expect, it } from 'vitest';

import type { PreferenceReader } from '../../src/core/preferences';
import {
  settingsLanguage,
  settingsText,
  settingsToggleLabels,
} from '../../src/main/settings-i18n';

class Preferences implements PreferenceReader {
  constructor(private readonly values: Record<string, boolean | number | string>) {}
  has(key: string): boolean {
    return Object.hasOwn(this.values, key);
  }
  get(key: string, fallback: boolean): boolean;
  get(key: string, fallback: number): number;
  get(key: string, fallback: string): string;
  get(key: string, fallback: boolean | number | string): boolean | number | string {
    return this.values[key] ?? fallback;
  }
}

describe('Settings i18n', () => {
  it('follows explicit language first and otherwise derives Chinese from the Zotero locale', () => {
    expect(settingsLanguage(new Preferences({ language: 'en' }), 'zh-CN')).toBe('en');
    expect(settingsLanguage(new Preferences({ language: 'zh-CN' }), 'en-US')).toBe('zh-CN');
    expect(settingsLanguage(new Preferences({}), 'zh-TW')).toBe('zh-CN');
    expect(settingsLanguage(new Preferences({}), 'en-US')).toBe('en');
  });

  it('translates shared shell and control labels without changing the English source keys', () => {
    expect(settingsText('en', 'Keybindings')).toBe('Keybindings');
    expect(settingsText('zh-CN', 'Keybindings')).toBe('快捷键');
    expect(settingsText('zh-CN', 'Namespace separator')).toBe('命名空间分隔符');
    expect(settingsToggleLabels('zh-CN')).toEqual({ on: '开', off: '关' });
  });
});
