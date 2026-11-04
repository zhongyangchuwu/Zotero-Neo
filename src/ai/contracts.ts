export type AIJSONValue =
  | null
  | boolean
  | number
  | string
  | readonly AIJSONValue[]
  | { readonly [key: string]: AIJSONValue };

export interface AIConfiguration {
  readonly endpoint: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly sendImages: boolean;
}

/** Safe settings projection. It never contains a stored credential. */
export interface AIConfigurationState extends AIConfiguration {
  readonly configured: boolean;
  readonly hasCredential: boolean;
}

export type AICredentialChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'replace'; readonly value: string }
  | { readonly kind: 'forget' };

export interface AIInputImage {
  readonly data: string;
  readonly mediaType: 'image/png' | 'image/jpeg';
}

/** JSON-safe explicit input; host objects, source coordinates and cancellation stay outside it. */
export interface AIGenerationRequest {
  readonly prompt: string;
  readonly system: string;
  readonly outputSchema: { readonly [key: string]: AIJSONValue };
  readonly images?: readonly AIInputImage[];
}

export interface AIUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface AIGenerationResult {
  /** The task owner validates its result shape and evidence references before saving. */
  readonly output: unknown;
  readonly model: string;
  readonly endpoint: string;
  readonly usage: AIUsage;
}

export type AIErrorCode =
  | 'unconfigured'
  | 'authentication'
  | 'rate-limit'
  | 'network'
  | 'cancelled'
  | 'invalid-output'
  | 'unsupported';

export interface AIClient {
  generate(
    request: AIGenerationRequest,
    options: { readonly signal: AbortSignal },
  ): Promise<AIGenerationResult>;
}

export interface AIService extends AIClient {
  configuration(): AIConfigurationState;
  configure(configuration: AIConfiguration, credential: AICredentialChange): Promise<void>;
  dispose(): void;
}
