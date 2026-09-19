import { beforeEach, describe, expect, it, vi } from 'vitest';

const { installedPlugins } = vi.hoisted(() => ({
  installedPlugins: vi.fn(),
}));

vi.mock('../../src/main/plugin-host', () => ({
  installedPlugins,
}));

import { createPluginsProvider } from '../../src/main/picker/providers/plugins';

describe('plugin picker provider', () => {
  beforeEach(() => installedPlugins.mockReset());

  it('projects installed plugins into searchable target candidates', async () => {
    installedPlugins.mockResolvedValue([
      {
        id: 'better-bibtex@iris-advies.com',
        name: 'Better BibTeX for Zotero',
        version: '9.1.2',
        enabled: true,
      },
      {
        id: 'example@example.test',
        name: 'Example Plugin',
        version: '1.0.0',
        enabled: false,
      },
    ]);

    const provider = createPluginsProvider();
    const items = await provider.load();

    expect(items).toEqual([
      expect.objectContaining({
        id: 'better-bibtex@iris-advies.com',
        title: 'Better BibTeX for Zotero',
        meta: 'Enabled',
        search: expect.stringContaining('better-bibtex@iris-advies.com'),
      }),
      expect.objectContaining({
        id: 'example@example.test',
        title: 'Example Plugin',
        meta: 'Disabled',
        search: expect.stringContaining('example plugin'),
      }),
    ]);
    expect(items[0]?.preview).toContain('Version: 9.1.2');
    expect(items[1]?.preview).toContain('Status: Disabled');
  });
});
