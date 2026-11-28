import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkSemanticScholarCredential,
  createCredentialAbortController,
} from '../../src/platform/credential-check';

const request = vi.fn();
beforeEach(() => vi.stubGlobal('Zotero', { HTTP: { request } }));
afterEach(() => {
  vi.unstubAllGlobals();
  request.mockReset();
});
const signal = (): AbortSignal => new AbortController().signal;
const paper = { paperId: '5c5751d45e298cea054f32b392c12c61027d2fe7' };

describe('explicit credential checks', () => {
  it('verifies credentials when Bootstrap has no DOM abort constructor', async () => {
    const native = AbortController;
    vi.stubGlobal('AbortController', undefined);
    vi.stubGlobal('Components', {
      utils: {
        importGlobalProperties(properties: string[]) {
          if (properties.includes('AbortController')) vi.stubGlobal('AbortController', native);
        },
      },
    });
    request.mockResolvedValue({ status: 200, responseText: JSON.stringify(paper) });
    const controller = createCredentialAbortController();
    expect(await checkSemanticScholarCredential('private-key', controller.signal)).toBe('valid');
  });

  it.each([
    [401, { message: 'Unauthorized' }, 'invalid'],
    [403, { message: 'Forbidden' }, 'forbidden'],
    [429, { message: 'Too many requests' }, 'rateLimited'],
    [500, { message: 'Server error' }, 'unavailable'],
    [200, {}, 'unavailable'],
  ] as const)('keeps HTTP %s / %j distinct from a valid token', async (status, body, expected) => {
    request.mockResolvedValue({ status, responseText: JSON.stringify(body) });
    expect(await checkSemanticScholarCredential('private-key', signal())).toBe(expected);
  });

  it('checks a fixed public Semantic Scholar paper and requires a real paper response', async () => {
    request.mockResolvedValue({
      status: 200,
      responseText: JSON.stringify(paper),
    });
    expect(await checkSemanticScholarCredential('private-key', signal())).toBe('valid');
    const [method, url, options] = request.mock.calls[0]!;
    expect(method).toBe('GET');
    expect(new URL(url).hostname).toBe('api.semanticscholar.org');
    expect(options.headers).toEqual({ 'x-api-key': 'private-key' });
    expect(options.body).toBeUndefined();
  });

  it.each(['<html>Sign in</html>', 'not-json'])(
    'does not accept proxy or login content',
    async (body) => {
      request.mockResolvedValue({ status: 200, responseText: body });
      expect(await checkSemanticScholarCredential('private-key', signal())).toBe('unavailable');
    },
  );

  it('keeps a network failure inconclusive without returning raw errors or secret text', async () => {
    request.mockRejectedValue(new Error('upstream private-key detail'));
    expect(await checkSemanticScholarCredential('private-key', signal())).toBe('unavailable');
  });

  it('cancels an in-flight host request instead of publishing its result', async () => {
    const pending = Promise.withResolvers<{ status: number; responseText: string }>();
    const cancelled = vi.fn(() => pending.reject(new Error('cancelled')));
    request.mockImplementation((_method, _url, options) => {
      options.cancellerReceiver(cancelled);
      return pending.promise;
    });
    const controller = new AbortController();
    const result = checkSemanticScholarCredential('private-key', controller.signal);
    controller.abort();
    expect(await result).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it.each(['', '  ', 'unsafe\r\nheader'])(
    'rejects empty or unsafe input without a request',
    async (value) => {
      expect(await checkSemanticScholarCredential(value, signal())).toBe('invalid');
      expect(request).not.toHaveBeenCalled();
    },
  );
});
