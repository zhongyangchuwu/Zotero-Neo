import { afterEach, expect, it, vi } from 'vitest';
import { readReferenceKey } from '../../src/platform/reference-credentials';
import { createReferenceMetadataService } from '../../src/references/metadata';

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

it('orders a deferred save before a later forget across services', async () => {
  const { logins, manager } = loginManager();
  const deferred = Promise.withResolvers<void>();
  manager.addLoginAsync.mockImplementationOnce(async (login) => {
    await deferred.promise;
    logins.push(login);
  });
  const first = createReferenceMetadataService();
  const second = createReferenceMetadataService();
  const save = first.setSemanticScholarKey('secret');
  await Promise.resolve();
  const forget = second.setSemanticScholarKey(null);
  expect(manager.findLogins).toHaveBeenCalledTimes(1);
  deferred.resolve();
  await Promise.all([save, forget]);
  expect(logins).toEqual([]);
  expect(readReferenceKey()).toBe('');
});

it('applies overlapping saves in invocation order across services', async () => {
  const { logins, manager } = loginManager();
  const deferred = Promise.withResolvers<void>();
  manager.addLoginAsync.mockImplementationOnce(async (login) => {
    await deferred.promise;
    logins.push(login);
  });
  const first = createReferenceMetadataService();
  const second = createReferenceMetadataService();
  const save1 = first.setSemanticScholarKey('first');
  await Promise.resolve();
  const save2 = second.setSemanticScholarKey('second');
  const save3 = first.setSemanticScholarKey('third');
  deferred.resolve();
  await Promise.all([save1, save2, save3]);
  expect(logins.map((login) => login.password)).toEqual(['third']);
});

it('exposes a mutation failure without blocking the next mutation', async () => {
  const { manager } = loginManager();
  manager.addLoginAsync.mockRejectedValueOnce(new Error('storage failed'));
  const first = createReferenceMetadataService();
  const second = createReferenceMetadataService();
  const failed = first.setSemanticScholarKey('first');
  const succeeded = second.setSemanticScholarKey('second');
  await expect(failed).rejects.toThrow('storage failed');
  await succeeded;
  expect(readReferenceKey()).toBe('second');
});
