import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zipDirectory } from '../../tools/zip.mjs';

const sourceRoot = resolve(import.meta.dirname, '../..');
const commit = 'a'.repeat(40);
const tag = 'v1.2.3';
const xpiName = 'zotero-neo.xpi';
const checksumName = `${xpiName}.sha256`;

interface ReleaseMetadata {
  id: number;
  tag_name: string;
  draft: boolean;
  upload_url: string;
}

interface ReleaseState {
  head: string;
  remoteCommit: string | null;
  tagObject?: string;
  release: ReleaseMetadata | null;
  assets: Record<string, string>;
  mutations: string[];
  publicSnapshots: Record<string, string>[];
  apiFailure?: string;
  corruptUpload?: boolean;
  failUpload?: boolean;
  moveTagOnDownload?: boolean;
  precedingReleases?: ReleaseMetadata[];
  wrongTagOnRead?: boolean;
  changeBeforeRefresh?: 'replace' | 'publish';
  changeBeforeRefreshAssetCount?: number;
  changeAtUpload?: 'replace' | 'publish';
  changeAtUploadAssetCount?: number;
  externalChanges?: string[];
}

interface FixtureOptions {
  existing?: 'published' | 'draft';
  wrongMetadata?: 'version' | 'compatibility' | 'identity';
  acceptedHash?: 'missing' | 'wrong';
  manual?: boolean;
}

function withFixture(
  options: FixtureOptions,
  run: (fixture: {
    state: ReleaseState;
    expectedAssets: Record<string, string>;
    publish: () => { status: number | null; stderr: string; stdout: string; state: ReleaseState };
  }) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'neo-publish-test-'));
  try {
    const tools = join(directory, 'tools');
    const bin = join(directory, 'bin');
    const addon = join(directory, 'addon');
    for (const path of [tools, bin, addon]) mkdirSync(path);
    for (const file of ['publish-release.mjs', 'check-release.mjs', 'zip.mjs']) {
      copyFileSync(join(sourceRoot, 'tools', file), join(tools, file));
    }
    const boundary = readFileSync(join(sourceRoot, 'tests/fixtures/release-cli.mjs'), 'utf8');
    for (const program of ['git', 'gh']) {
      const path = join(bin, program);
      writeFileSync(path, `#!${process.execPath}\n${boundary}`);
      chmodSync(path, 0o755);
    }
    const manifest = {
      version: '1.2.3',
      homepage_url: 'https://github.com/example/neo',
      browser_specific_settings: { gecko: { id: 'neo@example.test' } },
      applications: {
        zotero: {
          id: 'neo@example.test',
          strict_min_version: '10.0',
          strict_max_version: '10.0.*',
        },
      },
    };
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
    const packaged = structuredClone(manifest);
    if (options.wrongMetadata === 'version') packaged.version = '9.9.9';
    if (options.wrongMetadata === 'compatibility')
      packaged.applications.zotero.strict_max_version = '10.*';
    if (options.wrongMetadata === 'identity')
      packaged.applications.zotero.id = 'other@example.test';
    writeFileSync(join(addon, 'manifest.json'), JSON.stringify(packaged));
    writeFileSync(join(addon, 'bootstrap.js'), 'function startup() {}');
    const xpi = join(directory, xpiName);
    zipDirectory(addon, xpi);
    const bytes = readFileSync(xpi);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const acceptedHash =
      options.acceptedHash === 'missing'
        ? undefined
        : `sha256:${options.acceptedHash === 'wrong' ? '0'.repeat(64) : digest}`;
    writeFileSync(
      join(directory, 'updates.candidate.json'),
      JSON.stringify({
        addons: {
          'neo@example.test': {
            updates: [
              {
                version: manifest.version,
                update_link: `https://github.com/example/neo/releases/download/${tag}/${xpiName}`,
                update_hash: acceptedHash,
                applications: {
                  zotero: {
                    strict_min_version: '10.0',
                    strict_max_version: '10.0.*',
                  },
                },
              },
            ],
          },
        },
      }),
    );
    writeFileSync(
      join(directory, 'updates.json'),
      JSON.stringify({
        addons: {
          'neo@example.test': {
            updates: [
              {
                version: '1.2.2',
                update_link:
                  'https://github.com/example/neo/releases/download/v1.2.2/zotero-neo.xpi',
                applications: { zotero: manifest.applications.zotero },
              },
            ],
          },
        },
      }),
    );
    const expectedAssets = {
      [xpiName]: bytes.toString('base64'),
      [checksumName]: Buffer.from(`${digest}  ${xpiName}\n`).toString('base64'),
    };
    const state: ReleaseState = {
      head: commit,
      remoteCommit: options.manual ? null : commit,
      release: options.existing
        ? {
            id: 42,
            tag_name: tag,
            draft: options.existing === 'draft',
            upload_url:
              'https://uploads.github.com/repos/example/neo/releases/42/assets{?name,label}',
          }
        : null,
      assets: options.existing ? { ...expectedAssets } : {},
      mutations: [],
      publicSnapshots: [],
    };
    const statePath = join(directory, 'network-state.json');
    const publish = () => {
      writeFileSync(statePath, JSON.stringify(state));
      const result = spawnSync(
        process.execPath,
        [join(tools, 'publish-release.mjs'), tag, commit, xpi],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH || ''}`,
            GH_TOKEN: 'fixture-only-no-network',
            GITHUB_REPOSITORY: 'example/neo',
            GITHUB_EVENT_NAME: options.manual ? 'workflow_dispatch' : 'push',
            GITHUB_REF: options.manual ? 'refs/heads/main' : `refs/tags/${tag}`,
            RELEASE_FIXTURE_STATE: statePath,
          },
        },
      );
      if (result.error) throw result.error;
      const updated = JSON.parse(readFileSync(statePath, 'utf8')) as ReleaseState;
      Object.assign(state, updated);
      return {
        status: result.status,
        stderr: result.stderr,
        stdout: result.stdout,
        state: updated,
      };
    };
    run({ state, expectedAssets, publish });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// The publishing job is Ubuntu-only; its real unzip validation and POSIX CLI
// boundary fixtures deliberately run in that same environment, never on GitHub.
describe.skipIf(process.platform === 'win32')('immutable release publishing CLI', () => {
  it('keeps a new release private until both admitted assets have been downloaded and verified', () => {
    withFixture({}, ({ expectedAssets, publish }) => {
      const result = publish();
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.release?.draft).toBe(false);
      expect(result.state.assets).toEqual(expectedAssets);
      expect(result.state.publicSnapshots).toEqual([expectedAssets]);
      expect(result.state.mutations.filter((event) => event === 'publish')).toHaveLength(1);
    });
  });

  it('makes an identical published rerun a read-only no-op, including annotated tags', () => {
    withFixture({ existing: 'published' }, ({ state, publish }) => {
      state.tagObject = 'b'.repeat(40);
      const before = structuredClone(state);
      const result = publish();
      expect(result.status, result.stderr).toBe(0);
      expect(result.state).toEqual(before);
    });
  });

  it.each([
    'different XPI',
    'wrong checksum',
    'missing checksum',
    'extra asset',
    'wrong release tag',
  ])('refuses %s without mutating an existing public release', (conflict) => {
    withFixture({ existing: 'published' }, ({ state, publish }) => {
      if (conflict === 'different XPI')
        state.assets[xpiName] = Buffer.from('different bytes').toString('base64');
      if (conflict === 'wrong checksum')
        state.assets[checksumName] = Buffer.from('wrong digest').toString('base64');
      if (conflict === 'missing checksum') delete state.assets[checksumName];
      if (conflict === 'extra asset') state.assets['unaccepted.xpi'] = 'YQ==';
      if (conflict === 'wrong release tag') state.wrongTagOnRead = true;
      const before = structuredClone(state);
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state).toEqual(before);
    });
  });

  it.each(['source', 'tag'])('rejects a %s commit mismatch before any mutation', (mismatch) => {
    withFixture({}, ({ state, publish }) => {
      if (mismatch === 'source') state.head = 'c'.repeat(40);
      else state.remoteCommit = 'd'.repeat(40);
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state.mutations).toEqual([]);
      expect(result.state.release).toBeNull();
    });
  });

  it.each(['version', 'compatibility', 'identity'] as const)(
    'rejects wrong packaged %s before creating a manual tag or release',
    (wrongMetadata) => {
      withFixture({ wrongMetadata, manual: true }, ({ publish }) => {
        const result = publish();
        expect(result.status).not.toBe(0);
        expect(result.state.mutations).toEqual([]);
        expect(result.state.remoteCommit).toBeNull();
      });
    },
  );

  it.each(['missing', 'wrong'] as const)(
    'rejects a %s prepared update hash before mutation',
    (acceptedHash) => {
      withFixture({ acceptedHash, manual: true }, ({ publish }) => {
        const result = publish();
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('update_hash');
        expect(result.state.mutations).toEqual([]);
      });
    },
  );

  it('creates a missing tag only for an admitted manual main publication', () => {
    withFixture({ manual: true }, ({ expectedAssets, publish }) => {
      const result = publish();
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.remoteCommit).toBe(commit);
      expect(result.state.publicSnapshots).toEqual([expectedAssets]);
    });
    withFixture({}, ({ state, publish }) => {
      state.remoteCommit = null;
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state.mutations).toEqual([]);
    });
  });

  it('does not mistake an API authorization or network error for an absent release', () => {
    for (const apiFailure of ['gh: Unauthorized (HTTP 401)', 'connection reset']) {
      withFixture({ manual: true }, ({ state, publish }) => {
        state.apiFailure = apiFailure;
        const result = publish();
        expect(result.status).not.toBe(0);
        expect(result.state.mutations).toEqual([]);
      });
    }
  });

  it.each(['corruptUpload', 'failUpload'] as const)(
    'leaves a failed %s unpublished, without silent repair',
    (failure) => {
      withFixture({}, ({ state, publish }) => {
        state[failure] = true;
        const first = publish();
        expect(first.status).not.toBe(0);
        expect(first.state.release?.draft).toBe(true);
        expect(first.state.publicSnapshots).toEqual([]);
        const before = structuredClone(state);
        const rerun = publish();
        expect(rerun.status).not.toBe(0);
        expect(rerun.state).toEqual(before);
      });
    },
  );

  it('publishes an existing complete matching draft only after verification', () => {
    withFixture({ existing: 'draft' }, ({ expectedAssets, publish }) => {
      const result = publish();
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.mutations).toEqual(['publish']);
      expect(result.state.publicSnapshots).toEqual([expectedAssets]);
    });
  });

  it('refuses publication if the source tag moves during asset verification', () => {
    withFixture({ existing: 'draft' }, ({ state, publish }) => {
      state.moveTagOnDownload = true;
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state.release?.draft).toBe(true);
      expect(result.state.mutations).toEqual([]);
      expect(result.state.publicSnapshots).toEqual([]);
    });
  });
  it('discovers a matching draft beyond the first release page', () => {
    withFixture({ existing: 'draft' }, ({ state, expectedAssets, publish }) => {
      state.precedingReleases = [
        {
          id: 7,
          tag_name: 'v0.1.0',
          draft: false,
          upload_url: 'https://uploads.github.com/repos/example/neo/releases/7/assets{?name,label}',
        },
      ];
      const result = publish();
      expect(result.status, result.stderr).toBe(0);
      expect(result.state.mutations).toEqual(['publish']);
      expect(result.state.publicSnapshots).toEqual([expectedAssets]);
    });
  });

  it('refuses an ambiguous exact release tag across pages', () => {
    withFixture({ existing: 'draft' }, ({ state, publish }) => {
      state.precedingReleases = [{ ...state.release!, id: 99 }];
      const before = structuredClone(state);
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('ambiguous');
      expect(result.state).toEqual(before);
    });
  });

  it.each(['replace', 'publish'] as const)(
    'refuses upload if an external writer changes the admitted draft (%s) before its refresh',
    (changeBeforeRefresh) => {
      withFixture({}, ({ state, publish }) => {
        state.changeBeforeRefresh = changeBeforeRefresh;
        const result = publish();
        expect(result.status).not.toBe(0);
        expect(result.state.mutations).toEqual(['create-draft']);
        expect(result.state.assets).toEqual({});
        expect(result.state.externalChanges).toEqual([changeBeforeRefresh]);
      });
    },
  );

  it('does not attach an asset to a replacement release created at the upload boundary', () => {
    withFixture({}, ({ state, publish }) => {
      state.changeAtUpload = 'replace';
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state.release?.id).toBe(99);
      expect(result.state.assets).toEqual({});
      expect(result.state.mutations).toEqual(['create-draft']);
    });
  });

  it.each(['replace', 'publish'] as const)(
    'refreshes admitted identity before the second upload when an external writer intervenes (%s)',
    (changeBeforeRefresh) => {
      withFixture({}, ({ state, publish }) => {
        state.changeBeforeRefresh = changeBeforeRefresh;
        state.changeBeforeRefreshAssetCount = 1;
        const result = publish();
        expect(result.status).not.toBe(0);
        expect(result.state.mutations).toEqual(['create-draft', `upload:${xpiName}`]);
        expect(result.state.assets[checksumName]).toBeUndefined();
      });
    },
  );

  it('stops further mutation if an external publication races the first accepted upload', () => {
    withFixture({}, ({ state, expectedAssets, publish }) => {
      state.changeAtUpload = 'publish';
      const result = publish();
      expect(result.status).not.toBe(0);
      expect(result.state.release?.draft).toBe(false);
      expect(result.state.mutations).toEqual(['create-draft', `upload:${xpiName}`]);
      expect(result.state.assets).toEqual({ [xpiName]: expectedAssets[xpiName] });
      // This is a real server limitation, not an atomic draft-only guard:
      // an outside writer published between the read and this first POST.
      expect(result.state.publicSnapshots).toEqual([{}, { [xpiName]: expectedAssets[xpiName] }]);
    });
  });
});
