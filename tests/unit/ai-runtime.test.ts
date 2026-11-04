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
  api: 'openai-chat-completions',
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
  it('uses stateless Responses with structured output and image input', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'resp_1',
            object: 'response',
            created_at: 1,
            completed_at: 2,
            status: 'completed',
            error: null,
            incomplete_details: null,
            instructions: 'system',
            max_output_tokens: 50,
            max_tool_calls: null,
            model: 'model',
            output: [
              {
                id: 'msg_1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    annotations: [],
                    logprobs: [],
                    text: '{"answer":"ok"}',
                  },
                ],
              },
            ],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: { effort: null, summary: null, context: null },
            service_tier: 'default',
            store: false,
            temperature: 1,
            text: {
              format: {
                type: 'json_schema',
                name: 'response',
                schema: input.request.outputSchema,
                strict: true,
              },
            },
            tool_choice: 'auto',
            tools: [],
            top_p: 1,
            top_logprobs: 0,
            truncation: 'disabled',
            usage: {
              input_tokens: 3,
              output_tokens: 2,
              total_tokens: 5,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 0 },
            },
            user: null,
            metadata: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = JSON.parse(
      await runtime.generate({
        ...input,
        id: 'responses',
        api: 'openai-responses',
        request: {
          ...input.request,
          images: [{ data: 'AQID', mediaType: 'image/png' }],
        },
      }),
    );
    expect(result.output).toEqual({ answer: 'ok' });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.test/v1/responses');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: 'model', max_output_tokens: 50, store: false });
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      schema: input.request.outputSchema,
      strict: true,
    });
    expect(body.input.find((message: { role: string }) => message.role === 'user')).toMatchObject({
      role: 'user',
      content: [
        { type: 'input_text', text: 'prompt' },
        { type: 'input_image', image_url: 'data:image/png;base64,AQID' },
      ],
    });
    expect(body.tools ?? []).toEqual([]);
    expect(body).not.toHaveProperty('previous_response_id');
    expect(body).not.toHaveProperty('conversation');
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
  it('maps authentication and rate limiting for both APIs without leaking provider bodies', async () => {
    for (const api of ['openai-chat-completions', 'openai-responses'] as const) {
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
        const response = await runtime.generate({ ...input, id: `${api}-${status}`, api });
        expect(JSON.parse(response)).toEqual({ error: code });
        expect(response).not.toContain('secret');
      }
    }
  });
  it('cancels an in-flight Responses request', async () => {
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const signal = init?.signal;
      if (!signal) return Promise.reject(new Error('missing request abort signal'));
      if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
      const { promise, reject } = Promise.withResolvers<Response>();
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
        once: true,
      });
      return promise;
    });
    vi.stubGlobal('fetch', fetch);
    const generation = runtime.generate({ ...input, id: 'cancel', api: 'openai-responses' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    runtime.cancel('cancel');
    expect(JSON.parse(await generation)).toEqual({ error: 'cancelled' });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
