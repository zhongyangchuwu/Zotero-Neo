import type { AIErrorCode } from './contracts';

const messages: Record<AIErrorCode, string> = {
  unconfigured: 'AI service is not configured.',
  authentication: 'AI service authentication failed.',
  'rate-limit': 'AI service rate limit reached.',
  network: 'AI service request failed.',
  cancelled: 'AI request was cancelled.',
  'invalid-output': 'AI service returned invalid output.',
  unsupported: 'This AI request is not supported.',
};

export class AIServiceError extends Error {
  readonly code: AIErrorCode;
  constructor(code: AIErrorCode) {
    super(messages[code]);
    this.name = 'AIServiceError';
    this.code = code;
  }
}

export function aiErrorCode(error: unknown): AIErrorCode {
  return error instanceof AIServiceError ? error.code : 'network';
}
