import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zipDirectory } from '../../tools/zip.mjs';

const sourceRoot = resolve(import.meta.dirname, '../..');
const tag = 'v1.2.3';
const addonId = 'neo@example.test';
const xpiName = 'zotero-neo.xpi';
const checksumName = `${xpiName}.sha256`;
const homepage = 'https://github.com/example/neo';
const updateUrl = 'https://raw.githubusercontent.com/example/neo/main/updates.json';

interface Manifest {
  version: string;
  homepage_url: string;
  browser_specific_settings: { gecko: { id: string; update_url: string } };
  applications: {
    zotero: {
      id: string;
      update_url: string;
      strict_min_version: string;
      strict_max_version: string;
    };
  };
}

function sourceManifest(): Manifest {
  return {
    version: '1.2.3',
    homepage_url: homepage,
    browser_specific_settings: { gecko: { id: addonId, update_url: updateUrl } },
    applications: {
      zotero: {
        id: addonId,
        update_url: updateUrl,
        strict_min_version: '10.0',
        strict_max_version: '10.0.*',
      },
    },
  };
}

interface Entry {
  version: string;
  update_link: string;
  update_hash?: string;
  applications: { zotero: { strict_min_version: string; strict_max_version: string } };
}
interface Feed {
  addons: Record<string, { updates: Entry[] }>;
}
interface State {
  release: {
    id: number;
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    published_at: string;
    html_url: string;
  } | null;
  assets: Record<string, string>;
  mutations: string[];
  publicSnapshots: Record<string, string>[];
  recordCalls: boolean;
  calls: string[][];
  publicFeed: string;
  remotePath: string;
  publicAssets?: Record<string, string>;
  assetMetadata?: Record<string, Record<string, string | number>>;
  publicUnavailable?: boolean;
  changedPublicFeed?: string;
  replaceReleaseOnDownload?: boolean;
  replaceAssetsOnDownload?: boolean;
  replaceRealTagOnDownload?: string;
  precedingReleases?: NonNullable<State['release']>[];
}
interface Options {
  packageChange?: (manifest: Manifest) => void;
  sourceChange?: (manifest: Manifest) => void;
  candidateChange?: (candidate: Feed) => void;
}

const encodedJson = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
const historicalEntry = (version: string): Entry => ({
  version,
  update_link: `${homepage}/releases/download/v${version}/${xpiName}`,
  applications: { zotero: { strict_min_version: '10.0', strict_max_version: '10.*' } },
});
const feed = (entries: Entry[]): Feed => ({ addons: { [addonId]: { updates: entries } } });

function withFixture(
  options: Options,
  run: (fixture: {
    directory: string;
    state: State;
    commit: string;
    candidate: Feed;
    official: Feed;
    git: (...args: string[]) => string;
    cli: (
      tool: 'prepare' | 'promote',
      args?: string[],
    ) => {
      status: number | null;
      stdout: string;
      stderr: string;
    };
  }) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'neo-release-cli-test-'));
  try {
    const tools = join(directory, 'tools');
    const bin = join(directory, 'bin');
    const addon = join(directory, 'addon');
    const remote = join(directory, 'remote.git');
    for (const path of [tools, bin, addon]) mkdirSync(path);
    for (const name of [
      'prepare-release.mjs',
      'promote-release.mjs',
      'release-metadata.mjs',
      'check-release.mjs',
      'zip.mjs',
    ])
      copyFileSync(join(sourceRoot, 'tools', name), join(tools, name));
    const boundary = readFileSync(join(sourceRoot, 'tests/fixtures/release-cli.mjs'), 'utf8');
    for (const program of ['gh', 'curl']) {
      const path = join(bin, program);
      writeFileSync(path, `#!${process.execPath}\n${boundary}`);
      chmodSync(path, 0o755);
    }
    // Git itself is real, including annotated tags, fetch, and git-show source.
    const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
    const git = (...args: string[]) => {
      const result = spawnSync(gitPath, args, {
        cwd: directory,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: 'Release fixture',
          GIT_AUTHOR_EMAIL: 'release@example.test',
          GIT_COMMITTER_NAME: 'Release fixture',
          GIT_COMMITTER_EMAIL: 'release@example.test',
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    git('init', '--bare', remote);
    git('init');
    git('config', `url.${remote}.insteadOf`, 'https://github.com/example/neo.git');
    git('remote', 'add', 'origin', remote);
    const manifest = sourceManifest();
    options.sourceChange?.(manifest);
    const packaged = structuredClone(manifest);
    options.packageChange?.(packaged);
    writeFileSync(join(addon, 'manifest.json'), JSON.stringify(packaged));
    writeFileSync(join(addon, 'bootstrap.js'), 'function startup() {}');
    const xpi = join(directory, xpiName);
    zipDirectory(addon, xpi);
    const bytes = readFileSync(xpi);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const current: Entry = {
      version: '1.2.3',
      update_link: `${homepage}/releases/download/${tag}/${xpiName}`,
      update_hash: `sha256:${digest}`,
      applications: { zotero: { strict_min_version: '10.0', strict_max_version: '10.0.*' } },
    };
    const official = feed([historicalEntry('0.1.0')]);
    const candidate = feed([
      current,
      historicalEntry('0.2.0'),
      ...official.addons[addonId].updates,
    ]);
    options.candidateChange?.(candidate);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(directory, 'updates.candidate.json'), JSON.stringify(candidate));
    writeFileSync(join(directory, 'updates.json'), JSON.stringify(official));
    git('add', 'manifest.json', 'updates.candidate.json', 'updates.json');
    git('commit', '-m', 'release source');
    const commit = git('rev-parse', 'HEAD');
    git('tag', '-a', tag, '-m', 'annotated release');
    git('push', 'origin', `refs/tags/${tag}`);
    const state: State = {
      release: {
        id: 42,
        tag_name: tag,
        draft: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00Z',
        html_url: `${homepage}/releases/tag/${tag}`,
      },
      assets: {
        [xpiName]: bytes.toString('base64'),
        [checksumName]: Buffer.from(`${digest}  ${xpiName}\n`).toString('base64'),
      },
      mutations: [],
      publicSnapshots: [],
      recordCalls: true,
      calls: [],
      publicFeed: encodedJson(official),
      remotePath: remote,
    };
    const statePath = join(directory, 'network-state.json');
    const cli = (tool: 'prepare' | 'promote', args?: string[]) => {
      writeFileSync(statePath, JSON.stringify(state));
      const result = spawnSync(
        process.execPath,
        [
          join(tools, `${tool}-release.mjs`),
          ...(args || (tool === 'prepare' ? [tag, xpi] : [tag, commit, '--output', '-'])),
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 30_000,
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_TERMINAL_PROMPT: '0',
            GH_TOKEN: 'fixture-only-no-network',
            GITHUB_REPOSITORY: 'example/neo',
            RELEASE_FIXTURE_STATE: statePath,
            RELEASE_FIXTURE_REAL_GIT: gitPath,
          },
        },
      );
      if (result.error) throw result.error;
      Object.assign(state, JSON.parse(readFileSync(statePath, 'utf8')) as State);
      expect(state.mutations).toEqual([]);
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    };
    run({ directory, state, commit, candidate, official, git, cli });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// POSIX external CLI fixtures and real unzip match the Ubuntu publication job.
describe.skipIf(process.platform === 'win32')('candidate preparation CLI', () => {
  it('emits deterministic JSON from official history, never an unpublished candidate', () => {
    withFixture({}, ({ cli, official, candidate, state, directory }) => {
      const before = readFileSync(join(directory, 'updates.candidate.json'), 'utf8');
      const result = cli('prepare');
      expect(result.status, result.stderr).toBe(0);
      const prepared = JSON.parse(result.stdout) as Feed;
      expect(prepared.addons[addonId].updates).toEqual([
        candidate.addons[addonId].updates[0],
        ...official.addons[addonId].updates,
      ]);
      expect(prepared.addons[addonId].updates.at(-1)).not.toHaveProperty('update_hash');
      expect(cli('prepare').stdout).toBe(result.stdout);
      expect(state.calls).toEqual([]);
      expect(readFileSync(join(directory, 'updates.candidate.json'), 'utf8')).toBe(before);
      expect(JSON.parse(readFileSync(join(directory, 'updates.json'), 'utf8'))).toEqual(official);
    });
  });

  it('writes candidate only with an explicit output path', () => {
    withFixture({}, ({ cli, directory }) => {
      const result = cli('prepare', [tag, xpiName, '--output', 'updates.candidate.json']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('');
      expect(
        JSON.parse(readFileSync(join(directory, 'updates.candidate.json'), 'utf8')).addons[
          addonId
        ].updates.map((entry: Entry) => entry.version),
      ).toEqual(['1.2.3', '0.1.0']);
    });
  });

  it('preserves an already published same-byte entry without duplication or changes', () => {
    withFixture({}, ({ cli, directory, candidate, official, state }) => {
      const published = feed([
        candidate.addons[addonId].updates[0],
        ...official.addons[addonId].updates,
      ]);
      const before = JSON.stringify(published);
      writeFileSync(join(directory, 'updates.json'), before);
      const result = cli('prepare');
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(published);
      expect(cli('prepare').stdout).toBe(result.stdout);
      expect(readFileSync(join(directory, 'updates.json'), 'utf8')).toBe(before);
      expect(state.calls).toEqual([]);
    });
  });

  it.each(['downgrade', 'same version conflict'] as const)(
    'rejects preparation of %s without changing either feed',
    (reason) => {
      withFixture({}, ({ cli, directory, candidate, state }) => {
        const existing =
          reason === 'downgrade'
            ? historicalEntry('2.0.0')
            : { ...candidate.addons[addonId].updates[0], update_hash: `sha256:${'0'.repeat(64)}` };
        const officialBefore = JSON.stringify(feed([existing]));
        const candidateBefore = readFileSync(join(directory, 'updates.candidate.json'), 'utf8');
        writeFileSync(join(directory, 'updates.json'), officialBefore);
        const result = cli('prepare', [tag, xpiName, '--output', 'updates.candidate.json']);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          reason === 'downgrade' ? 'refusing feed downgrade' : 'same version conflicts',
        );
        expect(result.stdout).toBe('');
        expect(readFileSync(join(directory, 'updates.json'), 'utf8')).toBe(officialBefore);
        expect(readFileSync(join(directory, 'updates.candidate.json'), 'utf8')).toBe(
          candidateBefore,
        );
        expect(state.calls).toEqual([]);
      });
    },
  );

  it.each([
    [
      'version',
      (manifest: Manifest) => {
        manifest.version = '1.2.4';
      },
    ],
    [
      'ID',
      (manifest: Manifest) => {
        manifest.applications.zotero.id = 'other@example.test';
      },
    ],
    [
      'update URL',
      (manifest: Manifest) => {
        manifest.applications.zotero.update_url += '?other';
      },
    ],
    [
      'compatibility',
      (manifest: Manifest) => {
        manifest.applications.zotero.strict_max_version = '10.*';
      },
    ],
  ] as const)('rejects packaged %s mismatch without changing feeds', (_name, packageChange) => {
    withFixture({ packageChange }, ({ cli, directory, state }) => {
      const before = readFileSync(join(directory, 'updates.candidate.json'), 'utf8');
      const result = cli('prepare');
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/manifest|compatibility/);
      expect(result.stdout).toBe('');
      expect(state.calls).toEqual([]);
      expect(readFileSync(join(directory, 'updates.candidate.json'), 'utf8')).toBe(before);
    });
  });
});

describe.skipIf(process.platform === 'win32')('public release promotion CLI', () => {
  it('uses tagged source and live feed history, preserves legacy hashless entries and is idempotent', () => {
    withFixture({}, ({ cli, directory, state, candidate, official }) => {
      const liveHistory = [historicalEntry('1.2.2'), ...official.addons[addonId].updates];
      state.publicFeed = encodedJson(feed(liveHistory));
      // A later dirty checkout is not the release source of truth.
      writeFileSync(join(directory, 'manifest.json'), '{}');
      writeFileSync(join(directory, 'updates.candidate.json'), '{}');
      const result = cli('promote');
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        feed([candidate.addons[addonId].updates[0], ...liveHistory]),
      );
      state.publicFeed = Buffer.from(result.stdout).toString('base64');
      const again = cli('promote');
      expect(again.status, again.stderr).toBe(0);
      expect(again.stdout).toBe(result.stdout);
      expect(JSON.parse(readFileSync(join(directory, 'updates.json'), 'utf8'))).toEqual(official);
      expect(
        state.calls.every(
          (call) =>
            call[0] !== 'gh' ||
            (call[1] === 'api' && !call.includes('--method') && !call.includes('--input')),
        ),
      ).toBe(true);
    });
  }, 30_000);

  it('writes a review file only, and refuses either canonical feed as output', () => {
    withFixture({}, ({ cli, commit, directory, official }) => {
      const result = cli('promote', [tag, commit, '--output', 'next-feed.json']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('');
      expect(
        JSON.parse(readFileSync(join(directory, 'next-feed.json'), 'utf8')).addons[addonId].updates,
      ).toHaveLength(2);
      symlinkSync(join(directory, 'updates.json'), join(directory, 'feed-alias.json'));
      for (const output of ['updates.json', 'updates.candidate.json', 'feed-alias.json']) {
        const before = readFileSync(join(directory, output), 'utf8');
        const rejected = cli('promote', [tag, commit, '--output', output]);
        expect(rejected.status).toBe(1);
        expect(rejected.stderr).toContain('must not overwrite');
        expect(readFileSync(join(directory, output), 'utf8')).toBe(before);
      }
      expect(JSON.parse(readFileSync(join(directory, 'updates.json'), 'utf8'))).toEqual(official);
    });
  }, 30_000);

  it.each([
    [
      'draft',
      (state: State) => {
        state.release!.draft = true;
      },
      /Not Found/,
    ],
    [
      'prerelease',
      (state: State) => {
        state.release!.prerelease = true;
      },
      /non-prerelease/,
    ],
    [
      'missing release',
      (state: State) => {
        state.release = null;
      },
      /missing or ambiguous/,
    ],
    [
      'ambiguous release',
      (state: State) => {
        state.precedingReleases = [{ ...state.release!, id: 99 }];
      },
      /missing or ambiguous/,
    ],
    [
      'checksum corruption',
      (state: State) => {
        state.assets[checksumName] = Buffer.from(`${'0'.repeat(64)}  ${xpiName}\n`).toString(
          'base64',
        );
      },
      /checksum/,
    ],
    [
      'public bytes mismatch',
      (state: State) => {
        state.publicAssets = { [xpiName]: Buffer.from('corrupt').toString('base64') };
      },
      /public asset bytes/,
    ],
    [
      'unreachable public URL',
      (state: State) => {
        state.publicUnavailable = true;
      },
      /public URL unavailable/,
    ],
    [
      'asset URL identity',
      (state: State) => {
        state.assetMetadata = {
          [xpiName]: { browser_download_url: 'https://example.test/wrong.xpi' },
        };
      },
      /consistent identities/,
    ],
    [
      'asset identity collision',
      (state: State) => {
        state.assetMetadata = { [checksumName]: { id: 100 } };
      },
      /consistent identities/,
    ],
    [
      'downgrade',
      (state: State) => {
        state.publicFeed = encodedJson(feed([historicalEntry('2.0.0')]));
      },
      /downgrade/,
    ],
    [
      'same version conflict',
      (state: State) => {
        state.publicFeed = encodedJson(feed([historicalEntry('1.2.3')]));
      },
      /same version conflicts/,
    ],
    [
      'unknown official ID',
      (state: State) => {
        state.publicFeed = encodedJson({ addons: { other: { updates: [] } } });
      },
      /identity/,
    ],
    [
      'inconsistent history URL',
      (state: State) => {
        const entry = historicalEntry('0.1.0');
        entry.update_link = 'https://example.test/wrong.xpi';
        state.publicFeed = encodedJson(feed([entry]));
      },
      /feed history/,
    ],
    [
      'release replacement race',
      (state: State) => {
        state.replaceReleaseOnDownload = true;
      },
      /changed during verification/,
    ],
    [
      'asset replacement race',
      (state: State) => {
        state.replaceAssetsOnDownload = true;
      },
      /Not Found/,
    ],
    [
      'official feed advancement race',
      (state: State) => {
        state.changedPublicFeed = encodedJson(feed([historicalEntry('1.2.2')]));
      },
      /changed during verification/,
    ],
  ] as const)(
    'rejects %s with no JSON, file or remote write',
    (_name, change, message) => {
      withFixture({}, ({ state, cli, directory, commit }) => {
        change(state);
        const result = cli('promote', [tag, commit, '--output', 'rejected.json']);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(message);
        expect(result.stdout).toBe('');
        expect(existsSync(join(directory, 'rejected.json'))).toBe(false);
      });
    },
    30_000,
  );

  it.each([
    [
      'candidate hash',
      {
        candidateChange: (candidate: Feed) => {
          candidate.addons[addonId].updates[0].update_hash = `sha256:${'0'.repeat(64)}`;
        },
      },
      /candidate update_hash/,
    ],
    [
      'candidate identity',
      {
        candidateChange: (candidate: Feed) => {
          candidate.addons.other = candidate.addons[addonId];
          delete candidate.addons[addonId];
        },
      },
      /feed extension identity/,
    ],
    [
      'packaged update URL',
      {
        packageChange: (manifest: Manifest) => {
          manifest.browser_specific_settings.gecko.update_url += '?wrong';
        },
      },
      /manifest/,
    ],
    [
      'tag source update URL',
      {
        sourceChange: (manifest: Manifest) => {
          manifest.applications.zotero.update_url += '?wrong';
        },
      },
      /manifest/,
    ],
  ] as const)(
    'rejects %s even when Release asset bytes and checksum agree',
    (_name, options, message) => {
      withFixture(options, ({ cli }) => {
        const result = cli('promote');
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(message);
        expect(result.stdout).toBe('');
      });
    },
    30_000,
  );

  it('refuses a wrong source SHA and detects a real tag moving during download', () => {
    withFixture({}, ({ cli, git, state, commit }) => {
      const wrong = cli('promote', [tag, 'a'.repeat(40), '--output', '-']);
      expect(wrong.status).toBe(1);
      expect(wrong.stderr).toContain('expected source commit');
      expect(state.calls).toEqual([]);
      git('commit', '--allow-empty', '-m', 'different source');
      const replacement = git('rev-parse', 'HEAD');
      git('push', 'origin', `${replacement}:refs/heads/race-source`);
      state.replaceRealTagOnDownload = replacement;
      const raced = cli('promote', [tag, commit, '--output', '-']);
      expect(raced.status).toBe(1);
      expect(raced.stderr).toContain('remote tag does not resolve');
      expect(raced.stdout).toBe('');
    });
  }, 30_000);

  it('detects an annotated tag being replaced even when its source commit is unchanged', () => {
    withFixture({}, ({ cli, git, state, commit }) => {
      git('tag', '-a', 'alternate-tag', commit, '-m', 'replacement tag object');
      const replacementObject = git('rev-parse', 'refs/tags/alternate-tag');
      git('push', 'origin', 'refs/tags/alternate-tag');
      state.replaceRealTagOnDownload = replacementObject;
      const result = cli('promote');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('changed during verification');
      expect(result.stdout).toBe('');
    });
  }, 30_000);
});

describe.skipIf(process.platform === 'win32')('release CLI argument safety', () => {
  it.each(['prepare', 'promote'] as const)(
    '%s refuses a hard-linked official feed output without changing the input',
    (tool) => {
      withFixture({}, ({ cli, directory, commit }) => {
        const officialPath = join(directory, 'updates.json');
        const aliasPath = join(directory, 'hardlink-feed.json');
        const officialBefore = readFileSync(officialPath, 'utf8');
        const candidateBefore = readFileSync(join(directory, 'updates.candidate.json'), 'utf8');
        linkSync(officialPath, aliasPath);
        const args =
          tool === 'prepare'
            ? [tag, xpiName, '--output', aliasPath]
            : [tag, commit, '--output', aliasPath];
        const result = cli(tool, args);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('must not overwrite');
        expect(result.stdout).toBe('');
        expect(readFileSync(officialPath, 'utf8')).toBe(officialBefore);
        expect(readFileSync(aliasPath, 'utf8')).toBe(officialBefore);
        expect(readFileSync(join(directory, 'updates.candidate.json'), 'utf8')).toBe(
          candidateBefore,
        );
      });
    },
    30_000,
  );

  it.each(['prepare', 'promote'] as const)(
    '%s help and invalid arguments never access GitHub',
    (tool) => {
      withFixture({}, ({ cli, state, commit }) => {
        const help = cli(tool, ['--help']);
        expect(help.status, help.stderr).toBe(0);
        expect(help.stdout).toContain('Usage:');
        expect(help.stderr).toBe('');
        const invalid = [[], ['v1.2.3-beta.1', xpiName], ['v01.2.3', xpiName]];
        if (tool === 'promote')
          invalid.push([tag, commit], ['v1.2.3-beta.1', commit, '--output', '-']);
        for (const args of invalid) {
          const result = cli(tool, args);
          expect(result.status).toBe(1);
          expect(result.stdout).toBe('');
        }
        expect(state.calls).toEqual([]);
      });
    },
  );
});
