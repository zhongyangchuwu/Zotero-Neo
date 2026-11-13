const ORIGIN = 'chrome://zotero-neo';
const REALM = 'Reference Semantic Scholar';
const USERNAME = 'semantic-scholar';

interface LoginManager {
  findLogins(origin: string, action: null, realm: string): nsILoginInfo[];
  addLoginAsync(login: nsILoginInfo): Promise<unknown>;
  modifyLogin(old: nsILoginInfo, next: nsILoginInfo): void;
  removeLogin(login: nsILoginInfo): void;
}
const manager = (): LoginManager => Services.logins as unknown as LoginManager;
const find = (): nsILoginInfo[] =>
  manager()
    .findLogins(ORIGIN, null, REALM)
    .filter((login) => login.username === USERNAME);

export function readReferenceKey(): string {
  return find()[0]?.password ?? '';
}

let mutationQueue: Promise<void> = Promise.resolve();

export function changeReferenceKey(value: string | null): Promise<void> {
  const mutation = mutationQueue.then(() => updateReferenceKey(value));
  mutationQueue = mutation.catch(() => {});
  return mutation;
}

async function updateReferenceKey(value: string | null): Promise<void> {
  const previous = find();
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
  initialize.call(login, ORIGIN, null, REALM, USERNAME, value, '', '');
  if (previous[0]) manager().modifyLogin(previous[0], login);
  else await manager().addLoginAsync(login);
  for (const duplicate of previous.slice(1)) manager().removeLogin(duplicate);
}
