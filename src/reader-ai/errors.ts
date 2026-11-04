import type { ReaderAIErrorCode } from './contracts';

export class ReaderAIError extends Error {
  constructor(readonly code: ReaderAIErrorCode) {
    super(code);
    this.name = 'ReaderAIError';
  }
}
