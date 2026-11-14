import { afterEach, expect, it, vi } from 'vitest';
import {
  changeReferenceKey,
  readReferenceKey,
  readSettledReferenceKey,
} from '../../src/platform/reference-credentials';

function loginManager() {
  const logins: Array<{ username: string; password: string }> = [];
  class Login {
    username = '';
    password = '';
    init(_origin: string, _action: null, _realm: string, username: string, password: string) {
      this.username = username;
      this.password = password;
    }
  }
  const manager = {
    findLogins: vi.fn(() => [...logins]),
    addLoginAsync: vi.fn(async (login: Login) => {
      logins.push(login);
    }),
    modifyLogin: vi.fn((old: Login, next: Login) => {
      logins[logins.indexOf(old)] = next;
    }),
    removeLogin: vi.fn((login: Login) => {
      logins.splice(logins.indexOf(login), 1);
    }),
  };
  vi.stubGlobal('Services', { logins: manager });
  vi.stubGlobal('Components', {
    classes: { '@mozilla.org/login-manager/loginInfo;1': { createInstance: () => new Login() } },
    interfaces: { nsILoginInfo: {} },
  });
  return { logins, manager };
}
afterEach(() => vi.unstubAllGlobals());

it('orders a deferred save before a later clear from independent callers', async () => {
  const { logins, manager } = loginManager();
  const deferred = Promise.withResolvers<void>();
  manager.addLoginAsync.mockImplementationOnce(async (login) => {
    await deferred.promise;
    logins.push(login);
  });
  const save = changeReferenceKey('secret');
  await Promise.resolve();
  const forget = changeReferenceKey(null);
  deferred.resolve();
  await Promise.all([save, forget]);
  expect(logins).toEqual([]);
  expect(readReferenceKey()).toBe('');
});

it('applies overlapping saves in invocation order', async () => {
  const { logins, manager } = loginManager();
  const deferred = Promise.withResolvers<void>();
  manager.addLoginAsync.mockImplementationOnce(async (login) => {
    await deferred.promise;
    logins.push(login);
  });
  const save1 = changeReferenceKey('first');
  await Promise.resolve();
  const save2 = changeReferenceKey('second');
  const save3 = changeReferenceKey('third');
  deferred.resolve();
  await Promise.all([save1, save2, save3]);
  expect(logins.map((login) => login.password)).toEqual(['third']);
});

it('exposes a mutation failure without blocking the next mutation', async () => {
  const { manager } = loginManager();
  manager.addLoginAsync.mockRejectedValueOnce(new Error('storage failed'));
  const failed = changeReferenceKey('first');
  const succeeded = changeReferenceKey('second');
  await expect(failed).rejects.toThrow('storage failed');
  await succeeded;
  expect(readReferenceKey()).toBe('second');
});

it.each(['latest', ''])(
  'prefills the final admitted edit %j after an outstanding write',
  async (latest) => {
    const { logins, manager } = loginManager();
    const deferred = Promise.withResolvers<void>();
    manager.addLoginAsync.mockImplementationOnce(async (login) => {
      await deferred.promise;
      logins.push(login);
    });
    const first = changeReferenceKey('initial');
    await Promise.resolve();
    const prefill = readSettledReferenceKey();
    const last = changeReferenceKey(latest);
    deferred.resolve();
    await Promise.all([first, last]);
    expect(await prefill).toBe(latest);
  },
);
