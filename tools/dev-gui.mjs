import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ADDON_ID = 'zotero-neo@zotero-neo';
const root = resolve(import.meta.dirname, '..');
const outputXpi = resolve(root, 'zotero-neo.xpi');
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

function installedXpi(profile) {
  return join(profile, 'extensions', `${ADDON_ID}.xpi`);
}

function registeredAddon(profile) {
  const registryPath = join(profile, 'extensions.json');
  if (!existsSync(registryPath)) return null;
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    return registry.addons?.find((addon) => addon.id === ADDON_ID) ?? null;
  } catch {
    return null;
  }
}

function requireInstalled(profile) {
  const xpi = installedXpi(profile);
  const addon = registeredAddon(profile);
  if (!existsSync(xpi) || !addon) {
    fail(
      'Zotero Neo is not registered in this development profile. Install zotero-neo.xpi once through Zotero Tools -> Plugins -> Install Add-on From File, then rerun dev:setup.',
    );
  }
  return { addon, xpi };
}

function setup(profile) {
  const { addon, xpi } = requireInstalled(profile);
  writeLocalConfig(profile);
  console.log(`[dev-gui] profile: ${profile}`);
  console.log(`[dev-gui] installed XPI: ${xpi}`);
  console.log(
    `[dev-gui] registered: ${addon.id} version=${addon.version} active=${!!addon.active}`,
  );
  console.log('[dev-gui] Setup complete. Future builds can use npm run dev.');
}

function sync(profile) {
  if (!existsSync(outputXpi)) {
    fail('zotero-neo.xpi is missing. Run npm run build first.');
  }
  const { addon, xpi } = requireInstalled(profile);
  copyFileSync(outputXpi, xpi);
  console.log(`[dev-gui] synced zotero-neo.xpi -> ${xpi}`);
  console.log(
    `[dev-gui] registered version=${addon.version}; restart/reload the dev Zotero instance.`,
  );
}

function status(profile) {
  const xpi = installedXpi(profile);
  const addon = registeredAddon(profile);
  const log = join(profile, 'zotero-neo-startup.log');
  console.log(
    JSON.stringify(
      {
        profile,
        installedXpi: xpi,
        installedXpiExists: existsSync(xpi),
        registered: !!addon,
        registeredVersion: addon?.version ?? null,
        active: addon?.active ?? null,
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
