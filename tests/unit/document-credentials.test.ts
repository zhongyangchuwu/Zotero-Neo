import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMinerUToken, saveMinerUToken } from '../../src/platform/document-credentials';

function harness() {
  const records: nsILoginInfo[] = [];
  const manager = {
    findLogins: vi.fn(() => records),
    addLoginAsync: vi.fn(async (login: nsILoginInfo) => {
      records.push(login);
    }),
    modifyLogin: vi.fn((previous: nsILoginInfo, login: nsILoginInfo) => {
      records.splice(records.indexOf(previous), 1, login);
    }),
    removeLogin: vi.fn((login: nsILoginInfo) => {
      records.splice(records.indexOf(login), 1);
    }),
  };
  vi.stubGlobal('Services', { logins: manager });
  vi.stubGlobal('Components', {
    interfaces: { nsILoginInfo: {} },
    classes: {
      '@mozilla.org/login-manager/loginInfo;1': {
        createInstance: () => ({
          init(
            this: Record<string, unknown>,
            origin: string,
            action: null,
            realm: string,
            username: string,
            password: string,
          ) {
            Object.assign(this, {
              origin,
              formActionOrigin: action,
              httpRealm: realm,
              username,
              password,
            });
          },
        }),
      },
    },
  });
  return { manager, records };
}
afterEach(() => vi.unstubAllGlobals());
describe('shared saved MinerU credential', () => {
  it('uses a dedicated login-manager identity, replacing the saved token and allowing explicit removal', async () => {
    const t = harness();
    expect(readMinerUToken()).toBe('');
    await saveMinerUToken(' first-token ');
    expect(readMinerUToken()).toBe('first-token');
    expect(t.manager.findLogins).toHaveBeenCalledWith('chrome://zotero-neo', null, 'MinerU API');
    expect(t.records[0]).toMatchObject({
      formActionOrigin: null,
      httpRealm: 'MinerU API',
      username: 'mineru',
    });
    await saveMinerUToken('second-token');
    expect(t.records).toHaveLength(1);
    expect(readMinerUToken()).toBe('second-token');
    await saveMinerUToken('');
    expect(t.records).toEqual([]);
    expect(readMinerUToken()).toBe('');
  });
  it('serializes simultaneous configuration saves and leaves other logins alone', async () => {
    const t = harness();
    const other = { username: 'other', password: 'untouched' } as nsILoginInfo;
    t.records.push(other);
    await Promise.all([saveMinerUToken('one'), saveMinerUToken('two'), saveMinerUToken('three')]);
    expect(readMinerUToken()).toBe('three');
    expect(t.manager.addLoginAsync).toHaveBeenCalledOnce();
    await saveMinerUToken('');
    expect(t.records).toEqual([other]);
  });
  it('rejects invalid input before touching password storage and permits retry after storage failure', async () => {
    const t = harness();
    await expect(saveMinerUToken('bad\r\nheader')).rejects.toThrow('Invalid MinerU token');
    expect(t.manager.findLogins).not.toHaveBeenCalled();
    t.manager.addLoginAsync.mockRejectedValueOnce(new Error('locked'));
    await expect(saveMinerUToken('one')).rejects.toThrow();
    await saveMinerUToken('two');
    expect(readMinerUToken()).toBe('two');
  });
});
