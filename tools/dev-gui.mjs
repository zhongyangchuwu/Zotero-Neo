import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const ADDON_ID = 'zotero-neo@zotero-neo';
const root = resolve(import.meta.dirname, '..');
const buildAddon = resolve(root, 'build/addon');
const localConfigPath = resolve(root, '.zotero-neo-dev.json');

function fail(message) {
  console.error(`[dev-gui] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = argv[0] ?? 'sync';
  let profile = null;

  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--profile') {
      profile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    fail(`Unknown argument: ${argv[i]}`);
  }

  if (!['setup', 'sync', 'status'].includes(command)) {
    fail(`Unknown command: ${command}`);
  }

  return { command, profile };
}

function readLocalConfig() {
  if (!existsSync(localConfigPath)) return {};
  try {
    return JSON.parse(readFileSync(localConfigPath, 'utf8'));
  } catch (error) {
    fail(`Cannot read ${localConfigPath}: ${String(error)}`);
  }
}

function writeLocalConfig(profile) {
  writeFileSync(localConfigPath, `${JSON.stringify({ profile }, null, 2)}\n`);
}

function resolveProfile(explicitProfile) {
  const localConfig = readLocalConfig();
  const raw = explicitProfile ?? process.env.ZOTERO_NEO_DEV_PROFILE ?? localConfig.profile ?? null;

  if (!raw) {
    fail(
      'No development profile configured. Run: npm run dev:setup -- --profile /mnt/c/.../Profiles/<dev-profile>',
    );
  }

  const profile = resolve(raw);
  if (!existsSync(profile) || !statSync(profile).isDirectory()) {
    fail(`Zotero profile directory does not exist: ${profile}`);
  }
  return profile;
}

export function wslMountPathToWindows(path) {
  const normalized = resolve(path);
  const match = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/.exec(normalized);
  if (!match) {
    if (process.platform === 'win32') return normalized;
    throw new Error(`Expected a Windows-mounted path under /mnt/<drive>, got: ${normalized}`);
  }

  const drive = match[1].toUpperCase();
  const rest = (match[2] ?? '').split('/').filter(Boolean).join('/');
  return rest ? `${drive}:/${rest}` : `${drive}:/`;
}

function mirrorBuild(profile) {
  if (!existsSync(buildAddon)) {
    fail('build/addon is missing. Run npm run build first.');
  }

  const mirror = join(profile, 'zotero-neo-dev');
  const staging = join(profile, `.zotero-neo-dev-staging-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  cpSync(buildAddon, staging, { recursive: true });
  rmSync(mirror, { recursive: true, force: true });
  renameSync(staging, mirror);
  return mirror;
}

export function stripExtensionCachePrefs(source) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const trailingEol = source.endsWith('\n');
  const filtered = source
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.includes('extensions.lastAppBuildId') && !line.includes('extensions.lastAppVersion'),
    );
  let output = filtered.join(eol);
  if (!trailingEol && output.endsWith(eol)) {
    output = output.slice(0, -eol.length);
  }
  return output;
}

function preparePrefs(profile) {
  const prefs = join(profile, 'prefs.js');
  if (!existsSync(prefs)) {
    console.warn(`[dev-gui] prefs.js not found; skipping extension-cache reset: ${prefs}`);
    return;
  }

  const original = readFileSync(prefs, 'utf8');
  const cleaned = stripExtensionCachePrefs(original);
  if (cleaned === original) return;

  const backup = join(profile, 'prefs.js.zotero-neo-dev.bak');
  if (!existsSync(backup)) copyFileSync(prefs, backup);
  writeFileSync(prefs, cleaned);
}

function installProxy(profile, mirror) {
  const extensionsDir = join(profile, 'extensions');
  mkdirSync(extensionsDir, { recursive: true });
  const proxy = join(extensionsDir, ADDON_ID);
  const target = wslMountPathToWindows(mirror);
  writeFileSync(proxy, `${target}\n`);
  return { proxy, target };
}

function expectedProxyTarget(profile) {
  return wslMountPathToWindows(join(profile, 'zotero-neo-dev'));
}

function proxyStatus(profile) {
  const proxy = join(profile, 'extensions', ADDON_ID);
  const target = expectedProxyTarget(profile);
  if (!existsSync(proxy)) return { proxy, target, ok: false, actual: null };
  const actual = readFileSync(proxy, 'utf8').trim();
  return { proxy, target, ok: actual === target, actual };
}

function setup(profile) {
  console.log('[dev-gui] Close Zotero before first-time setup so prefs.js is not overwritten.');
  const mirror = mirrorBuild(profile);
  const proxy = installProxy(profile, mirror);
  preparePrefs(profile);
  writeLocalConfig(profile);
  console.log(`[dev-gui] profile: ${profile}`);
  console.log(`[dev-gui] mirror:  ${mirror}`);
  console.log(`[dev-gui] proxy:   ${proxy.proxy} -> ${proxy.target}`);
  console.log('[dev-gui] Setup complete. Start Zotero manually once to register the proxy add-on.');
}

function sync(profile) {
  const proxy = proxyStatus(profile);
  if (!proxy.ok) {
    fail(
      `Development proxy is not configured for this profile. Run npm run dev:setup -- --profile "${profile}" first.`,
    );
  }

  const mirror = mirrorBuild(profile);
  console.log(`[dev-gui] synced build/addon -> ${mirror}`);
  console.log('[dev-gui] Restart/reload Zotero manually, then perform GUI acceptance.');
}

function status(profile) {
  const mirror = join(profile, 'zotero-neo-dev');
  const proxy = proxyStatus(profile);
  const log = join(profile, 'zotero-neo-startup.log');
  console.log(
    JSON.stringify(
      {
        profile,
        mirror,
        mirrorExists: existsSync(mirror),
        proxy: proxy.proxy,
        proxyTarget: proxy.target,
        proxyActual: proxy.actual,
        proxyOk: proxy.ok,
        startupLog: log,
        startupLogExists: existsSync(log),
      },
      null,
      2,
    ),
  );
}

const { command, profile: explicitProfile } = parseArgs(process.argv.slice(2));
const profile = resolveProfile(explicitProfile);

if (command === 'setup') setup(profile);
if (command === 'sync') sync(profile);
if (command === 'status') status(profile);
