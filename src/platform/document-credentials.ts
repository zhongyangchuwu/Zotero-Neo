const ORIGIN = 'chrome://zotero-neo';
const REALM = 'MinerU API';
const USERNAME = 'mineru';
interface LoginManager {
  findLogins(origin: string, action: null, realm: string): nsILoginInfo[];
  addLoginAsync(login: nsILoginInfo): Promise<unknown>;
  modifyLogin(old: nsILoginInfo, next: nsILoginInfo): void;
  removeLogin(login: nsILoginInfo): void;
}
function manager(): LoginManager {
  return Services.logins as unknown as LoginManager;
}
function logins(): nsILoginInfo[] {
  return manager()
    .findLogins(ORIGIN, null, REALM)
    .filter((login) => login.username === USERNAME);
}
let writing: Promise<void> = Promise.resolve();

/** Only explicit analysis/settings surfaces read this credential. Ordinary reading never opens password storage. */
export function readMinerUToken(): string {
  return logins()[0]?.password ?? '';
}

/** Store in Zotero's login manager, shared by single/batch analysis; never persist secrets as preferences or journal fields. */
export function saveMinerUToken(value: string): Promise<void> {
  const token = value.trim();
  if (token.length > 8192 || /[\r\n]/u.test(token))
    return Promise.reject(new Error('Invalid MinerU token'));
  const task = writing
    .catch(() => {})
    .then(async () => {
      const previous = logins();
      if (!token) {
        for (const login of previous) manager().removeLogin(login);
        return;
      }
      const classes = Components.classes as unknown as Record<
        string,
        { createInstance(iid: unknown): nsILoginInfo }
      >;
      const login = classes['@mozilla.org/login-manager/loginInfo;1'].createInstance(
        Components.interfaces.nsILoginInfo,
      );
      // XPIDL-generated declarations omit nullable strings; this is an HTTP-realm login, not a form login.
      const initialize = login.init as unknown as (
        origin: string,
        action: null,
        realm: string,
        username: string,
        password: string,
        userField: string,
        passwordField: string,
      ) => void;
      initialize.call(login, ORIGIN, null, REALM, USERNAME, token, '', '');
      if (previous[0]) manager().modifyLogin(previous[0], login);
      else await manager().addLoginAsync(login);
      for (const duplicate of previous.slice(1)) manager().removeLogin(duplicate);
    });
  writing = task;
  return task;
}
