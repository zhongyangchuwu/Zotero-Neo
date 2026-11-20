import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURATED_EXTENSIONS,
  resolveExtensionCandidates,
} from '../../src/modules/extensions/sources';
import {
  TRANSLATE_PLUGIN_HASH,
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_INSTALL_URL,
  TRANSLATE_SUPPORTED_VERSION,
} from '../../src/modules/translation/dependency';

const endpoint = 'https://api.github.com/repos/owner/sample/releases/latest';
const download = 'https://github.com/Owner/Sample/releases/download/v2.3.0';
const digest = `sha256:${'AB'.repeat(32)}`;

function asset(name: string, url = `${download}/${encodeURIComponent(name)}`) {
  return { name, state: 'uploaded', browser_download_url: url, digest: null };
}

function release(assets: readonly unknown[]) {
  return Response.json({ tag_name: 'v2.3.0', draft: false, prerelease: false, assets });
}

function resolve(input: string, signal = new AbortController().signal) {
  return resolveExtensionCandidates(input, signal);
}

const waitForAbort: typeof fetch = (_url, init) => {
  const { promise, reject } = Promise.withResolvers<Response>();
  const signal = init?.signal;
  signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  return promise;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('extension source resolution', () => {
  it.each([
    ' Owner/Sample ',
    'https://github.com/Owner/Sample/',
    'https://github.com/owner/sample/releases',
    'https://github.com/owner/sample/releases/latest',
    'https://github.com/owner/sample/releases/tag/old-channel%2Ftest.xpi',
  ])('uses only the repository identity from %s', async (input) => {
    const fetch = vi.fn(async () => release([asset('extension.xpi')]));
    vi.stubGlobal('fetch', fetch);

    await expect(resolve(input)).resolves.toEqual([
      {
        source: { kind: 'github', owner: 'owner', repo: 'sample', assetName: 'extension.xpi' },
        url: `${download}/extension.xpi`,
        name: 'extension.xpi',
        version: '2.3.0',
      },
    ]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      endpoint,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'application/vnd.github+json' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ['https://example.org/download/Reader%20Tools.XPI?token=local-only', 'Reader Tools.XPI'],
    [`${download}/extension.xpi`, 'extension.xpi'],
    ['https://github.com/owner/sample/releases/latest/download/extension.xpi', 'extension.xpi'],
  ])('treats %s as a direct package without a GitHub lookup', async (url, name) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(resolve(url)).resolves.toEqual([{ source: { kind: 'xpi', url }, url, name }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'http://example.org/extension.xpi',
    'javascript:example.org/extension.xpi',
    'https://user:password@example.org/extension.xpi',
    'https://@example.org/extension.xpi',
    'https://example.org/extension.xpi#',
    'https://example.org/extension.xpi#download',
    'https://example.org/download?file=extension.xpi',
    'https://example.org/path%2Fextension.xpi',
    'https://github.com/owner/sample/releases/expanded_assets/extension.xpi',
    'https://github.com/owner/sample/blob/main/extension.xpi',
    'https://github.com/owner/sample%2Freleases',
    'https://github.com/owner%0A/sample',
    'owner/sample?path=/releases/latest',
  ])('rejects unsafe URLs and GitHub pages that are not release sources: %s', async (input) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(resolve(input)).rejects.toMatchObject({ code: 'invalid-source' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns each usable XPI with its distinct filename and optional advertised checksum', async () => {
    vi.stubGlobal('fetch', async () =>
      release([
        { ...asset('stable.xpi'), digest },
        asset('Other Build.xpi'),
        asset('release-notes.txt'),
        { ...asset('unfinished.xpi'), state: 'open' },
        { ...asset('bad-digest.xpi'), digest: 'sha256:broken' },
        asset('wrong-tag.xpi', `${download.replace('v2.3.0', 'v3.0')}/wrong-tag.xpi`),
        asset('wrong-repo.xpi', `${download.replace('/Sample/', '/Other/')}/wrong-repo.xpi`),
      ]),
    );

    await expect(resolve('owner/sample')).resolves.toEqual([
      {
        source: { kind: 'github', owner: 'owner', repo: 'sample', assetName: 'stable.xpi' },
        url: `${download}/stable.xpi`,
        name: 'stable.xpi',
        version: '2.3.0',
        hash: digest.toLowerCase(),
      },
      {
        source: { kind: 'github', owner: 'owner', repo: 'sample', assetName: 'Other Build.xpi' },
        url: `${download}/Other%20Build.xpi`,
        name: 'Other Build.xpi',
        version: '2.3.0',
      },
    ]);
  });

  it.each<{ status: number; headers: HeadersInit; code: string }>([
    { status: 403, headers: { 'x-ratelimit-remaining': '0' }, code: 'release-rate-limit' },
    { status: 403, headers: { 'retry-after': '5' }, code: 'release-rate-limit' },
    { status: 429, headers: {}, code: 'release-rate-limit' },
    { status: 404, headers: {}, code: 'release-missing' },
    { status: 403, headers: {}, code: 'release-network' },
  ])('reports $code for HTTP $status with $headers', async ({ status, headers, code }) => {
    vi.stubGlobal('fetch', async () => new Response(null, { status, headers }));
    await expect(resolve('owner/sample')).rejects.toMatchObject({ code });
  });

  it('distinguishes missing XPI assets from invalid asset metadata', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(release([asset('notes.txt')]))
      .mockResolvedValueOnce(release([asset('foreign.xpi', 'https://example.org/foreign.xpi')]));
    vi.stubGlobal('fetch', fetch);

    await expect(resolve('owner/sample')).rejects.toMatchObject({ code: 'release-assets' });
    await expect(resolve('owner/sample')).rejects.toMatchObject({ code: 'release-response' });
  });

  it('propagates the caller’s abort reason during a request', async () => {
    vi.stubGlobal('fetch', waitForAbort);
    const controller = new AbortController();
    const resolved = resolve('owner/sample', controller.signal);
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    await expect(resolved).rejects.toBe(reason);
  });

  it('bounds the request time even without caller cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', waitForAbort);

    const rejected = expect(resolve('owner/sample')).rejects.toMatchObject({
      code: 'release-timeout',
    });
    await vi.advanceTimersByTimeAsync(15_001);
    await rejected;
  });

  it('keeps the curated Translate dependency pinned in both the candidate and its provenance', () => {
    expect(CURATED_EXTENSIONS).toContainEqual({
      label: 'Translate Extra',
      candidate: {
        source: {
          kind: 'xpi',
          url: TRANSLATE_PLUGIN_INSTALL_URL,
          hash: TRANSLATE_PLUGIN_HASH,
          expectedVersion: TRANSLATE_SUPPORTED_VERSION,
        },
        url: TRANSLATE_PLUGIN_INSTALL_URL,
        name: 'translate-for-zotero.xpi',
        version: TRANSLATE_SUPPORTED_VERSION,
        expectedID: TRANSLATE_PLUGIN_ID,
        expectedVersion: TRANSLATE_SUPPORTED_VERSION,
        hash: TRANSLATE_PLUGIN_HASH,
      },
    });
  });
});
