import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extensionErrorText,
  ExtensionSourceWriteError,
  forgetExtensionSource,
  installExtension,
  updateExtension,
} from '../../src/modules/extensions/operations';
import {
  CURATED_EXTENSIONS,
  resolveExtensionCandidates,
  type ExtensionSource,
} from '../../src/modules/extensions/sources';
import * as MainToolkit from '../../src/toolkit/main';

const native = vi.hoisted(() => ({
  install: vi.fn<typeof MainToolkit.installMainPlugin>(),
  update:
    vi.fn<
      (
        options: MainToolkit.MainPluginInstallOptions & { id: string; reportMissingSource: true },
      ) => Promise<MainToolkit.MainPluginInstallResult | 'no-source' | 'no-update' | null>
    >(),
}));

vi.mock('../../src/toolkit/main', async (importOriginal) => ({
  ...(await importOriginal<typeof MainToolkit>()),
  installMainPlugin: native.install,
  updateMainPlugin: native.update,
}));

const SOURCE_PREF = 'extensions.zotero-neo.extensionSources';
const plugin = { id: 'example-addon@test', version: '2.0.0' };
const latestVersion = '2.3.0';
const hostURL = `https://github.com/owner/sample/releases/download/v${latestVersion}`;
const assetName = 'selected.xpi';
const github: ExtensionSource = { kind: 'github', owner: 'owner', repo: 'sample', assetName };
const directURL = 'https://example.org/download/plugin.xpi?token=local-only';
const direct: ExtensionSource = { kind: 'xpi', url: directURL };
const digest = `sha256:${'ab'.repeat(32)}`;
const result = { id: plugin.id, version: latestVersion, pendingRestart: true };

function profile() {
  const values = new Map<string, string>();
  const set = vi.fn((key: string, value: string) => {
    values.set(key, value);
  });
  const clear = vi.fn((key: string) => {
    values.delete(key);
  });
  vi.stubGlobal('Services', {
    prefs: {
      getPrefType: (key: string) => (values.has(key) ? 32 : 0),
      getStringPref: (key: string) => values.get(key),
      setStringPref: set,
      clearUserPref: clear,
    },
    vc: {
      compare: (left: string, right: string) => left.localeCompare(right, 'en', { numeric: true }),
    },
  });
  return { values, set, clear };
}

function transport(signal = new AbortController().signal) {
  return { isCurrent: () => true, signal, progress: vi.fn(), registerCancel: vi.fn() };
}

function release(names: readonly string[], version = latestVersion) {
  return Response.json({
    tag_name: `v${version}`,
    assets: names.map((name) => ({
      name,
      state: 'uploaded',
      browser_download_url: `https://github.com/owner/sample/releases/download/v${version}/${name}`,
      digest,
    })),
  });
}

let prefs: ReturnType<typeof profile>;
const fetch = vi.fn<typeof globalThis.fetch>();

function seed(sources: Record<string, ExtensionSource>, version = 1) {
  const raw = JSON.stringify({ version, sources });
  prefs.values.set(SOURCE_PREF, raw);
  return raw;
}

beforeEach(() => {
  prefs = profile();
  native.install.mockReset();
  native.update.mockReset();
  fetch.mockReset();
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => vi.unstubAllGlobals());

describe('extension provenance', () => {
  it('records a direct XPI by its native add-on ID only after a successful install', async () => {
    const ctx = transport();
    const [candidate] = await resolveExtensionCandidates(directURL, ctx.signal);
    native.install.mockImplementationOnce(async (source, options) => {
      expect(prefs.values.has(SOURCE_PREF)).toBe(false);
      expect(options.id).toBeUndefined();
      expect(options.requireHTTPS).toBe(true);
      expect(options.confirm({ name: 'Example', source, version: result.version })).toBe(true);
      return result;
    });

    await expect(installExtension(candidate, ctx)).resolves.toEqual({ pendingRestart: true });
    expect(prefs.set).toHaveBeenCalledExactlyOnceWith(
      SOURCE_PREF,
      JSON.stringify({ version: 1, sources: { [plugin.id]: direct } }),
    );
  });

  it('passes and retains the curated ID, version and hash', async () => {
    const { candidate } = CURATED_EXTENSIONS[0];
    native.install.mockImplementationOnce(async (source, options) => {
      expect(options.id).toBe(candidate.expectedID);
      expect(options.hash).toBe(candidate.hash);
      const version = candidate.expectedVersion!;
      expect(options.confirm({ name: 'Translate Extra', source, version })).toBe(true);
      return { id: candidate.expectedID!, version, pendingRestart: false };
    });

    await expect(installExtension(candidate, transport())).resolves.toEqual({
      pendingRestart: false,
    });
    expect(prefs.set).toHaveBeenCalledExactlyOnceWith(
      SOURCE_PREF,
      JSON.stringify({ version: 1, sources: { [candidate.expectedID!]: candidate.source } }),
    );
  });

  it('vetoes stale, changed URL and wrong pinned version without recording success', async () => {
    const { candidate } = CURATED_EXTENSIONS[0];
    const controller = new AbortController();
    native.install.mockImplementationOnce(async (source, options) => {
      expect(() => options.confirm({ name: 'Translate Extra', source, version: '99' })).toThrow(
        MainToolkit.MainPluginError,
      );
      expect(() =>
        options.confirm({
          name: 'Translate Extra',
          source: `${source}?changed`,
          version: candidate.expectedVersion!,
        }),
      ).toThrow(MainToolkit.MainPluginError);
      controller.abort();
      expect(
        options.confirm({ name: 'Translate Extra', source, version: candidate.expectedVersion! }),
      ).toBe(false);
      return null;
    });

    await expect(installExtension(candidate, transport(controller.signal))).resolves.toBeNull();
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it('distinguishes a post-install storage failure from an install failure and keeps the restart flag', async () => {
    const ctx = transport();
    const [candidate] = await resolveExtensionCandidates(directURL, ctx.signal);
    native.install.mockResolvedValueOnce(result);
    prefs.set.mockImplementationOnce(() => {
      throw new Error('native preference write failed');
    });

    await expect(installExtension(candidate, ctx)).rejects.toMatchObject({
      name: 'ExtensionSourceWriteError',
      pendingRestart: true,
    });
    expect(extensionErrorText(new ExtensionSourceWriteError(true), true)).toContain(
      '无法保存安装来源',
    );
    expect(prefs.values.has(SOURCE_PREF)).toBe(false);
  });

  it('forgets only the uninstalled extension and clears the preference when empty', () => {
    seed({ [plugin.id]: github, 'direct@test': direct });

    forgetExtensionSource(plugin.id);
    expect(prefs.values.get(SOURCE_PREF)).toBe(
      JSON.stringify({ version: 1, sources: { 'direct@test': direct } }),
    );
    forgetExtensionSource('direct@test');
    expect(prefs.values.has(SOURCE_PREF)).toBe(false);
    expect(prefs.clear).toHaveBeenCalledExactlyOnceWith(SOURCE_PREF);
  });

  it('does not silently overwrite an unknown profile schema after native success', async () => {
    const previous = seed({ [plugin.id]: github }, 2);
    const ctx = transport();
    const [candidate] = await resolveExtensionCandidates(directURL, ctx.signal);
    native.install.mockResolvedValueOnce(result);

    await expect(installExtension(candidate, ctx)).rejects.toBeInstanceOf(
      ExtensionSourceWriteError,
    );
    expect(prefs.set).not.toHaveBeenCalled();
    expect(prefs.values.get(SOURCE_PREF)).toBe(previous);
  });
});

describe('extension update precedence', () => {
  it('uses a native success without replacing the stored publisher or asset', async () => {
    const previous = seed({ [plugin.id]: github });
    native.update.mockImplementationOnce(async (options) => {
      expect(options).toEqual(
        expect.objectContaining({ id: plugin.id, reportMissingSource: true, requireHTTPS: true }),
      );
      expect(options.confirm({ name: 'Example', source: directURL, version: result.version })).toBe(
        true,
      );
      return result;
    });

    await expect(updateExtension(plugin, transport())).resolves.toEqual({ pendingRestart: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(native.install).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
    expect(prefs.values.get(SOURCE_PREF)).toBe(previous);
  });

  it('never falls back for no native update, cancellation, or a native error', async () => {
    seed({ [plugin.id]: github });
    const failure = new MainToolkit.MainPluginError('network', 'Provider diagnostic');
    native.update
      .mockResolvedValueOnce('no-update')
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(failure);

    await expect(updateExtension(plugin, transport())).resolves.toBe('current');
    await expect(updateExtension(plugin, transport())).resolves.toBeNull();
    await expect(updateExtension(plugin, transport())).rejects.toBe(failure);
    expect(extensionErrorText(failure, true)).toContain('无法下载扩展或检查更新');
    expect(fetch).not.toHaveBeenCalled();
    expect(native.install).not.toHaveBeenCalled();
  });

  it('skips when native has no address and provenance is direct or absent, not inferred from a homepage', async () => {
    seed({ [plugin.id]: direct });
    native.update.mockResolvedValue('no-source');
    await expect(updateExtension(plugin, transport())).resolves.toBe('skipped');
    forgetExtensionSource(plugin.id);
    const withHomepage = { ...plugin, homepageURL: 'https://github.com/owner/sample' };
    await expect(updateExtension(withHomepage, transport())).resolves.toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the positively matched stored asset after native reports no update address', async () => {
    seed({ [plugin.id]: github });
    native.update.mockResolvedValueOnce('no-source');
    fetch.mockResolvedValueOnce(release(['other.xpi', assetName]));
    native.install.mockResolvedValueOnce(result);

    await expect(updateExtension(plugin, transport())).resolves.toEqual({ pendingRestart: true });
    expect(native.install).toHaveBeenCalledExactlyOnceWith(
      `${hostURL}/${assetName}`,
      expect.objectContaining({ id: plugin.id, upgrade: true, hash: digest }),
    );
    expect(prefs.set).toHaveBeenCalledExactlyOnceWith(
      SOURCE_PREF,
      JSON.stringify({ version: 1, sources: { [plugin.id]: github } }),
    );
  });

  it('records a single renamed asset only when the native upgrade succeeds', async () => {
    const previous = seed({ [plugin.id]: github });
    native.update.mockResolvedValue('no-source');
    fetch
      .mockResolvedValueOnce(release(['renamed.xpi']))
      .mockResolvedValueOnce(release(['renamed.xpi']));
    native.install.mockResolvedValueOnce(null).mockResolvedValueOnce(result);

    await expect(updateExtension(plugin, transport())).resolves.toBeNull();
    expect(prefs.values.get(SOURCE_PREF)).toBe(previous);
    await expect(updateExtension(plugin, transport())).resolves.toEqual({ pendingRestart: true });
    expect(prefs.values.get(SOURCE_PREF)).toBe(
      JSON.stringify({
        version: 1,
        sources: { [plugin.id]: { ...github, assetName: 'renamed.xpi' } },
      }),
    );
  });

  it('does not substitute an ambiguous asset or install a release that is not newer', async () => {
    seed({ [plugin.id]: github });
    native.update.mockResolvedValue('no-source');
    fetch
      .mockResolvedValueOnce(release(['other.xpi', 'alternative.xpi']))
      .mockResolvedValueOnce(release([assetName], plugin.version))
      .mockResolvedValueOnce(release([assetName], '1.9.0'));

    await expect(updateExtension(plugin, transport())).rejects.toMatchObject({
      code: 'ambiguous-asset',
    });
    await expect(updateExtension(plugin, transport())).resolves.toBe('current');
    await expect(updateExtension(plugin, transport())).resolves.toBe('current');
    expect(native.install).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
  });

  it('does not start a native upgrade when cancellation wins during metadata resolution', async () => {
    seed({ [plugin.id]: github });
    native.update.mockResolvedValueOnce('no-source');
    const controller = new AbortController();
    fetch.mockImplementationOnce(async () => {
      controller.abort();
      return release([assetName]);
    });

    await expect(updateExtension(plugin, transport(controller.signal))).resolves.toBeNull();
    expect(native.install).not.toHaveBeenCalled();
    expect(prefs.set).not.toHaveBeenCalled();
  });
});
