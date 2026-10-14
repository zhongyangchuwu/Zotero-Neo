import { describe, expect, it } from 'vitest';

import { validateRelease } from '../../tools/check-release.mjs';

interface ManifestFixture {
  readonly version: string;
  readonly homepage_url: string;
  readonly browser_specific_settings: { readonly gecko: { readonly id: string } };
  readonly applications: {
    readonly zotero: {
      readonly id: string;
      readonly strict_min_version: string;
      readonly strict_max_version: string;
    };
  };
}

interface UpdatesFixture {
  readonly addons: Record<
    string,
    {
      readonly updates: ReadonlyArray<{
        readonly version: string;
        readonly update_link: string;
        readonly applications: {
          readonly zotero: {
            readonly strict_min_version: string;
            readonly strict_max_version: string;
          };
        };
      }>;
    }
  >;
}

const version = '1.2.3';
const addonId = 'zotero-neo@example.test';
const expectedLink = `https://example.test/zotero-neo/releases/download/v${version}/zotero-neo.xpi`;

function releaseFixture(): { manifest: ManifestFixture; updates: UpdatesFixture } {
  const manifest: ManifestFixture = {
    version,
    homepage_url: 'https://example.test/zotero-neo/',
    browser_specific_settings: { gecko: { id: addonId } },
    applications: {
      zotero: {
        id: addonId,
        strict_min_version: '7.0',
        strict_max_version: '10.*',
      },
    },
  };
  const updates: UpdatesFixture = {
    addons: {
      [addonId]: {
        updates: [
          {
            version,
            update_link: expectedLink,
            applications: {
              zotero: {
                strict_min_version: '7.0',
                strict_max_version: '10.*',
              },
            },
          },
        ],
      },
    },
  };
  return { manifest, updates };
}

describe('release validator contract', () => {
  it('accepts a self-consistent release fixture', () => {
    const { manifest, updates } = releaseFixture();

    expect(validateRelease(`v${version}`, manifest, updates)).toBe(addonId);
  });

  const rejectionCases: ReadonlyArray<
    readonly [
      description: string,
      tag: string,
      mutate: (
        manifest: ManifestFixture,
        updates: UpdatesFixture,
      ) => { manifest: ManifestFixture; updates: UpdatesFixture },
    ]
  > = [
    ['a mismatched tag', 'v9.9.9', (manifest, updates) => ({ manifest, updates })],
    [
      'inconsistent extension IDs',
      `v${version}`,
      (manifest, updates) => ({
        manifest: {
          ...manifest,
          applications: {
            ...manifest.applications,
            zotero: { ...manifest.applications.zotero, id: 'other@example.test' },
          },
        },
        updates,
      }),
    ],
    [
      'a missing addon update feed',
      `v${version}`,
      (manifest) => ({ manifest, updates: { addons: {} } }),
    ],
    [
      'a missing version entry',
      `v${version}`,
      (manifest) => ({
        manifest,
        updates: { addons: { [addonId]: { updates: [] } } },
      }),
    ],
    [
      'a duplicate version entry',
      `v${version}`,
      (manifest, updates) => ({
        manifest,
        updates: {
          addons: {
            [addonId]: {
              updates: [...updates.addons[addonId]!.updates, ...updates.addons[addonId]!.updates],
            },
          },
        },
      }),
    ],
    [
      'a wrong release URL',
      `v${version}`,
      (manifest, updates) => ({
        manifest,
        updates: {
          addons: {
            [addonId]: {
              updates: [
                {
                  ...updates.addons[addonId]!.updates[0]!,
                  update_link: 'https://example.test/wrong.xpi',
                },
              ],
            },
          },
        },
      }),
    ],
    [
      'incompatible Zotero versions',
      `v${version}`,
      (manifest, updates) => ({
        manifest,
        updates: {
          addons: {
            [addonId]: {
              updates: [
                {
                  ...updates.addons[addonId]!.updates[0]!,
                  applications: {
                    zotero: {
                      ...updates.addons[addonId]!.updates[0]!.applications.zotero,
                      strict_max_version: '9.*',
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    ],
  ];

  it.each(rejectionCases)('rejects %s', (_description, tag, mutate) => {
    const { manifest, updates } = releaseFixture();
    const fixture = mutate(manifest, updates);

    expect(() => validateRelease(tag, fixture.manifest, fixture.updates)).toThrow(Error);
  });
});
