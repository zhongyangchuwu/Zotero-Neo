import type { AIConfiguration } from './contracts';
import { AIServiceError } from './errors';

/** The endpoint identity used by configuration, generation, and credential storage. */
export function normalizeAIEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new AIServiceError('unsupported');
  }
  const loopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    endpoint.includes('?') ||
    endpoint.includes('#')
  )
    throw new AIServiceError('unsupported');
  return url.href.replace(/\/$/u, '');
}

export function normalizeAIConfiguration(value: AIConfiguration): AIConfiguration {
  const endpoint = normalizeAIEndpoint(value.endpoint);
  if (
    (value.api !== 'openai-chat-completions' && value.api !== 'openai-responses') ||
    !value.model.trim() ||
    !Number.isSafeInteger(value.maxOutputTokens) ||
    value.maxOutputTokens < 1 ||
    typeof value.sendImages !== 'boolean'
  )
    throw new AIServiceError('unsupported');
  return {
    api: value.api,
    endpoint,
    model: value.model.trim(),
    maxOutputTokens: value.maxOutputTokens,
    sendImages: value.sendImages,
  };
}

/** Reads the persisted representation, including the original implicit chat API. */
export function parseAIConfiguration(value: unknown): AIConfiguration {
  if (
    !value ||
    typeof value !== 'object' ||
    !('endpoint' in value) ||
    typeof value.endpoint !== 'string' ||
    !('model' in value) ||
    typeof value.model !== 'string' ||
    !('maxOutputTokens' in value) ||
    typeof value.maxOutputTokens !== 'number' ||
    !('sendImages' in value) ||
    typeof value.sendImages !== 'boolean'
  )
    throw new AIServiceError('unsupported');
  const api = 'api' in value ? value.api : 'openai-chat-completions';
  if (api !== 'openai-chat-completions' && api !== 'openai-responses')
    throw new AIServiceError('unsupported');
  return normalizeAIConfiguration({
    api,
    endpoint: value.endpoint,
    model: value.model,
    maxOutputTokens: value.maxOutputTokens,
    sendImages: value.sendImages,
  });
}

export function normalizeAICredential(value: string): string {
  if (!value.trim() || value.length > 8192 || /[\r\n]/u.test(value))
    throw new AIServiceError('unsupported');
  return value.trim();
}
