const ORIGIN = 'chrome://zotero-neo';
const USERNAME = 'reader-ai';
interface LoginManager {
  countLogins(origin: string, action: null, realm: string): number;
  findLogins(origin: string, action: null, realm: string): nsILoginInfo[];
  addLoginAsync(login: nsILoginInfo): Promise<unknown>;
  modifyLogin(old: nsILoginInfo, next: nsILoginInfo): void;
  removeLogin(login: nsILoginInfo): void;
}
function manager(): LoginManager {
  return Services.logins as unknown as LoginManager;
}
function realm(endpoint: string): string {
  return `Reader AI ${endpoint}`;
}
function find(endpoint: string): nsILoginInfo[] {
  return manager()
    .findLogins(ORIGIN, null, realm(endpoint))
    .filter((login) => login.username === USERNAME);
}
export function hasAICredential(endpoint: string): boolean {
  return manager().countLogins(ORIGIN, null, realm(endpoint)) > 0;
}
export function readAICredential(endpoint: string): string {
  return find(endpoint)[0]?.password ?? '';
}
export async function changeAICredential(endpoint: string, value: string | null): Promise<void> {
  const previous = find(endpoint);
  if (value === null) {
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
  const initialize = login.init as unknown as (
    origin: string,
    action: null,
    realm: string,
    username: string,
    password: string,
    userField: string,
    passwordField: string,
  ) => void;
  initialize.call(login, ORIGIN, null, realm(endpoint), USERNAME, value, '', '');
  if (previous[0]) manager().modifyLogin(previous[0], login);
  else await manager().addLoginAsync(login);
  for (const duplicate of previous.slice(1)) manager().removeLogin(duplicate);
}
