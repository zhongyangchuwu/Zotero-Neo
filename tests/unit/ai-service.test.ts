import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAIService } from '../../src/ai/service';
import type { AIConfiguration } from '../../src/ai/contracts';
import type { PreferenceStore } from '../../src/core/preference-store';
interface Login {
  httpRealm: string;
  username: string;
  password: string;
}

const host = vi.hoisted(() => ({ generate: vi.fn(), cancel: vi.fn(), dispose: vi.fn() }));
vi.mock('../../src/platform/ai-runtime', () => ({ createAIRuntimeHost: () => host }));

function harness() {
  const records: Login[] = [];
  const manager = {
    countLogins: vi.fn(
      (_origin: string, _action: null, realm: string) =>
        records.filter((r) => r.httpRealm === realm).length,
    ),
    findLogins: vi.fn((_origin: string, _action: null, realm: string) =>
      records.filter((r) => r.httpRealm === realm),
    ),
    addLoginAsync: vi.fn(async (record: Login) => {
      records.push(record);
    }),
    modifyLogin: vi.fn((old: Login, record: Login) => {
      records.splice(records.indexOf(old), 1, record);
    }),
    removeLogin: vi.fn((record: Login) => {
      records.splice(records.indexOf(record), 1);
    }),
  };
  vi.stubGlobal('Services', { logins: manager });
  vi.stubGlobal('Components', {
    interfaces: { nsILoginInfo: {} },
    classes: {
      '@mozilla.org/login-manager/loginInfo;1': {
        createInstance: () => ({
          init(
            this: object,
            origin: string,
            action: null,
            httpRealm: string,
            username: string,
            password: string,
          ) {
            Object.assign(this, { origin, action, httpRealm, username, password });
          },
        }),
      },
    },
  });
  const prefs = new Map<string, string>();
  const preferences = {
    get: (key: string, fallback: string) => prefs.get(key) ?? fallback,
    set: (key: string, value: string) => prefs.set(key, value),
  } as unknown as PreferenceStore;
  const service = createAIService({ rootURI: 'resource://neo/', preferences });
  return { service, records, manager, prefs };
}
const config: AIConfiguration = {
  api: 'openai-chat-completions',
  endpoint: 'https://example.test/v1',
  model: 'one',
  maxOutputTokens: 100,
  sendImages: false,
};
const request = { prompt: 'private prompt', system: 'system', outputSchema: { type: 'object' } };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AI service', () => {
  it('binds credentials to endpoints and projects settings without reading secrets', async () => {
    const { service, records, manager, prefs } = harness();
    await service.configure(config, { kind: 'replace', value: 'secret' });
    manager.findLogins.mockClear();
    expect(service.configuration()).toMatchObject({ configured: true, hasCredential: true });
    expect(manager.findLogins).not.toHaveBeenCalled();
    expect(JSON.stringify([...prefs.values()])).not.toContain('secret');
    await service.configure({ ...config, endpoint: 'https://other.test/v1' }, { kind: 'keep' });
    expect(service.configuration().configured).toBe(false);
    await service.configure(
      { ...config, endpoint: 'https://other.test/v1' },
      { kind: 'replace', value: 'other' },
    );
    expect(records).toHaveLength(2);
    await service.configure(config, { kind: 'forget' });
    expect(records).toHaveLength(1);
    expect(records[0].password).toBe('other');
  });
  it('preserves legacy endpoint credentials and explicitly switches protocol', async () => {
    const { service, manager, prefs } = harness();
    await service.configure(config, { kind: 'replace', value: 'secret' });
    const { api: _api, ...legacy } = config;
    prefs.set('ai.configuration', JSON.stringify(legacy));
    manager.findLogins.mockClear();
    expect(service.configuration()).toMatchObject({
      api: 'openai-chat-completions',
      endpoint: config.endpoint,
      configured: true,
    });
    await service.configure({ ...config, api: 'openai-responses' }, { kind: 'keep' });
    expect(service.configuration()).toMatchObject({
      api: 'openai-responses',
      endpoint: config.endpoint,
      configured: true,
    });
    expect(manager.findLogins).not.toHaveBeenCalled();
  });
  it('does not silently fall back for an unknown persisted protocol', async () => {
    const { service, manager, prefs } = harness();
    await service.configure(config, { kind: 'replace', value: 'secret' });
    prefs.set('ai.configuration', JSON.stringify({ ...config, api: 'unknown-protocol' }));
    manager.findLogins.mockClear();
    expect(service.configuration().configured).toBe(false);
    await expect(
      service.generate(request, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'unconfigured' });
    expect(manager.findLogins).not.toHaveBeenCalled();
    expect(host.generate).not.toHaveBeenCalled();
  });
  it('rejects unsafe endpoints and refuses implicit image transmission', async () => {
    const { service } = harness();
    for (const endpoint of [
      'http://example.test',
      'https://u:p@example.test',
      'https://example.test/?key=x',
      'https://example.test/#x',
    ]) {
      expect(() => service.configure({ ...config, endpoint }, { kind: 'keep' })).toThrow();
    }
    await service.configure(config, { kind: 'replace', value: 'secret' });
    await expect(
      service.generate(
        { ...request, images: [{ data: 'AA==', mediaType: 'image/png' }] },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(host.generate).not.toHaveBeenCalled();
  });
  it('snapshots configuration and ignores a late result after cancellation', async () => {
    const { service } = harness();
    await service.configure(config, { kind: 'replace', value: 'first' });
    let complete!: (payload: string) => void;
    host.generate.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = service.generate(request, { signal: controller.signal });
    await service.configure(
      { ...config, model: 'two', endpoint: 'https://other.test/v1' },
      { kind: 'replace', value: 'second' },
    );
    expect(host.generate.mock.calls[0][0]).toMatchObject({
      endpoint: config.endpoint,
      model: 'one',
      apiKey: 'first',
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    complete(JSON.stringify({ output: { ok: true }, usage: { inputTokens: 1, outputTokens: 2 } }));
    expect(host.cancel).toHaveBeenCalledOnce();
  });
  it('returns structured results and cancels pending work on dispose', async () => {
    const { service } = harness();
    await service.configure(config, { kind: 'replace', value: 'secret' });
    host.generate.mockResolvedValueOnce(
      JSON.stringify({ output: { answer: 'ok' }, usage: { inputTokens: 1, outputTokens: 2 } }),
    );
    await expect(
      service.generate(request, { signal: new AbortController().signal }),
    ).resolves.toEqual({
      output: { answer: 'ok' },
      model: 'one',
      endpoint: config.endpoint,
      usage: { inputTokens: 1, outputTokens: 2 },
    });
    host.generate.mockImplementationOnce(() => new Promise<string>(() => {}));
    const pending = service.generate(request, { signal: new AbortController().signal });
    service.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(host.dispose).toHaveBeenCalledOnce();
  });
  it('maps runtime failures to safe errors and validates output', async () => {
    const { service } = harness();
    await service.configure(config, { kind: 'replace', value: 'secret' });
    for (const code of [
      'authentication',
      'rate-limit',
      'network',
      'cancelled',
      'invalid-output',
      'unsupported',
    ]) {
      host.generate.mockResolvedValueOnce(JSON.stringify({ error: code }));
      await expect(
        service.generate(request, { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ code });
    }
    host.generate.mockResolvedValueOnce(JSON.stringify({ output: 'not an object', usage: {} }));
    await expect(
      service.generate(request, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: 'invalid-output' });
  });
});
