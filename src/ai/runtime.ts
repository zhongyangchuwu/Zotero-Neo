import {
  createOpenAICompatible,
  generateText,
  jsonSchema,
  Output,
} from '../../vendor/ai-sdk/index.js';
import type { AIErrorCode, AIGenerationRequest, AIUsage } from './contracts';
import { fetchAIResponse } from './bounded-fetch';

interface RuntimeRequest {
  id: string;
  endpoint: string;
  model: string;
  apiKey: string;
  maxOutputTokens: number;
  request: AIGenerationRequest;
}

function classify(error: unknown): AIErrorCode {
  let current = error as { name?: string; statusCode?: number; cause?: unknown } | undefined;
  for (let i = 0; current && i < 5; i++) {
    if (current.name === 'AbortError') return 'cancelled';
    if (current.statusCode === 401 || current.statusCode === 403) return 'authentication';
    if (current.statusCode === 429) return 'rate-limit';
    if (
      current.name?.includes('NoObjectGenerated') ||
      current.name?.includes('NoOutputGenerated') ||
      current.name?.includes('TypeValidation') ||
      current.name?.includes('JSONParse')
    )
      return 'invalid-output';
    if (current.name?.includes('Unsupported')) return 'unsupported';
    current = current.cause as typeof current;
  }
  return 'network';
}

const controllers = new Map<string, AbortController>();
const runtime = {
  async generate(input: RuntimeRequest): Promise<string> {
    const controller = new AbortController();
    controllers.set(input.id, controller);
    try {
      const provider = createOpenAICompatible({
        name: 'neo-openai-compatible',
        baseURL: input.endpoint,
        apiKey: input.apiKey,
        supportsStructuredOutputs: true,
        fetch: fetchAIResponse,
      });
      const images = input.request.images ?? [];
      const result = await generateText({
        model: provider(input.model),
        system: input.request.system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: input.request.prompt },
              ...images.map((image) => ({
                type: 'image',
                image: Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)),
                mediaType: image.mediaType,
              })),
            ],
          },
        ],
        output: Output.object({ schema: jsonSchema(input.request.outputSchema) }),
        maxOutputTokens: input.maxOutputTokens,
        abortSignal: controller.signal,
        maxRetries: 0,
      });
      if (controller.signal.aborted) return JSON.stringify({ error: 'cancelled' });
      const output = result.output;
      if (
        output === undefined ||
        output === null ||
        typeof output !== 'object' ||
        Array.isArray(output)
      )
        return JSON.stringify({ error: 'invalid-output' });
      const usage: AIUsage = {
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
      };
      return JSON.stringify({ output, usage });
    } catch (error) {
      return JSON.stringify({ error: controller.signal.aborted ? 'cancelled' : classify(error) });
    } finally {
      controllers.delete(input.id);
    }
  },
  cancel(id: string): void {
    controllers.get(id)?.abort();
  },
  dispose(): void {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  },
};
(globalThis as unknown as { NeoAIRuntime: typeof runtime }).NeoAIRuntime = runtime;
