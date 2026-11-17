import type {
  SettingState,
  SettingsOperationContext,
  SettingsValue,
} from '../settings-transfer/contracts';
import { SettingsTransferError } from '../settings-transfer/contracts';
import { assertSettingsCurrent, sameSettingState } from '../settings-transfer/document';
import { readMinerUToken, readSettledMinerUToken, saveMinerUToken } from './document-credentials';
import {
  readReferenceKey,
  readSettledReferenceKey,
  changeReferenceKey,
} from './reference-credentials';
import { readAICredential, readSettledAICredential, changeAICredential } from './ai-credentials';
import { normalizeAIEndpoint, normalizeAICredential } from '../ai/configuration-policy';
import {
  nativeResourceField,
  normalizeTransferFieldState,
} from '../settings-transfer/adapters/fields';

interface NativeStyle {
  styleID: string;
  title: string;
  source?: string;
  hidden: boolean;
  path: string;
  getXML(): string;
}
interface NativeLibrary {
  libraryID: number;
  libraryType: string;
}
interface NativeHost {
  version: string;
  Users: { userID: number | null };
  Libraries: { getAll(): NativeLibrary[]; userLibraryID: number };
  Groups: { getByLibraryID(id: number): { groupID: number } };
  SyncedSettings: {
    get(id: number, key: string): SettingsValue;
    set(id: number, key: string, value: SettingsValue): Promise<unknown>;
    clear(id: number, key: string): Promise<unknown>;
  };
  DB: {
    queryAsync(sql: string, params?: readonly unknown[]): Promise<Record<string, string>[]>;
    executeTransaction(task: () => Promise<void>): Promise<void>;
  };
  QuickCopy: { loadSiteSettings(): Promise<void>; uninit(): void };
  LocateManager: {
    getEngines(): Record<string, SettingsValue>[];
    init(): Promise<void>;
    _needsMigration?: boolean;
  };
  DataDirectory: { dir: string };
  Styles: {
    initialized(): boolean;
    getAll(): Record<string, NativeStyle>;
    validate(xml: string): Promise<void>;
    get(id: string, skipMappings?: boolean): NativeStyle | false;
  };
  Style: new (xml: string) => NativeStyle;
  getStylesDirectory(): { path: string };
  Utilities: { Internal: { md5(value: string): string } };
  File: { getContents(path: string): string; getResourceAsync(uri: string): Promise<string> };
  OSKeyStore?: {
    encrypt(value: string): Promise<string>;
    decrypt(value: string): Promise<string>;
    isEncrypted(value: string): boolean;
  };
}
const native = (): NativeHost => Zotero as unknown as NativeHost;
// Native style refresh performs unrelated cleanup. Persist selected XML now; activate at restart.
const stagedStyles = new WeakMap<NativeHost, Map<string, NativeStyle>>();
const renamedStyles = new WeakMap<NativeHost, Readonly<Record<string, string>>>();
const deferredQuickCopy = new WeakSet<NativeHost>();
function styleForTransfer(id: string): NativeStyle | undefined {
  const host = native();
  return stagedStyles.get(host)?.get(id) || host.Styles.getAll()[id];
}
interface TransferIO {
  writeUTF8(path: string, text: string, options: { tmpPath: string }): Promise<unknown>;
  makeDirectory(path: string, options: { ignoreExisting: boolean }): Promise<void>;
}
function io(): TransferIO {
  if (typeof IOUtils === 'undefined') Components.utils.importGlobalProperties(['IOUtils']);
  return IOUtils as unknown as TransferIO;
}
function joinNativePath(base: string, ...parts: string[]): string {
  const file = Zotero.File.pathToFile(base).clone();
  for (const part of parts) file.append(part);
  return file.path;
}
export const nativeSettingsVersion = (): string => native().version;
export async function prepareNativeSettingsTransfer(
  context: SettingsOperationContext,
): Promise<void> {
  const host = native();
  if (!host.Styles.initialized())
    throw new SettingsTransferError('native-unavailable', 'Native citation styles are not loaded');
  if (!renamedStyles.has(host)) {
    const mappings: unknown = JSON.parse(
      await host.File.getResourceAsync('resource://zotero/schema/renamed-styles.json'),
    );
    if (
      !mappings ||
      typeof mappings !== 'object' ||
      Array.isArray(mappings) ||
      Object.values(mappings).some((value) => typeof value !== 'string')
    )
      throw new SettingsTransferError(
        'native-unavailable',
        'Native style mappings are unavailable',
      );
    assertSettingsCurrent(context);
    renamedStyles.set(host, mappings as Record<string, string>);
  }
  assertSettingsCurrent(context);
}
export function nativeStyleCollision(id: string, selectedIDs: readonly string[] = []): boolean {
  const mappings = renamedStyles.get(native());
  if (!mappings)
    throw new SettingsTransferError('native-unavailable', 'Native style mappings are unavailable');
  const prefix = 'http://www.zotero.org/styles/';
  return Object.entries(mappings).some(([oldName, newName]) => {
    const oldID = prefix + oldName,
      newID = prefix + newName;
    return (
      (id === oldID && (!!styleForTransfer(newID) || selectedIDs.includes(newID))) ||
      (id === newID && (!!styleForTransfer(oldID) || selectedIDs.includes(oldID)))
    );
  });
}
export function nativeStyleAvailable(id: string, activeOnly = false): boolean {
  return !!(activeOnly ? native().Styles.get(id) : styleForTransfer(id) || native().Styles.get(id));
}
export function nativeStylePendingActivation(id: string, visited = new Set<string>()): boolean {
  if (visited.has(id)) return false;
  visited.add(id);
  const style = styleForTransfer(id);
  return (
    !!stagedStyles.get(native())?.has(id) ||
    !!(style?.source && nativeStylePendingActivation(style.source, visited))
  );
}
export function nativeConsumerStyleDependencies(
  key: string,
  state: SettingState,
): readonly string[] {
  if (state.kind !== 'set') return [];
  const formats =
    key === 'quickCopy:sites'
      ? (state.value as readonly { format: string }[]).map((row) => row.format)
      : key === 'export.quickCopy.setting' || key === 'export.noteQuickCopy.setting'
        ? [state.value]
        : [];
  return formats.flatMap((format) => {
    if (typeof format !== 'string') return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(format);
    } catch {
      const match = /^(bibliography|export)(?:\/[^=]+)?=(.+)$/u.exec(format);
      return match?.[1] === 'bibliography' ? [match[2]!] : [];
    }
    return parsed &&
      typeof parsed === 'object' &&
      'mode' in parsed &&
      parsed.mode === 'bibliography' &&
      'id' in parsed &&
      typeof parsed.id === 'string'
      ? [parsed.id]
      : [];
  });
}
function prepareConsumerWrite(key: string, state: SettingState, retireObservers = false): boolean {
  const host = native();
  const dependencies = nativeConsumerStyleDependencies(key, state);
  if (dependencies.some((id) => !nativeStyleAvailable(id)))
    throw new SettingsTransferError(
      'missing-style',
      'A required citation style has not been restored',
    );
  const defer = dependencies.some((id) => nativeStylePendingActivation(id));
  if (defer && retireObservers && !deferredQuickCopy.has(host)) {
    host.QuickCopy.uninit();
    deferredQuickCopy.add(host);
  }
  return defer;
}
export function userPreferenceKeys(prefix: string): readonly string[] {
  return Services.prefs.getChildList(prefix).filter((key) => Services.prefs.prefHasUserValue(key));
}
export function nativeShortcutKeys(): readonly string[] {
  return Services.prefs.getDefaultBranch('').getChildList('extensions.zotero.keys.');
}
export function webDAVPasswordKey(): string {
  const username = readTransferPreference('extensions.zotero.sync.storage.username');
  return `webdav:password:${encodeURIComponent(username.kind === 'set' ? String(username.value) : '')}`;
}
export function readTransferPreference(key: string): SettingState {
  if (!Services.prefs.prefHasUserValue(key)) return { kind: 'reset' };
  const type = Services.prefs.getPrefType(key);
  const value =
    type === 128
      ? Services.prefs.getBoolPref(key)
      : type === 64
        ? Services.prefs.getIntPref(key)
        : Services.prefs.getStringPref(key);
  return { kind: 'set', value };
}
export function writeTransferPreference(key: string, state: SettingState, admit: () => void): void {
  admit();
  if (key.startsWith('extensions.zotero.'))
    prepareConsumerWrite(key.slice('extensions.zotero.'.length), state, true);
  if (state.kind === 'reset') {
    if (Services.prefs.prefHasUserValue(key)) Services.prefs.clearUserPref(key);
  } else if (typeof state.value === 'boolean') Services.prefs.setBoolPref(key, state.value);
  else if (typeof state.value === 'number') {
    if (!Number.isInteger(state.value) || state.value < -2147483648 || state.value > 2147483647)
      throw new SettingsTransferError('invalid-field', 'Invalid numeric preference value');
    Services.prefs.setIntPref(key, state.value);
  } else if (typeof state.value === 'string') Services.prefs.setStringPref(key, state.value);
  else throw new SettingsTransferError('invalid-field', 'Invalid preference value');
  if (!sameSettingState(readTransferPreference(key), state))
    throw new SettingsTransferError('native-outcome', 'The selected preference did not persist');
  if (key.startsWith('extensions.zotero.sync.storage.'))
    Services.prefs.setBoolPref('extensions.zotero.sync.storage.verified', false);
}
export function ownedAIEndpoint(): string {
  const state = readTransferPreference('extensions.zotero-neo.ai.configuration');
  if (state.kind !== 'set' || typeof state.value !== 'string') return '';
  try {
    const value = JSON.parse(state.value) as { endpoint?: unknown };
    return typeof value.endpoint === 'string' ? normalizeAIEndpoint(value.endpoint) : '';
  } catch {
    return '';
  }
}
export function readTransferCredential(key: string): string {
  if (key === 'secret:mineru') return readMinerUToken();
  if (key === 'secret:semantic-scholar') return readReferenceKey();
  if (key.startsWith('secret:ai:')) return readAICredential(normalizeAIEndpoint(key.slice(10)));
  throw new SettingsTransferError('invalid-field', 'Unknown credential');
}
export async function readSettledTransferCredential(key: string): Promise<string> {
  if (key === 'secret:mineru') return readSettledMinerUToken();
  if (key === 'secret:semantic-scholar') return readSettledReferenceKey();
  if (key.startsWith('secret:ai:'))
    return readSettledAICredential(normalizeAIEndpoint(key.slice(10)));
  return readTransferCredential(key);
}
export function writeTransferCredential(
  key: string,
  value: string,
  admit: () => void,
): Promise<void> {
  if (key === 'secret:mineru') return saveMinerUToken(value, admit);
  if (key === 'secret:semantic-scholar') return changeReferenceKey(value || null, admit);
  if (key.startsWith('secret:ai:'))
    return changeAICredential(
      normalizeAIEndpoint(key.slice(10)),
      value ? normalizeAICredential(value) : null,
      admit,
    );
  return Promise.reject(new SettingsTransferError('invalid-field', 'Unknown credential'));
}
export function nativeLibraryKeys(): readonly { identity: string; id: number }[] {
  const host = native();
  if (!host.Users.userID) return [];
  return host.Libraries.getAll().flatMap((library) =>
    library.libraryType === 'user'
      ? [{ identity: `user:${host.Users.userID}`, id: library.libraryID }]
      : library.libraryType === 'group'
        ? [
            {
              identity: `group:${host.Groups.getByLibraryID(library.libraryID).groupID}`,
              id: library.libraryID,
            },
          ]
        : [],
  );
}
export function nativeCustomThemeExists(id: string): boolean {
  const host = native();
  const themes = host.SyncedSettings.get(host.Libraries.userLibraryID, 'readerCustomThemes');
  return (
    Array.isArray(themes) &&
    themes.some(
      (theme) => theme !== null && typeof theme === 'object' && 'id' in theme && theme.id === id,
    )
  );
}
function librarySlot(key: string): { id: number; name: string } {
  const match =
    /^library:((?:user|group):[1-9][0-9]*):(tagColors|readerCustomThemes|attachmentRenameTemplate|autoRenameFiles|autoRenameFilesFileTypes)$/u.exec(
      key,
    );
  const library = match && nativeLibraryKeys().find((item) => item.identity === match[1]);
  if (!match || !library)
    throw new SettingsTransferError(
      'library-identity',
      'The source library identity does not match this account',
    );
  return { id: library.id, name: match[2]! };
}
export async function readNativeResource(key: string): Promise<SettingState> {
  const host = native();
  if (key.startsWith('webdav:password:')) {
    const password = await readWebDAVPassword(key);
    return password ? { kind: 'set', value: password } : { kind: 'reset' };
  }
  if (key === 'quickCopy:sites') {
    const rows = await host.DB.queryAsync(
      "SELECT key AS domainPath, value AS format FROM settings WHERE setting='quickCopySite' ORDER BY key",
    );
    return normalizeTransferFieldState(nativeResourceField(key)!, {
      kind: 'set',
      value: rows.map((row) => ({ domainPath: row.domainPath!, format: row.format! })),
    });
  }
  if (key === 'locate:engines') return { kind: 'set', value: portableLocateEngines() };
  if (key.startsWith('library:')) {
    const slot = librarySlot(key);
    const value = host.SyncedSettings.get(slot.id, slot.name);
    return value === null ? { kind: 'reset' } : { kind: 'set', value };
  }
  if (key.startsWith('csl:')) {
    const style = styleForTransfer(key.slice(4));
    if (!style) return { kind: 'reset' };
    return {
      kind: 'set',
      value: {
        id: style.styleID,
        title: style.title,
        source: style.source || '',
        hidden: !!style.hidden,
        text: host.File.getContents(style.path),
      },
    };
  }
  throw new SettingsTransferError('invalid-field', 'Unknown native resource');
}
export function nativeStyleKeys(): readonly string[] {
  const host = native();
  return [
    ...new Set([...Object.keys(host.Styles.getAll()), ...(stagedStyles.get(host)?.keys() || [])]),
  ].map((id) => `csl:${id}`);
}
export function matchesNativeLibrary(key: string): boolean {
  try {
    librarySlot(key);
    return true;
  } catch {
    return false;
  }
}

/** Recheck after asynchronous preparation, and again inside native DB transaction admission. */
export async function writeNativeResource(
  key: string,
  state: SettingState,
  before: SettingState,
  context: SettingsOperationContext,
): Promise<void> {
  const host = native();
  if (key.startsWith('webdav:password:')) {
    const username = decodeURIComponent(key.slice(16));
    const password = state.kind === 'reset' ? '' : String(state.value);
    const encrypted =
      host.OSKeyStore && password ? await host.OSKeyStore.encrypt(password) : password;
    const snapshot = webDAVLoginSnapshot(username);
    const current = await readNativeResource(key);
    assertSettingsCurrent(context);
    if (!sameSettingState(current, before))
      throw new SettingsTransferError('conflict', 'The target setting changed after preview');
    if (webDAVLoginSnapshot(username) !== snapshot)
      throw new SettingsTransferError('conflict', 'The target credential changed during admission');
    const manager = Services.logins as unknown as TransferLogins;
    const realm = host.OSKeyStore ? 'Zotero Storage Server (encrypted)' : 'Zotero Storage Server';
    const previous = manager
      .findLogins('chrome://zotero', null, realm)
      .filter((login) => login.username === username);
    if (password) {
      const classes = Components.classes as unknown as Record<
        string,
        { createInstance(iid: unknown): nsILoginInfo }
      >;
      const login = classes['@mozilla.org/login-manager/loginInfo;1']!.createInstance(
        Components.interfaces.nsILoginInfo,
      );
      const initialize = login.init as unknown as (
        origin: string,
        action: null,
        realm: string,
        username: string,
        password: string,
        userField: string,
        passwordField: string,
      ) => void;
      initialize.call(login, 'chrome://zotero', null, realm, username, encrypted, '', '');
      if (previous[0]) manager.modifyLogin(previous[0], login);
      else await manager.addLoginAsync(login);
      for (const duplicate of previous.slice(1)) manager.removeLogin(duplicate);
    } else for (const login of previous) manager.removeLogin(login);
    if (host.OSKeyStore)
      for (const legacy of manager
        .findLogins('chrome://zotero', null, 'Zotero Storage Server')
        .filter((login) => login.username === username))
        manager.removeLogin(legacy);
    Services.prefs.setBoolPref('extensions.zotero.sync.storage.verified', false);
    return;
  }
  const admit = async (mutate: () => Promise<unknown>): Promise<void> => {
    const current = await readNativeResource(key);
    assertSettingsCurrent(context);
    if (!sameSettingState(current, before))
      throw new SettingsTransferError('conflict', 'The target setting changed after preview');
    await mutate();
  };
  if (key === 'locate:engines' && state.kind === 'set') {
    if (host.LocateManager._needsMigration)
      throw new SettingsTransferError('native-unavailable', 'Native Locate migration is pending');
    const path = joinNativePath(host.DataDirectory.dir, 'locate', 'engines.json');
    assertSettingsCurrent(context);
    await io().makeDirectory(Zotero.File.pathToFile(path).parent.path, { ignoreExisting: true });
    assertSettingsCurrent(context);
    if (!sameSettingState({ kind: 'set', value: portableLocateEngines() }, before))
      throw new SettingsTransferError('conflict', 'The target setting changed after preview');
    await io().writeUTF8(path, JSON.stringify(state.value), { tmpPath: `${path}.tmp` });
    await host.LocateManager.init();
    if (
      !sameSettingState(await readNativeResource(key), state) ||
      host.File.getContents(path) !== JSON.stringify(state.value)
    )
      throw new SettingsTransferError(
        'native-outcome',
        'Locate settings did not persist as selected',
      );
    return;
  }
  if (key === 'quickCopy:sites') {
    let defer = false;
    await host.DB.executeTransaction(async () => {
      await admit(async () => {
        defer = prepareConsumerWrite(key, state);
        return host.DB.queryAsync("DELETE FROM settings WHERE setting='quickCopySite'");
      });
      if (state.kind === 'set')
        for (const row of state.value as readonly { domainPath: string; format: string }[]) {
          await host.DB.queryAsync(
            "INSERT INTO settings (setting,key,value) VALUES ('quickCopySite',?,?)",
            [row.domainPath, row.format],
          );
        }
    });
    if (!sameSettingState(await readNativeResource(key), state))
      throw new SettingsTransferError('native-outcome', 'Quick Copy site rules did not persist');
    if (!defer && !deferredQuickCopy.has(host)) await host.QuickCopy.loadSiteSettings();
    return;
  }
  if (key.startsWith('library:')) {
    await host.DB.executeTransaction(async () => {
      const slot = librarySlot(key);
      const value = host.SyncedSettings.get(slot.id, slot.name);
      assertSettingsCurrent(context);
      if (!sameSettingState(value === null ? { kind: 'reset' } : { kind: 'set', value }, before))
        throw new SettingsTransferError('conflict', 'The target setting changed after preview');
      if (state.kind === 'reset') await host.SyncedSettings.clear(slot.id, slot.name);
      else await host.SyncedSettings.set(slot.id, slot.name, state.value);
    });
    return;
  }
  if (key.startsWith('csl:') && state.kind === 'set') {
    const value = state.value as {
      id: string;
      title: string;
      source: string;
      text: string;
      hidden: boolean;
    };
    await host.Styles.validate(value.text);
    const parsed = new host.Style(value.text);
    if (
      parsed.styleID !== value.id ||
      parsed.styleID !== key.slice(4) ||
      parsed.title !== value.title ||
      (parsed.source || '') !== value.source ||
      (parsed.source && !styleForTransfer(parsed.source))
    )
      throw new SettingsTransferError(
        'invalid-field',
        'Invalid CSL metadata or missing parent style',
      );
    if (nativeStyleCollision(value.id))
      throw new SettingsTransferError(
        'style-collision',
        'Renamed citation styles require manual review',
      );
    const existing = styleForTransfer(value.id);
    if (existing && existing.hidden !== value.hidden)
      throw new SettingsTransferError(
        'manual-required',
        'Citation style visibility requires manual review',
      );
    const path =
      existing?.path ||
      joinNativePath(
        host.getStylesDirectory().path,
        ...(value.hidden ? ['hidden'] : []),
        `neo-transfer-${host.Utilities.Internal.md5(value.id)}.csl`,
      );
    assertSettingsCurrent(context);
    await io().makeDirectory(Zotero.File.pathToFile(path).parent.path, { ignoreExisting: true });
    assertSettingsCurrent(context);
    const latest = styleForTransfer(value.id);
    const current: SettingState = latest
      ? {
          kind: 'set',
          value: {
            id: latest.styleID,
            title: latest.title,
            source: latest.source || '',
            hidden: !!latest.hidden,
            text: host.File.getContents(latest.path),
          },
        }
      : { kind: 'reset' };
    if (!sameSettingState(current, before))
      throw new SettingsTransferError('conflict', 'The target setting changed after preview');
    if (latest && latest.path !== path)
      throw new SettingsTransferError('conflict', 'The target style path changed after preview');
    if (nativeStyleCollision(value.id))
      throw new SettingsTransferError(
        'style-collision',
        'Renamed citation styles require manual review',
      );
    await io().writeUTF8(path, value.text, { tmpPath: `${path}.tmp` });
    if (host.File.getContents(path) !== value.text)
      throw new SettingsTransferError(
        'native-outcome',
        'Citation style source did not persist as selected',
      );
    let staged = stagedStyles.get(host);
    if (!staged) stagedStyles.set(host, (staged = new Map()));
    parsed.path = path;
    parsed.hidden = value.hidden;
    staged.set(value.id, parsed);
    return;
  }
  throw new SettingsTransferError('manual-required', 'This native resource requires manual setup');
}

interface TransferLogins {
  findLogins(origin: string, action: null, realm: string): nsILoginInfo[];
  addLoginAsync(login: nsILoginInfo): Promise<unknown>;
  modifyLogin(old: nsILoginInfo, next: nsILoginInfo): void;
  removeLogin(login: nsILoginInfo): void;
}
async function readWebDAVPassword(key: string): Promise<string> {
  const username = decodeURIComponent(key.slice(16));
  const manager = Services.logins as unknown as TransferLogins;
  const legacy = manager
    .findLogins('chrome://zotero', null, 'Zotero Storage Server')
    .find((login) => login.username === username);
  if (legacy) return legacy.password;
  const password =
    manager
      .findLogins('chrome://zotero', null, 'Zotero Storage Server (encrypted)')
      .find((login) => login.username === username)?.password || '';
  const keystore = native().OSKeyStore;
  return password && keystore?.isEncrypted(password) ? keystore.decrypt(password) : password;
}

function portableLocateEngines(): SettingsValue {
  const value = native()
    .LocateManager.getEngines()
    .map((engine) => {
      const portable: Record<string, SettingsValue> = {};
      for (const [key, item] of Object.entries(engine))
        if (key !== 'icon' && key !== '_icon' && key !== '_iconSourceURI') portable[key] = item;
      if (engine._urlParams && typeof engine._urlParams === 'object')
        portable._urlParams = Object.fromEntries(Object.entries(engine._urlParams));
      return portable;
    });
  const state = normalizeTransferFieldState(nativeResourceField('locate:engines')!, {
    kind: 'set',
    value,
  });
  if (state.kind !== 'set')
    throw new SettingsTransferError('invalid-field', 'Invalid Locate settings');
  return state.value;
}
function webDAVLoginSnapshot(username: string): string {
  const manager = Services.logins as unknown as TransferLogins;
  return JSON.stringify(
    ['Zotero Storage Server', 'Zotero Storage Server (encrypted)'].map((realm) =>
      manager
        .findLogins('chrome://zotero', null, realm)
        .filter((login) => login.username === username)
        .map((login) => login.password),
    ),
  );
}
