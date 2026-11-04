import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/ai/runtime';

interface Runtime {
  generate(input: object): Promise<string>;
  cancel(id: string): void;
  dispose(): void;
}
const runtime = (globalThis as unknown as { NeoAIRuntime: Runtime }).NeoAIRuntime;
const input = {
  id: 'test',
  endpoint: 'https://example.test/v1',
  model: 'model',
  apiKey: 'secret',
  maxOutputTokens: 50,
  request: {
    system: 'system',
    prompt: 'prompt',
    outputSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    },
  },
};
afterEach(() => {
  runtime.dispose();
  vi.unstubAllGlobals();
});
describe('SDK runtime', () => {
  it('sends a single authenticated request with redirects disabled and parses structured output', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: '1',
            object: 'chat.completion',
            created: 1,
            model: 'model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: '{"answer":"ok"}' },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = JSON.parse(await runtime.generate(input));
    expect(result.output).toEqual({ answer: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
  });
  it('rejects malformed structured model output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: '1',
              object: 'chat.completion',
              created: 1,
              model: 'model',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: { role: 'assistant', content: 'not json' },
                },
              ],
              usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    expect(JSON.parse(await runtime.generate(input))).toEqual({ error: 'invalid-output' });
  });
  it('maps authentication and rate limiting without leaking provider bodies', async () => {
    for (const [status, code] of [
      [401, 'authentication'],
      [429, 'rate-limit'],
    ] as const) {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('{"error":{"message":"secret prompt"}}', {
              status,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      );
      const response = await runtime.generate(input);
      expect(JSON.parse(response)).toEqual({ error: code });
      expect(response).not.toContain('secret');
    }
  });
});
