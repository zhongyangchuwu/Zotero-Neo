import {
  MainPluginError,
  compareMainPluginVersions,
  installMainPlugin,
  updateMainPlugin,
  type MainPluginErrorCode,
  type MainPluginInstallOptions,
  type MainPluginInstallResult,
} from '../../toolkit/main';
import {
  ExtensionSourceError,
  readExtensionSource,
  removeExtensionSource,
  resolveExtensionCandidates,
  safeExtensionHTTPSURL,
  writeExtensionSource,
  type ExtensionCandidate,
  type ExtensionSource,
} from './sources';

export type ExtensionTransport = {
  readonly isCurrent: () => boolean;
  readonly signal: AbortSignal;
  readonly progress: (current: number, total: number) => void;
  readonly registerCancel: (cancel: (() => void) | null) => void;
};

interface ExtensionMutation {
  readonly pendingRestart: boolean;
}

export class ExtensionSourceWriteError extends Error {
  constructor(readonly pendingRestart: boolean | null) {
    super(
      pendingRestart === null ? 'Extension source removal failed' : 'Extension source save failed',
    );
    this.name = 'ExtensionSourceWriteError';
  }
}

function isCurrent(transport: ExtensionTransport): boolean {
  return !transport.signal.aborted && transport.isCurrent();
}

function nativeOptions(
  transport: ExtensionTransport,
  expectedURL?: string,
  expectedVersion?: string,
): MainPluginInstallOptions {
  return {
    requireHTTPS: true,
    confirm: ({ source, version }) => {
      if (!isCurrent(transport)) return false;
      const url = safeExtensionHTTPSURL(source);
      if (!url || (expectedURL !== undefined && url.href !== expectedURL)) {
        throw new MainPluginError(
          'insecure-source',
          'Package source differs from the approved HTTPS URL',
        );
      }
      if (expectedVersion !== undefined && version !== expectedVersion) {
        throw new MainPluginError(
          'identity',
          'Package version differs from the selected pinned version',
        );
      }
      return true;
    },
    progress: (current, total) => {
      if (isCurrent(transport)) transport.progress(current, total);
    },
    registerCancel: transport.registerCancel,
  };
}

function recordInstall(
  result: MainPluginInstallResult | null,
  source: ExtensionSource,
): ExtensionMutation | null {
  if (!result) return null;
  const { id, pendingRestart } = result;
  try {
    writeExtensionSource(id, source);
  } catch {
    throw new ExtensionSourceWriteError(pendingRestart);
  }
  return { pendingRestart };
}

async function installCandidate(
  candidate: ExtensionCandidate,
  transport: ExtensionTransport,
  upgradeID?: string,
): Promise<ExtensionMutation | null> {
  if (!isCurrent(transport)) return null;
  const url = safeExtensionHTTPSURL(candidate.url);
  if (!url) throw new MainPluginError('insecure-source', 'Package source is not a safe HTTPS URL');
  const result = await installMainPlugin(url.href, {
    ...nativeOptions(transport, url.href, candidate.expectedVersion),
    id: upgradeID ?? candidate.expectedID,
    hash: candidate.hash,
    upgrade: upgradeID === undefined ? undefined : true,
  });
  // A native success can arrive after the UI closes. That does not undo the mutation.
  return recordInstall(result, candidate.source);
}

export function installExtension(
  candidate: ExtensionCandidate,
  transport: ExtensionTransport,
): Promise<ExtensionMutation | null> {
  return installCandidate(candidate, transport);
}

export async function updateExtension(
  plugin: { id: string; version: string },
  transport: ExtensionTransport,
): Promise<'current' | 'skipped' | ExtensionMutation | null> {
  if (!isCurrent(transport)) return null;
  const native = await updateMainPlugin({
    ...nativeOptions(transport),
    id: plugin.id,
    reportMissingSource: true,
  });
  if (native === null) return null;
  if (native === 'no-update') return 'current';
  if (native !== 'no-source') return { pendingRestart: native.pendingRestart };
  if (!isCurrent(transport)) return null;
  const source = readExtensionSource(plugin.id);
  if (source?.kind !== 'github') return 'skipped';

  let candidates: readonly ExtensionCandidate[];
  try {
    candidates = await resolveExtensionCandidates(
      `${source.owner}/${source.repo}`,
      transport.signal,
    );
  } catch (error) {
    if (!isCurrent(transport)) return null;
    throw error;
  }
  if (!isCurrent(transport)) return null;
  const matches =
    candidates.length === 1
      ? candidates
      : candidates.filter(({ name }) => name === source.assetName);
  if (matches.length !== 1) throw new ExtensionSourceError('ambiguous-asset');
  const candidate = matches[0];
  if (!candidate.version) throw new ExtensionSourceError('release-version');
  if (compareMainPluginVersions(candidate.version, plugin.version) <= 0) return 'current';
  return installCandidate(candidate, transport, plugin.id);
}

export function forgetExtensionSource(id: string): void {
  try {
    removeExtensionSource(id);
  } catch {
    throw new ExtensionSourceWriteError(null);
  }
}

type LocalizedText = readonly [english: string, chinese: string];

const ERROR_TEXT: Record<MainPluginErrorCode | ExtensionSourceError['code'], LocalizedText> = {
  'invalid-source': [
    'Enter a GitHub owner/repo, a GitHub release link, or a direct HTTPS XPI link without credentials or a fragment.',
    '请输入 GitHub 的「所有者/仓库」、发布链接，或不含账号密码和片段的 HTTPS XPI 直链。',
  ],
  'release-rate-limit': [
    'GitHub rate limit reached. Try again later.',
    'GitHub 请求次数已达上限，请稍后重试。',
  ],
  'release-missing': [
    'GitHub has no public stable release for this repository.',
    '此 GitHub 仓库没有公开的正式版本。',
  ],
  'release-assets': [
    'The latest GitHub release has no XPI package.',
    'GitHub 的最新正式版本没有 XPI 安装包。',
  ],
  'release-response': [
    'GitHub returned invalid release or XPI details.',
    'GitHub 返回的发布信息或 XPI 安装包信息无效。',
  ],
  'release-network': [
    'Could not fetch the latest release from GitHub.',
    '无法从 GitHub 获取最新正式版本。',
  ],
  'release-timeout': ['The GitHub release request timed out.', '获取 GitHub 正式版本的请求超时。'],
  'release-version': [
    'The latest release tag does not specify a comparable version.',
    '最新发布的标签未提供可比较的版本号。',
  ],
  'ambiguous-asset': [
    'The release has multiple XPI packages and none can be matched uniquely to the installed source.',
    '此版本包含多个 XPI 安装包，无法唯一匹配已记录的安装来源。',
  ],
  'source-read': [
    'Could not read the install sources in this Zotero profile.',
    '无法读取此 Zotero 配置中的扩展安装来源。',
  ],
  network: ['Could not download the extension or check for updates.', '无法下载扩展或检查更新。'],
  signature: ['Zotero rejected the extension signature.', 'Zotero 未接受此扩展的签名。'],
  blocked: ['Zotero blocked this extension.', 'Zotero 已阻止此扩展。'],
  incompatible: [
    'This extension is not compatible with this version of Zotero.',
    '此扩展与当前 Zotero 版本不兼容。',
  ],
  'already-installed': ['This extension is already installed.', '此扩展已安装。'],
  identity: [
    'The downloaded extension or version does not match the selected package.',
    '下载的扩展标识或版本与所选安装包不符。',
  ],
  protected: [
    'This extension is protected and cannot be changed here.',
    '此扩展受保护，无法在此更改。',
  ],
  permission: [
    'Zotero does not allow this action for the extension.',
    'Zotero 不允许对该扩展执行此操作。',
  ],
  'invalid-package': [
    'The extension package is invalid, damaged, or did not pass its checksum.',
    '扩展安装包无效、已损坏或未通过校验。',
  ],
  unavailable: [
    'Zotero could not complete the extension operation.',
    'Zotero 无法完成此扩展操作。',
  ],
  'not-newer': [
    'The downloaded extension is not newer than the installed version.',
    '下载的扩展版本并不比已安装的版本更新。',
  ],
  'insecure-source': [
    'The package source is not a safe HTTPS URL or differs from the selected link.',
    '安装包的来源不是安全的 HTTPS 链接，或与所选链接不符。',
  ],
};

export function extensionErrorText(error: unknown, chinese: boolean): string {
  let text = ERROR_TEXT.unavailable;
  if (error instanceof ExtensionSourceWriteError) {
    text =
      error.pendingRestart === null
        ? [
            'The extension was removed, but its saved install source could not be cleared.',
            '扩展已卸载，但无法清除已记录的安装来源。',
          ]
        : [
            'The extension changed, but its install source could not be saved.',
            '扩展已更改，但无法保存安装来源。',
          ];
  } else if (error instanceof MainPluginError || error instanceof ExtensionSourceError) {
    text = ERROR_TEXT[error.code];
  }
  return text[chinese ? 1 : 0];
}
