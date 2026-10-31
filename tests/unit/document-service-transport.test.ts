import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentServiceTransport } from '../../src/platform/document-analysis';

class UploadXHR {
  static last: UploadXHR;
  headers: Record<string, string> = {};
  status = 200;
  timeout = 0;
  body?: XMLHttpRequestBodyInit | null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    UploadXHR.last = this;
  }
  open = vi.fn();
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: XMLHttpRequestBodyInit | null) {
    this.body = body;
    queueMicrotask(() => this.onload?.());
  }
  abort() {
    this.onabort?.();
  }
}
afterEach(() => vi.unstubAllGlobals());
describe('document service host transport', () => {
  it('uploads signed binary bytes without Zotero.HTTP adding a Content-Type header', async () => {
    const native = vi.fn();
    vi.stubGlobal('Zotero', { HTTP: { request: native } });
    vi.stubGlobal('XMLHttpRequest', UploadXHR);
    const bytes = new Uint8Array([9, 0, 128, 255, 9]).subarray(1, 4);
    await documentServiceTransport.upload({
      url: 'https://storage.example/signed',
      method: 'PUT',
      body: bytes,
      signal: new AbortController().signal,
    });
    expect(native).not.toHaveBeenCalled();
    expect(UploadXHR.last.open).toHaveBeenCalledWith('PUT', 'https://storage.example/signed');
    expect(UploadXHR.last.headers).toEqual({});
    expect(new Uint8Array(UploadXHR.last.body as ArrayBuffer)).toEqual(
      new Uint8Array([0, 128, 255]),
    );
    expect(UploadXHR.last.onload).toBeNull();
  });
  it('cancels an in-flight upload and keeps signed URLs out of failures', async () => {
    vi.stubGlobal('XMLHttpRequest', UploadXHR);
    const abort = new AbortController();
    const pending = documentServiceTransport.upload({
      url: 'https://storage.example/signed?secret',
      body: new Uint8Array([1]),
      signal: abort.signal,
    });
    abort.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(UploadXHR.last.onabort).toBeNull();
    const fail = vi.spyOn(UploadXHR.prototype, 'send').mockImplementation(function (
      this: UploadXHR,
    ) {
      this.status = 403;
      queueMicrotask(() => this.onload?.());
    });
    await expect(
      documentServiceTransport.upload({
        url: 'https://storage.example/signed?secret',
        body: new Uint8Array([1]),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Document upload failed; check the connection and try again');
    fail.mockRestore();
  });
});
