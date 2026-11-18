import { vi } from 'vitest';
import type { SettingsValue } from '../../src/settings-snapshots/contracts';

/** OS boundary only: pref branches, named login identities, DB rows and file storage have native shapes. */
export function settingsSnapshotHostFixture() {
  const user = new Map<string, boolean | number | string>();
  const defaults = new Map<string, boolean | number | string>([
    ['extensions.zotero.automaticTags', true],
    ['extensions.zotero.fontSize', '1.00'],
    ...[
      'saveToZotero',
      'newItem',
      'newNote',
      'library',
      'quicksearch',
      'copySelectedItemCitationsToClipboard',
      'copySelectedItemsToClipboard',
      'sync',
      'toggleAllRead',
      'toggleRead',
      'showTabsMenu',
    ].map((key) => [`extensions.zotero.keys.${key}`, 'X'] as const),
  ]);
  const mutations: string[] = [];
  let quickCopyObserving = true;
  const childKeys = (source: Map<string, unknown>, prefix: string): string[] =>
    [...source.keys()].filter((key) => key.startsWith(prefix));
  const value = (key: string): boolean | number | string | undefined =>
    user.has(key) ? user.get(key) : defaults.get(key);
  function setUserPreference(key: string, setting: boolean | number | string): void {
    mutations.push(key);
    if (defaults.get(key) === setting) user.delete(key);
    else user.set(key, setting);
  }
  const prefs = {
    getChildList: (prefix: string) => [
      ...new Set([...childKeys(defaults, prefix), ...childKeys(user, prefix)]),
    ],
    getDefaultBranch: () => ({ getChildList: (prefix: string) => childKeys(defaults, prefix) }),
    prefHasUserValue: (key: string) => user.has(key),
    getPrefType: (key: string) =>
      typeof value(key) === 'boolean'
        ? 128
        : typeof value(key) === 'number'
          ? 64
          : typeof value(key) === 'string'
            ? 32
            : 0,
    getBoolPref: (key: string) => value(key),
    getIntPref: (key: string) => value(key),
    getStringPref: (key: string) => value(key),
    setBoolPref: setUserPreference,
    setIntPref: (key: string, setting: number) => setUserPreference(key, setting | 0),
    setStringPref: (key: string, setting: string) => {
      setUserPreference(key, setting);
      if (
        quickCopyObserving &&
        (key === 'extensions.zotero.export.quickCopy.setting' ||
          key === 'extensions.zotero.export.noteQuickCopy.setting')
      )
        preloadFormat(setting);
    },
    clearUserPref: (key: string) => {
      mutations.push(key);
      user.delete(key);
    },
  };
  const records: nsILoginInfo[] = [];
  const logins = {
    findLogins: vi.fn((origin: string, _action: null, realm: string) =>
      records.filter((login) => login.hostname === origin && login.httpRealm === realm),
    ),
    countLogins: (origin: string, _action: null, realm: string) =>
      records.filter((login) => login.hostname === origin && login.httpRealm === realm).length,
    addLoginAsync: vi.fn(async (login: nsILoginInfo) => {
      mutations.push('login:add');
      records.push(login);
    }),
    modifyLogin: vi.fn((previous: nsILoginInfo, login: nsILoginInfo) => {
      mutations.push('login:modify');
      records.splice(records.indexOf(previous), 1, login);
    }),
    removeLogin: vi.fn((login: nsILoginInfo) => {
      mutations.push('login:remove');
      records.splice(records.indexOf(login), 1);
    }),
  };
  vi.stubGlobal('Services', { prefs, logins });
  vi.stubGlobal('Components', {
    interfaces: { nsILoginInfo: {} },
    classes: {
      '@mozilla.org/login-manager/loginInfo;1': {
        createInstance: () => ({
          init(origin: string, _action: null, realm: string, username: string, password: string) {
            Object.assign(this, { hostname: origin, httpRealm: realm, username, password });
          },
        }),
      },
    },
  });
  const files = new Map<string, string>();
  const synced = new Map<string, SettingsValue>();
  const sites: { domainPath: string; format: string }[] = [];
  let engines: Record<string, SettingsValue>[] = [
    {
      _name: 'Scholar',
      _alias: 'Scholar',
      _description: '',
      _hidden: false,
      _urlTemplate: 'https://scholar.example/search?q={z:title}',
      _urlNamespaces: { z: 'http://www.zotero.org/namespaces/openSearch#' },
      _urlParams: [],
      _icon: 'file:///source-device/locate/scholar.ico',
    },
  ];
  const styles: Record<
    string,
    { styleID: string; title: string; source: string; hidden: boolean; path: string }
  > = {};
  const renamed: Record<string, string> = {};
  const preloaded: string[] = [];
  const liveSites: { domainPath: string; format: string }[] = [];
  function preloadFormat(format: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(format);
    } catch {
      const match = /^(bibliography|export)(?:\/[^=]+)?=(.+)$/u.exec(format);
      parsed = match ? { mode: match[1], id: match[2] } : {};
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'mode' in parsed &&
      parsed.mode === 'bibliography' &&
      'id' in parsed &&
      typeof parsed.id === 'string'
    ) {
      const prefix = 'http://www.zotero.org/styles/';
      const mapped = renamed[parsed.id.replace(prefix, '')];
      const id = mapped && styles[prefix + mapped] ? prefix + mapped : parsed.id;
      if (!styles[id]) throw new Error('Quick Copy style not loaded');
      preloaded.push(id);
    }
  }
  const parseStyle = (text: string) => ({
    styleID: /<id>(.*?)<\/id>/u.exec(text)?.[1] || '',
    title: /<title>(.*?)<\/title>/u.exec(text)?.[1] || '',
    source: /<link rel="independent-parent" href="(.*?)"/u.exec(text)?.[1] || '',
  });
  async function initializeStyles(): Promise<void> {
    const locale = user.get('extensions.zotero.export.bibliographyLocale');
    if (locale) {
      prefs.setStringPref('extensions.zotero.export.lastLocale', String(locale));
      prefs.setStringPref('extensions.zotero.export.quickCopy.locale', String(locale));
      prefs.clearUserPref('extensions.zotero.export.bibliographyLocale');
    }
    for (const id of Object.keys(styles)) delete styles[id];
    for (const [path, text] of files)
      if (path.endsWith('.csl')) {
        const style = parseStyle(text);
        styles[style.styleID] = { ...style, hidden: path.includes('/hidden/'), path };
      }
    const prefix = 'http://www.zotero.org/styles/';
    for (const [oldName, newName] of Object.entries(renamed)) {
      const oldID = prefix + oldName,
        newID = prefix + newName;
      if (styles[oldID] && styles[newID]) {
        files.delete(styles[oldID]!.path);
        delete styles[oldID];
      }
    }
  }
  const native = {
    version: '8.0.2',
    Users: { userID: 42 as number | null },
    ItemFields: {
      getAll: () => [
        { id: 1, name: 'title' },
        { id: 2, name: 'DOI' },
        { id: 3, name: 'publicationTitle' },
        { id: 4, name: 'date' },
      ],
    },
    CreatorTypes: {
      getAll: () => [
        { id: 1, name: 'author' },
        { id: 2, name: 'bookAuthor' },
        { id: 3, name: 'editor' },
      ],
    },
    Schema: {
      CSL_TEXT_MAPPINGS: {
        DOI: ['DOI'],
        title: ['title'],
        'container-title': ['publicationTitle'],
      },
      CSL_DATE_MAPPINGS: { issued: 'date' },
      CSL_NAME_MAPPINGS: { author: 'author', bookAuthor: 'container-author', editor: 'editor' },
    },
    Libraries: {
      userLibraryID: 1,
      getAll: () => [
        { libraryID: 1, libraryType: 'user' },
        { libraryID: 3, libraryType: 'group' },
      ],
    },
    Groups: { getByLibraryID: () => ({ groupID: 77 }) },
    SyncedSettings: {
      get: (id: number, key: string) => synced.get(`${id}:${key}`) ?? null,
      set: vi.fn(async (id: number, key: string, setting: SettingsValue) => {
        mutations.push(`library:${id}:${key}`);
        synced.set(`${id}:${key}`, setting);
      }),
      clear: vi.fn(async (id: number, key: string) => {
        mutations.push(`library:${id}:${key}`);
        synced.delete(`${id}:${key}`);
      }),
    },
    DB: {
      executeTransaction: vi.fn(async (task: () => Promise<void>) => {
        await task();
      }),
      queryAsync: vi.fn(async (sql: string, parameters?: readonly string[]) => {
        if (sql.startsWith('SELECT'))
          return [...sites].sort((a, b) => a.domainPath.localeCompare(b.domainPath));
        mutations.push('quickCopy:sites');
        if (sql.startsWith('DELETE')) sites.length = 0;
        else sites.push({ domainPath: parameters![0]!, format: parameters![1]! });
        return [];
      }),
    },
    QuickCopy: {
      uninit: vi.fn(() => {
        quickCopyObserving = false;
      }),
      init: vi.fn(async (): Promise<void> => {
        quickCopyObserving = true;
        for (const key of ['export.quickCopy.setting', 'export.noteQuickCopy.setting']) {
          const setting = value(`extensions.zotero.${key}`);
          if (typeof setting === 'string') preloadFormat(setting);
        }
        await native.QuickCopy.loadSiteSettings();
      }),
      loadSiteSettings: vi.fn(async () => {
        for (const row of sites) preloadFormat(row.format);
        liveSites.splice(0, liveSites.length, ...sites.map((row) => ({ ...row })));
      }),
    },
    LocateManager: {
      getEngines: () => engines,
      init: vi.fn(async () => {
        const records = JSON.parse(files.get('/fixture-data/locate/engines.json')!) as Record<
          string,
          SettingsValue
        >[];
        engines = records.map((record) => ({
          _alias: 'Untitled',
          _name: 'Untitled',
          _description: null,
          _icon: null,
          _hidden: false,
          _urlTemplate: null,
          _urlParams: [],
          ...record,
        }));
      }),
    },
    DataDirectory: { dir: '/fixture-data' },
    Styles: {
      initialized: vi.fn(() => true),
      init: vi.fn(initializeStyles),
      getAll: () => styles,
      get: (id: string, skipMappings = false) => {
        const prefix = 'http://www.zotero.org/styles/';
        const mapped = renamed[id.replace(prefix, '')];
        return (!skipMappings && mapped && styles[prefix + mapped]) || styles[id] || false;
      },
      validate: vi.fn(async (xml: string) => {
        if (!xml.includes('<style')) throw new Error('Invalid CSL');
      }),
      reinit: vi.fn(initializeStyles),
    },
    Style: class {
      styleID: string;
      title: string;
      source: string;
      constructor(text: string) {
        const style = parseStyle(text);
        this.styleID = style.styleID;
        this.title = style.title;
        this.source = style.source;
      }
    },
    getStylesDirectory: () => ({ path: '/fixture-data/styles' }),
    Utilities: {
      Internal: {
        md5: (text: string) => [...text].map((char) => char.charCodeAt(0).toString(16)).join(''),
        extractExtraFields: vi.fn((extra: string) => {
          const key = extra.slice(0, extra.indexOf(':')).toLowerCase();
          const field = ['title', 'doi', 'container title', 'issued', 'date'].includes(key);
          const creator = ['author', 'bookauthor', 'container-author', 'editor'].includes(key);
          return {
            itemType: key === 'type' ? 'book' : null,
            fields: field ? new Map([[key, 'x']]) : new Map<string, string>(),
            creators: creator ? [{ creatorType: 'author', name: 'x' }] : [],
            extra: field || creator || key === 'type' ? '' : extra,
          };
        }),
      },
    },
    File: {
      pathToFile: (path: string) => new FixtureFile(path),
      getResourceAsync: vi.fn(async (uri: string) => {
        if (uri !== 'resource://zotero/schema/renamed-styles.json')
          throw new Error('Unexpected resource read');
        return JSON.stringify(renamed);
      }),
      getContents: (path: string) => {
        const text = files.get(path);
        if (text === undefined) throw new Error('Missing fixture file');
        return text;
      },
    },
    OSKeyStore: {
      encrypt: vi.fn(async (text: string) => `encrypted:${text}`),
      decrypt: vi.fn(async (text: string) => text.slice(10)),
      isEncrypted: (text: string) => text.startsWith('encrypted:'),
    },
  };
  vi.stubGlobal('Zotero', native);
  const fileIO = {
    makeDirectory: vi.fn(async () => {}),
    writeUTF8: vi.fn(async (path: string, text: string, options: { tmpPath: string }) => {
      if (options.tmpPath !== `${path}.tmp`) throw new Error('Nonatomic fixture write');
      mutations.push(path);
      files.set(path, text);
    }),
  };
  vi.stubGlobal('IOUtils', fileIO);
  return {
    user,
    defaults,
    mutations,
    records,
    logins,
    files,
    fileIO,
    synced,
    sites,
    native,
    renamed,
    preloaded,
    liveSites,
  };
}

class FixtureFile {
  constructor(public path: string) {}
  clone(): FixtureFile {
    return new FixtureFile(this.path);
  }
  append(part: string): void {
    this.path += `/${part}`;
  }
  get parent(): FixtureFile {
    return new FixtureFile(this.path.slice(0, this.path.lastIndexOf('/')));
  }
}
