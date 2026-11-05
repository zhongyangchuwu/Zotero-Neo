import { afterEach, expect, it, vi } from 'vitest';
import { referenceRequest } from '../../src/platform/reference-http';
afterEach(() => vi.unstubAllGlobals());

it('disables redirects and retries and forwards only the explicit key', async () => {
  const request = vi.fn(async (_method: string, _url: string, _options: unknown) => ({
    status: 429,
    responseText: 'rate limited',
  }));
  vi.stubGlobal('Zotero', { HTTP: { request } });
  const signal = new AbortController().signal;
  expect(
    await referenceRequest('https://api.semanticscholar.org/graph/v1/paper/x', 'secret', signal),
  ).toEqual({ status: 429, text: 'rate limited' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][2]).toMatchObject({
    followRedirects: false,
    errorDelayMax: 0,
    debug: false,
    headers: { 'x-api-key': 'secret' },
  });
});

it('cancels the native request and does not expose host errors', async () => {
  let cancel = vi.fn();
  const request = vi.fn(
    (
      _method: string,
      _url: string,
      options: { cancellerReceiver: (callback: () => void) => void },
    ) =>
      new Promise((_resolve, reject) => {
        cancel = vi.fn(() => reject(new Error('secret')));
        options.cancellerReceiver(cancel);
      }),
  );
  vi.stubGlobal('Zotero', { HTTP: { request } });
  const controller = new AbortController();
  const pending = referenceRequest(
    'https://api.semanticscholar.org/graph/v1/paper/x',
    'secret',
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toThrow('cancelled');
  expect(cancel).toHaveBeenCalledTimes(1);
});

it.each(['headers', 'progress', 'text'] as const)(
  'aborts oversized response during %s',
  async (phase) => {
    const listeners = new Map<string, (event: { loaded: number }) => void>();
    const { promise, reject } = Promise.withResolvers<never>();
    const xhr = {
      readyState: 1,
      responseText: '',
      getResponseHeader: () => (phase === 'headers' ? '2097153' : null),
      addEventListener: (name: string, callback: (event: { loaded: number }) => void) =>
        listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
      abort: vi.fn(() => reject(new Error('native abort'))),
    };
    vi.stubGlobal('Zotero', {
      HTTP: {
        request: (
          _method: string,
          _url: string,
          options: { requestObserver: (value: typeof xhr) => void },
        ) => {
          options.requestObserver(xhr);
          return promise;
        },
      },
    });
    const pending = referenceRequest(
      'https://api.semanticscholar.org/graph/v1/paper/x',
      'secret',
      new AbortController().signal,
    );
    xhr.readyState = phase === 'headers' ? 2 : 3;
    if (phase === 'text') xhr.responseText = 'x'.repeat(2 * 1024 * 1024 + 1);
    if (phase === 'progress') listeners.get('progress')?.({ loaded: 2 * 1024 * 1024 + 1 });
    else listeners.get('readystatechange')?.({ loaded: 0 });
    await expect(pending).rejects.toThrow('exceeds 2 MiB');
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  },
);
