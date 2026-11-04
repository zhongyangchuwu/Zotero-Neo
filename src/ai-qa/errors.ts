import type { AIQAErrorCode } from './contracts';

export class AIQAError extends Error {
  constructor(readonly code: AIQAErrorCode) {
    super(code);
    this.name = 'AIQAError';
  }
}
