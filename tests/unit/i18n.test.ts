import { describe, expect, it } from 'vitest';

import { ACTION_IDS, ACTION_LABELS } from '../../src/input/actions';
import { LOCALE_CATALOGS, actionText, t, translateCatalog } from '../../src/i18n';

describe('shared i18n infrastructure', () => {
  it('keeps locale keys consistent and action labels backed by locale files', () => {
    const englishKeys = Object.keys(LOCALE_CATALOGS['en-US']).sort();
    const chineseKeys = Object.keys(LOCALE_CATALOGS['zh-CN']).sort();

    expect(chineseKeys).toEqual(englishKeys);
    for (const action of ACTION_IDS) {
      expect(ACTION_LABELS[action].en).toBe(actionText(action, 'en'));
      expect(ACTION_LABELS[action]['zh-CN']).toBe(actionText(action, 'zh-CN'));
    }
  });

  it('falls back to English when a selected locale omits a translation', () => {
    expect(translateCatalog({}, { 'test.key': 'English fallback' }, 'test.key')).toBe(
      'English fallback',
    );
    expect(t('action.openNeoSettings', 'en')).toBe('Neo: Settings');
    expect(t('action.openNeoSettings', 'zh-CN')).toBe('Neo 设置');
  });
});
