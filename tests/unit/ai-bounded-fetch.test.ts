import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAIResponse } from '../../src/ai/bounded-fetch';

afterEach(() => vi.unstubAllGlobals());

describe('AI response byte boundary', () => {
  it.each([200, 500])(
    'cancels oversized HTTP %s bodies with absent or dishonest length headers',
    async (status) => {
      for (const length of [null, '1']) {
        let bytes = 0,
          cancelled = false;
        const chunk = new Uint8Array(64 * 1024);
        const body = new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              bytes += chunk.byteLength;
              controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        );
        vi.stubGlobal(
          'fetch',
          async () =>
            new Response(body, {
              status,
              headers: length === null ? {} : { 'content-length': length },
            }),
        );
        const response = await fetchAIResponse('https://example.test/v1');
        await expect(response.text()).rejects.toThrow('byte limit');
        expect(cancelled).toBe(true);
        expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024 + chunk.byteLength);
      }
    },
  );

  it('rejects an excessive declared length without reading the body', async () => {
    let pulled = false,
      cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(body, { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }),
    );
    await expect(fetchAIResponse('https://example.test/v1')).rejects.toThrow('byte limit');
    expect(pulled).toBe(false);
    expect(cancelled).toBe(true);
  });

  it.each([200, 429])('preserves the bounded HTTP %s status and response bytes', async (status) => {
    const transport = vi.fn(
      async () =>
        new Response('完整的本地协议回包', { status, headers: { 'x-source': 'fixture' } }),
    );
    vi.stubGlobal('fetch', transport);
    const response = await fetchAIResponse('https://example.test/v1');
    expect(response.status).toBe(status);
    expect(response.headers.get('x-source')).toBe('fixture');
    expect(await response.text()).toBe('完整的本地协议回包');
  });
});
