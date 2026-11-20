import {
  createExtensionAbortController,
  fetchExtensionRelease,
  parseExtensionURL,
  readProfileExtensionSources,
  scheduleExtensionTimeout,
  writeProfileExtensionSources,
} from '../../platform/extension-sources';
import {
  TRANSLATE_PLUGIN_HASH,
  TRANSLATE_PLUGIN_ID,
  TRANSLATE_PLUGIN_INSTALL_URL,
  TRANSLATE_SUPPORTED_VERSION,
} from '../translation/dependency';

export type ExtensionSource =
  | {
      readonly kind: 'github';
      readonly owner: string;
      readonly repo: string;
      readonly assetName?: string;
    }
  | {
      readonly kind: 'xpi';
      readonly url: string;
      readonly hash?: string;
      readonly expectedVersion?: string;
    };

type GitHubSource = Extract<ExtensionSource, { kind: 'github' }>;

export interface ExtensionCandidate {
  readonly source: ExtensionSource;
  readonly url: string;
  readonly name: string;
  readonly version?: string;
  readonly hash?: string;
  readonly expectedID?: string;
  readonly expectedVersion?: string;
}

type CuratedExtension = { readonly label: string } & (
  | { readonly candidate: ExtensionCandidate }
  | {
      readonly description: readonly [english: string, chinese: string];
      readonly source: GitHubSource & { readonly assetName: string };
      readonly expectedID: string;
    }
);

export const CURATED_EXTENSIONS: readonly CuratedExtension[] = [
  {
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
      hash: TRANSLATE_PLUGIN_HASH,
      expectedID: TRANSLATE_PLUGIN_ID,
      expectedVersion: TRANSLATE_SUPPORTED_VERSION,
    },
  },
  {
    label: 'Zotero Bases',
    description: [
      'Standalone literature tables with saved views, plain-text properties, and grouping',
      '独立多视图文献表格、纯文本自定义属性与按列分组',
    ],
    source: {
      kind: 'github',
      owner: 'zhongyangchuwu',
      repo: 'zotero-bases',
      assetName: 'zotero-bases.xpi',
    },
    expectedID: 'zotero-bases@zhongyangchuwu.github.io',
  },
];

export class ExtensionSourceError extends Error {
  constructor(
    readonly code:
      | 'invalid-source'
      | 'release-rate-limit'
      | 'release-missing'
      | 'release-assets'
      | 'release-response'
      | 'release-network'
      | 'release-timeout'
      | 'release-version'
      | 'ambiguous-asset'
      | 'source-read',
  ) {
    super(code);
    this.name = 'ExtensionSourceError';
  }
}

const GITHUB_ORIGIN = 'https://github.com';
const GITHUB_TIMEOUT_MS = 15_000;
const SOURCE_VERSION = 1;
const MAX_SOURCE_STORE_LENGTH = 2 * 1024 * 1024;
const MAX_STORED_SOURCES = 4096;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;

export function safeExtensionHTTPSURL(raw: string): URL | undefined {
  const authority = /^https:\/\/([^/?#]+)/i.exec(raw)?.[1];
  if (!authority || authority.includes('@') || raw.includes('#') || raw.includes('\\')) return;
  for (let index = 0; index < raw.length; ++index) {
    const character = raw.charCodeAt(index);
    if (character < 32 || character === 127) return;
  }
  try {
    const url = parseExtensionURL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {
    // Not an absolute HTTPS URL.
  }
  return undefined;
}

function githubExtensionSource(owner: string, repo: string): GitHubSource | undefined {
  if (!owner || /[^a-z\d-]/i.test(owner) || owner.startsWith('-') || owner.endsWith('-')) return;
  if (!repo || /[^a-z\d_.-]/i.test(repo) || repo === '.' || repo === '..') return;
  return { kind: 'github', owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}

function isExtensionAssetName(name: string): boolean {
  return name.toLowerCase().endsWith('.xpi') && !name.includes('/') && !name.includes('\\');
}

function directAssetName(url: URL): string | undefined {
  const name = decodedSegments(url.pathname.slice(url.pathname.lastIndexOf('/') + 1))?.[0];
  return name && isExtensionAssetName(name) ? name : undefined;
}

function isSHA256(value: unknown): value is string {
  return typeof value === 'string' && value.length === 71 && SHA256.test(value);
}

export function parseExtensionSource(value: unknown): ExtensionSource | undefined {
  if (value && typeof value === 'object' && 'kind' in value) {
    if (value.kind === 'github' && 'owner' in value && 'repo' in value) {
      const { owner, repo } = value;
      const assetName = 'assetName' in value ? value.assetName : undefined;
      const source =
        typeof owner === 'string' && typeof repo === 'string'
          ? githubExtensionSource(owner, repo)
          : undefined;
      if (source && assetName === undefined) return source;
      if (source && typeof assetName === 'string' && isExtensionAssetName(assetName)) {
        return { ...source, assetName };
      }
    }
    if (value.kind === 'xpi' && 'url' in value && typeof value.url === 'string') {
      const url = safeExtensionHTTPSURL(value.url);
      const hash = 'hash' in value ? value.hash : undefined;
      const expectedVersion = 'expectedVersion' in value ? value.expectedVersion : undefined;
      if (
        url &&
        directAssetName(url) &&
        (hash === undefined || isSHA256(hash)) &&
        (expectedVersion === undefined || (typeof expectedVersion === 'string' && expectedVersion))
      ) {
        return { kind: 'xpi', url: url.href, hash, expectedVersion };
      }
    }
  }
}

function parseStoredSource(value: unknown): ExtensionSource {
  const source = parseExtensionSource(value);
  if (!source) throw new ExtensionSourceError('source-read');
  return source;
}

export function readSources(): Map<string, ExtensionSource> {
  try {
    const raw = readProfileExtensionSources();
    if (raw === null) return new Map();
    if (raw.length > MAX_SOURCE_STORE_LENGTH) throw new ExtensionSourceError('source-read');
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === 'object' &&
      'version' in value &&
      value.version === SOURCE_VERSION &&
      'sources' in value &&
      value.sources &&
      typeof value.sources === 'object' &&
      !Array.isArray(value.sources)
    ) {
      const sources = new Map<string, ExtensionSource>();
      const entries = Object.entries(value.sources);
      if (entries.length > MAX_STORED_SOURCES) throw new ExtensionSourceError('source-read');
      for (const [id, source] of entries) sources.set(id, parseStoredSource(source));
      return sources;
    }
  } catch {
    // Preserve an unreadable or future-version preference rather than overwriting it.
  }
  throw new ExtensionSourceError('source-read');
}

export function readExtensionSource(id: string): ExtensionSource | undefined {
  return readSources().get(id);
}

export function writeExtensionSource(id: string, source: ExtensionSource): void {
  const sources = readSources();
  sources.set(id, parseStoredSource(source));
  writeProfileExtensionSources(
    JSON.stringify({ version: SOURCE_VERSION, sources: Object.fromEntries(sources) }),
  );
}

export function removeExtensionSource(id: string): void {
  const sources = readSources();
  if (!sources.delete(id)) return;
  writeProfileExtensionSources(
    sources.size
      ? JSON.stringify({ version: SOURCE_VERSION, sources: Object.fromEntries(sources) })
      : null,
  );
}

function decodedSegments(path: string): string[] | undefined {
  try {
    const segments = path.split('/').map((segment) => decodeURIComponent(segment));
    if (segments.every((segment) => segment && segment !== '.' && segment !== '..'))
      return segments;
  } catch {
    // An invalid escape cannot name a repository, tag or asset.
  }
  return undefined;
}

function githubPageSource(segments: string[]): GitHubSource | undefined {
  const [owner, repo, area, page] = segments;
  if (!owner || !repo) return;
  if (
    segments.length === 2 ||
    (area === 'releases' &&
      (segments.length === 3 ||
        (page === 'latest' && segments.length === 4) ||
        (page === 'tag' && segments.length >= 5)))
  ) {
    return githubExtensionSource(owner, repo);
  }
  return undefined;
}

function isGitHubReleaseDownload(segments: string[]): boolean {
  return (
    (segments[3] === 'download' && segments.length >= 6) ||
    (segments[3] === 'latest' && segments[4] === 'download' && segments.length === 6)
  );
}

function parseExtensionInput(input: string): GitHubSource | ExtensionCandidate {
  const raw = input.trim();
  const shorthand = /^([^/]+)\/([^/]+)\/?$/.exec(raw);
  if (shorthand) {
    const source = githubExtensionSource(shorthand[1], shorthand[2]);
    if (source) return source;
  }
  const url = safeExtensionHTTPSURL(raw);
  if (url) {
    if (url.origin === GITHUB_ORIGIN) {
      const segments = decodedSegments(url.pathname.slice(1).replace(/\/$/, ''));
      if (!segments) throw new ExtensionSourceError('invalid-source');
      const source = githubPageSource(segments);
      if (source) return source;
      if (
        (segments[2] === 'releases' && !isGitHubReleaseDownload(segments)) ||
        segments[2] === 'blob'
      ) {
        throw new ExtensionSourceError('invalid-source');
      }
    }
    const name = directAssetName(url);
    if (name) return { source: { kind: 'xpi', url: url.href }, url: url.href, name };
  }
  throw new ExtensionSourceError('invalid-source');
}

function parseRelease(payload: unknown, source: GitHubSource): ExtensionCandidate[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('tag_name' in payload) ||
    typeof payload.tag_name !== 'string' ||
    !('assets' in payload) ||
    !Array.isArray(payload.assets)
  ) {
    throw new ExtensionSourceError('release-response');
  }
  if (
    ('draft' in payload && payload.draft === true) ||
    ('prerelease' in payload && payload.prerelease === true)
  ) {
    throw new ExtensionSourceError('release-missing');
  }
  const tag = payload.tag_name;
  const unprefixed = tag.replace(/^v(?=\d)/i, '');
  const version = /^\d[0-9a-z.+_-]*$/i.test(unprefixed) ? unprefixed : undefined;
  const candidates: ExtensionCandidate[] = [];
  let invalidAsset = false;
  for (const asset of payload.assets as unknown[]) {
    if (
      !asset ||
      typeof asset !== 'object' ||
      !('name' in asset) ||
      typeof asset.name !== 'string' ||
      !asset.name.toLowerCase().endsWith('.xpi') ||
      !('state' in asset) ||
      asset.state !== 'uploaded'
    ) {
      continue;
    }
    const name = asset.name;
    const url =
      'browser_download_url' in asset && typeof asset.browser_download_url === 'string'
        ? safeExtensionHTTPSURL(asset.browser_download_url)
        : undefined;
    const segments = url && decodedSegments(url.pathname.slice(1));
    const hash = 'digest' in asset ? asset.digest : undefined;
    if (
      !isExtensionAssetName(name) ||
      !url ||
      url.origin !== GITHUB_ORIGIN ||
      url.href.includes('?') ||
      !segments ||
      segments.length < 6 ||
      segments[0].toLowerCase() !== source.owner ||
      segments[1].toLowerCase() !== source.repo ||
      segments[2] !== 'releases' ||
      segments[3] !== 'download' ||
      segments.slice(4, -1).join('/') !== tag ||
      segments.at(-1) !== name ||
      (hash != null && !isSHA256(hash))
    ) {
      invalidAsset = true;
      continue;
    }
    candidates.push({
      source: { kind: 'github', owner: source.owner, repo: source.repo, assetName: name },
      url: url.href,
      name,
      version,
      hash: typeof hash === 'string' ? hash.toLowerCase() : undefined,
    });
  }
  if (!candidates.length) {
    throw new ExtensionSourceError(invalidAsset ? 'release-response' : 'release-assets');
  }
  return candidates;
}

async function latestGitHubRelease(
  source: GitHubSource,
  signal: AbortSignal,
): Promise<readonly ExtensionCandidate[]> {
  const controller = createExtensionAbortController();
  const abort = (): void => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  const clearTimeout = scheduleExtensionTimeout(
    () => controller.abort(new ExtensionSourceError('release-timeout')),
    GITHUB_TIMEOUT_MS,
  );
  try {
    const endpoint = `https://api.github.com/repos/${source.owner}/${source.repo}/releases/latest`;
    const response = await fetchExtensionRelease(endpoint, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after')))
    ) {
      throw new ExtensionSourceError('release-rate-limit');
    }
    if (response.status === 404) throw new ExtensionSourceError('release-missing');
    if (!response.ok) throw new ExtensionSourceError('release-network');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      controller.signal.throwIfAborted();
      throw new ExtensionSourceError('release-response');
    }
    controller.signal.throwIfAborted();
    return parseRelease(payload, source);
  } catch (error) {
    controller.signal.throwIfAborted();
    if (error instanceof ExtensionSourceError) throw error;
    throw new ExtensionSourceError('release-network');
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout();
  }
}

export async function resolveExtensionCandidates(
  input: string,
  signal: AbortSignal,
): Promise<readonly ExtensionCandidate[]> {
  signal.throwIfAborted();
  const parsed = parseExtensionInput(input);
  return 'kind' in parsed ? latestGitHubRelease(parsed, signal) : [parsed];
}

export async function resolveCuratedExtension(
  entry: CuratedExtension,
  signal: AbortSignal,
): Promise<ExtensionCandidate> {
  signal.throwIfAborted();
  if ('candidate' in entry) return entry.candidate;
  const candidates = await latestGitHubRelease(entry.source, signal);
  const matches = candidates.filter(({ name }) => name === entry.source.assetName);
  if (!matches.length) throw new ExtensionSourceError('release-assets');
  if (matches.length > 1) throw new ExtensionSourceError('ambiguous-asset');
  const [candidate] = matches;
  if (!candidate.version) throw new ExtensionSourceError('release-version');
  return { ...candidate, expectedID: entry.expectedID, expectedVersion: candidate.version };
}
