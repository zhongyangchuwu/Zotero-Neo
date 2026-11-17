import type { PreferenceStore } from '../core/preference-store';
import { changeAICredential, hasAICredential, readAICredential } from '../platform/ai-credentials';
import { createAIRuntimeHost } from '../platform/ai-runtime';
import type {
  AIConfiguration,
  AIConfigurationState,
  AICredentialChange,
  AIErrorCode,
  AIGenerationRequest,
  AIGenerationResult,
  AIService,
} from './contracts';
import { AIServiceError } from './errors';
import {
  normalizeAIConfiguration,
  normalizeAICredential,
  parseAIConfiguration,
} from './configuration-policy';

const KEY = 'ai.configuration';
const empty: AIConfiguration = {
  api: 'openai-chat-completions',
  endpoint: '',
  model: '',
  maxOutputTokens: 2048,
  sendImages: false,
};
const codes: readonly AIErrorCode[] = [
  'unconfigured',
  'authentication',
  'rate-limit',
  'network',
  'cancelled',
  'invalid-output',
  'unsupported',
];

export function createAIService(options: {
  rootURI: string;
  preferences: PreferenceStore;
  logger?: unknown;
}): AIService {
  const host = createAIRuntimeHost(options.rootURI);
  let disposed = false;
  let nextId = 0;
  let writing: Promise<void> = Promise.resolve();
  const pending = new Set<() => void>();
  function settings(): AIConfiguration {
    try {
      return parseAIConfiguration(JSON.parse(options.preferences.get(KEY, 'null')));
    } catch {
      return empty;
    }
  }
  function configuration(): AIConfigurationState {
    const config = settings();
    let hasCredential = false;
    try {
      hasCredential = !!config.endpoint && hasAICredential(config.endpoint);
    } catch {
      /* locked login manager */
    }
    return {
      ...config,
      hasCredential,
      configured: !!config.endpoint && !!config.model && hasCredential,
    };
  }
  return {
    configuration,
    configure(config: AIConfiguration, credential: AICredentialChange): Promise<void> {
      const normalized = normalizeAIConfiguration(config);
      let replacement: string | undefined;
      if (credential.kind === 'replace') {
        try {
          replacement = normalizeAICredential(credential.value);
        } catch (error) {
          return Promise.reject(error);
        }
      }
      const task = writing
        .catch(() => {})
        .then(async () => {
          if (disposed) throw new AIServiceError('cancelled');
          if (credential.kind === 'replace')
            await changeAICredential(normalized.endpoint, replacement!);
          else if (credential.kind === 'forget')
            await changeAICredential(normalized.endpoint, null);
          options.preferences.set(KEY, JSON.stringify(normalized));
        });
      writing = task;
      return task;
    },
    async generate(request: AIGenerationRequest, { signal }): Promise<AIGenerationResult> {
      if (disposed || signal.aborted) throw new AIServiceError('cancelled');
      const config = settings();
      if (!config.endpoint) throw new AIServiceError('unconfigured');
      if (request.images?.length && !config.sendImages) throw new AIServiceError('unsupported');
      if (
        request.images?.some(
          (image) =>
            !['image/png', 'image/jpeg'].includes(image.mediaType) ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(image.data) ||
            !image.data,
        )
      )
        throw new AIServiceError('unsupported');
      let apiKey: string;
      try {
        apiKey = readAICredential(config.endpoint);
      } catch {
        throw new AIServiceError('authentication');
      }
      if (!apiKey) throw new AIServiceError('unconfigured');
      const id = String(++nextId);
      const { promise, resolve, reject } = Promise.withResolvers<AIGenerationResult>();
      let settled = false;
      const cleanup = (): void => {
        signal.removeEventListener('abort', cancel);
        pending.delete(cancel);
      };
      const cancel = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        host.cancel(id);
        reject(new AIServiceError('cancelled'));
      };
      pending.add(cancel);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted || disposed) {
        cancel();
        return promise;
      }
      let operation: Promise<string>;
      try {
        operation = host.generate({ id, ...config, apiKey, request });
      } catch {
        settled = true;
        cleanup();
        reject(new AIServiceError('network'));
        return promise;
      }
      void operation.then(
        (payload) => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            const result: unknown = JSON.parse(payload);
            if (!result || typeof result !== 'object') throw new AIServiceError('invalid-output');
            if ('error' in result && typeof result.error === 'string')
              throw new AIServiceError(
                codes.includes(result.error as AIErrorCode)
                  ? (result.error as AIErrorCode)
                  : 'network',
              );
            if (
              !('output' in result) ||
              !result.output ||
              typeof result.output !== 'object' ||
              Array.isArray(result.output) ||
              !('usage' in result) ||
              !result.usage ||
              typeof result.usage !== 'object' ||
              !('inputTokens' in result.usage) ||
              !('outputTokens' in result.usage)
            )
              throw new AIServiceError('invalid-output');
            const inputTokens = result.usage.inputTokens;
            const outputTokens = result.usage.outputTokens;
            if (
              !(inputTokens === null || typeof inputTokens === 'number') ||
              !(outputTokens === null || typeof outputTokens === 'number')
            )
              throw new AIServiceError('invalid-output');
            resolve({
              output: result.output,
              usage: { inputTokens, outputTokens },
              model: config.model,
              endpoint: config.endpoint,
            });
          } catch (error) {
            reject(error instanceof AIServiceError ? error : new AIServiceError('invalid-output'));
          }
        },
        () => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new AIServiceError('network'));
          }
        },
      );
      return promise;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const cancel of pending) cancel();
      host.dispose();
    },
  };
}
