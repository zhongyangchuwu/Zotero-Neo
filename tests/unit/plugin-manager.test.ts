import { describe, expect, it } from 'vitest';

import { filterInstalledPlugins } from '../../src/main/plugin-manager';
import type { InstalledPlugin } from '../../src/main/plugin-host';

const plugins: readonly InstalledPlugin[] = [
  {
    id: 'better-bibtex@iris-advies.com',
    name: 'Better BibTeX for Zotero',
    version: '9.1.2',
    enabled: true,
  },
  {
    id: 'zotero-actions-tags@windingwind.com',
    name: 'Actions & Tags for Zotero',
    version: '2.1.0',
    enabled: false,
  },
  {
    id: 'translate-for-zotero@example.org',
    name: 'Translate for Zotero',
    version: '3.0.0',
    enabled: true,
  },
];

describe('plugin manager filtering', () => {
  it('preserves the native plugin order when the filter is empty', () => {
    expect(filterInstalledPlugins(plugins, '')).toEqual(plugins);
  });

  it('fuzzy-matches plugin name, id, and version', () => {
    expect(filterInstalledPlugins(plugins, 'better bib').map((plugin) => plugin.id)).toEqual([
      'better-bibtex@iris-advies.com',
    ]);
    expect(filterInstalledPlugins(plugins, 'windingwind').map((plugin) => plugin.id)).toEqual([
      'zotero-actions-tags@windingwind.com',
    ]);
    expect(filterInstalledPlugins(plugins, '3.0.0').map((plugin) => plugin.id)).toEqual([
      'translate-for-zotero@example.org',
    ]);
  });

  it('rejects plugins whose searchable fields do not match', () => {
    expect(filterInstalledPlugins(plugins, 'nonexistent plugin')).toEqual([]);
  });
});
