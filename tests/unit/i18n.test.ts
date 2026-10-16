import { describe, expect, it } from 'vitest';

import { LOCALE_CATALOGS, translateCatalog } from '../../src/i18n';

describe('shared i18n infrastructure', () => {
  it('keeps locale keys consistent', () => {
    const englishKeys = Object.keys(LOCALE_CATALOGS['en-US']).sort();
    const chineseKeys = Object.keys(LOCALE_CATALOGS['zh-CN']).sort();

    expect(chineseKeys).toEqual(englishKeys);
  });

  it('falls back to English when a selected locale omits a translation', () => {
    expect(translateCatalog({}, { 'test.key': 'English fallback' }, 'test.key')).toBe(
      'English fallback',
    );
  });
});
