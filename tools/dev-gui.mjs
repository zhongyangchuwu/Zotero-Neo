import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { connectRDP, findAddon, installTemporaryAddon, reloadAddon } from './dev-rdp-client.mjs';

const ADDON_ID = 'zotero-neo@zotero-neo';
const DEFAULT_DEBUG_PORT = 6101;
const root = resolve(import.meta.dirname, '..');
const buildAddon = resolve(root, 'build/addon');
const localConfigPath = resolve(root, '.zotero-neo-dev.json');
const defaultZoteroExecutable = '/mnt/c/Program Files/Zotero/zotero.exe';

function fail(message) {
  console.error(`[dev-gui] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = argv[0] ?? 'status';
  let profile = null;

  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--profile') {
      profile = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    fail(`Unknown argument: ${argv[i]}`);
  }

  if (!['setup', 'start', 'reload', 'status'].includes(command)) {
    fail(`Unknown command: ${command}`);
  }
  return { command, profile };
}

function readConfig() {
  if (!existsSync(localConfigPath)) return {};
  try {
    return JSON.parse(readFileSync(localConfigPath, 'utf8'));
  } catch (error) {
    fail(`Cannot read ${localConfigPath}: ${String(error)}`);
  }
}

function writeConfig(config) {
  writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function parseProfilesIni(source) {
  const profiles = [];
  let current = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      current = { section: line.slice(1, -1), values: {} };
      profiles.push(current);
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 0 || !current) continue;
    current.values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return profiles.filter((profile) => profile.section.startsWith('Profile'));
}

function profileName(profilePath) {
  const profilesIni = resolve(profilePath, '..', '..', 'profiles.ini');
  if (!existsSync(profilesIni)) {
    fail(`Cannot find profiles.ini for ${profilePath}`);
  }
  const base = dirname(profilesIni);
  const match = parseProfilesIni(readFileSync(profilesIni, 'utf8')).find((profile) => {
    const raw = profile.values.Path;
    if (!raw) return false;
    const candidate = profile.values.IsRelative === '0' ? resolve(raw) : resolve(base, raw);
    return candidate === resolve(profilePath);
  });
  if (!match?.values.Name) fail(`Cannot resolve Zotero profile name for ${profilePath}`);
  return match.values.Name;
}

function resolveProfile(explicitProfile, config) {
  const raw = explicitProfile ?? process.env.ZOTERO_NEO_DEV_PROFILE ?? config.profile ?? null;
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

function wslPathToWindows(path) {
  const normalized = resolve(path);
  const match = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/.exec(normalized);
  if (!match) throw new Error(`Expected Windows-mounted path, got: ${normalized}`);
  const drive = match[1].toUpperCase();
  const rest = (match[2] ?? '').split('/').filter(Boolean).join('/');
  return rest ? `${drive}:/${rest}` : `${drive}:/`;
}

function upsertPrefs(profile) {
  const prefsPath = join(profile, 'prefs.js');
  const source = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : '';
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const prefs = new Map([
    ['devtools.debugger.remote-enabled', 'true'],
    ['devtools.debugger.remote-websocket', 'true'],
    ['devtools.debugger.prompt-connection', 'false'],
    ['extensions.experiments.enabled', 'true'],
    ['extensions.autoDisableScopes', '0'],
    ['xpinstall.signatures.required', 'false'],
  ]);
  const seen = new Set();
  const lines = source.split(/\r?\n/).map((line) => {
    for (const [key, value] of prefs) {
      if (!line.startsWith(`user_pref("${key}",`)) continue;
      seen.add(key);
      return `user_pref("${key}", ${value});`;
    }
    return line;
  });
  for (const [key, value] of prefs) {
    if (!seen.has(key)) lines.push(`user_pref("${key}", ${value});`);
  }
  writeFileSync(prefsPath, `${lines.filter(Boolean).join(eol)}${eol}`);
}

function mirrorBuild(profile) {
  if (!existsSync(buildAddon)) fail('build/addon is missing. Run npm run build first.');
  const mirror = join(profile, 'zotero-neo-rdp');
  const staging = join(profile, `.zotero-neo-rdp-staging-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  cpSync(buildAddon, staging, { recursive: true });
  rmSync(mirror, { recursive: true, force: true });
  renameSync(staging, mirror);
  return mirror;
}

function normalizedConfig(explicitProfile) {
  const previous = readConfig();
  const profile = resolveProfile(explicitProfile, previous);
  const name = profileName(profile);
  const zoteroExecutable =
    process.env.ZOTERO_NEO_ZOTERO_EXE ?? previous.zoteroExecutable ?? defaultZoteroExecutable;
  if (!existsSync(zoteroExecutable)) {
    fail(`Zotero executable not found: ${zoteroExecutable}`);
  }
  return {
    profile,
    profileName: name,
    debugPort: Number(process.env.ZOTERO_NEO_DEV_PORT ?? previous.debugPort ?? DEFAULT_DEBUG_PORT),
    zoteroExecutable,
  };
}

async function setup(explicitProfile) {
  const config = normalizedConfig(explicitProfile);
  upsertPrefs(config.profile);
  const mirror = mirrorBuild(config.profile);
  writeConfig(config);
  console.log(`[dev-gui] profile: ${config.profileName} -> ${config.profile}`);
  console.log(`[dev-gui] RDP port: ${config.debugPort}`);
  console.log(`[dev-gui] mirror: ${mirror}`);
  console.log(
    '[dev-gui] Setup complete. Close any running dev-profile Zotero once, then run npm run dev:start.',
  );
}

async function start() {
  const config = normalizedConfig(null);
  upsertPrefs(config.profile);
  const mirror = mirrorBuild(config.profile);
  writeConfig(config);

  try {
    const existing = await connectRDP(config.debugPort, 1, 0);
    existing.disconnect();
    fail(`RDP port ${config.debugPort} is already in use. The dev Zotero may already be running.`);
  } catch {}

  const args = [
    '-no-remote',
    '-p',
    config.profileName,
    '-purgecaches',
    '-start-debugger-server',
    String(config.debugPort),
    '-ZoteroDebugText',
  ];
  const child = spawn(config.zoteroExecutable, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const client = await connectRDP(config.debugPort);
  try {
    const addon = await installTemporaryAddon(client, wslPathToWindows(mirror));
    console.log(
      `[dev-gui] Zotero started with temporary ${addon?.id ?? ADDON_ID} on RDP port ${config.debugPort}`,
    );
  } finally {
    client.disconnect();
  }
}

async function reload() {
  const config = normalizedConfig(null);
  const mirror = mirrorBuild(config.profile);
  const client = await connectRDP(config.debugPort, 3, 250).catch(() => null);
  if (!client) {
    fail('The dev Zotero RDP server is not running. Run npm run dev:start once.');
  }
  try {
    const addon = await findAddon(client, ADDON_ID);
    if (!addon?.temporarilyInstalled) {
      await installTemporaryAddon(client, wslPathToWindows(mirror));
      console.log(`[dev-gui] installed temporary ${ADDON_ID}`);
    } else {
      await reloadAddon(client, ADDON_ID);
      console.log(`[dev-gui] reloaded ${ADDON_ID}`);
    }
  } finally {
    client.disconnect();
  }
}

async function status() {
  const config = normalizedConfig(null);
  const mirror = join(config.profile, 'zotero-neo-rdp');
  const log = join(config.profile, 'zotero-neo-startup.log');
  let rdpOnline = false;
  let addon = null;
  const client = await connectRDP(config.debugPort, 1, 0).catch(() => null);
  if (client) {
    rdpOnline = true;
    try {
      addon = await findAddon(client, ADDON_ID);
    } finally {
      client.disconnect();
    }
  }
  console.log(
    JSON.stringify(
      {
        profile: config.profile,
        profileName: config.profileName,
        debugPort: config.debugPort,
        mirror,
        mirrorExists: existsSync(mirror),
        rdpOnline,
        addonPresent: !!addon,
        temporary: addon?.temporarilyInstalled ?? null,
        addonURL: addon?.url ?? null,
        startupLog: log,
        startupLogExists: existsSync(log),
      },
      null,
      2,
    ),
  );
}

const { command, profile } = parseArgs(process.argv.slice(2));
if (command === 'setup') await setup(profile);
if (command === 'start') await start();
if (command === 'reload') await reload();
if (command === 'status') await status();
