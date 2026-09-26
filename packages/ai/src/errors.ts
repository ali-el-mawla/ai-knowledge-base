export type AiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'context_length'
  | 'unavailable'
  | 'bad_request'
  | 'invalid_response';

/** Provider failures normalised to a small set of kinds callers can act on. */
export class AiProviderError extends Error {
  override readonly name = 'AiProviderError';

  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly provider: string,
    readonly status: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }

  /** Worth retrying later with the same input. */
  get retryable(): boolean {
    return this.kind === 'rate_limit' || this.kind === 'timeout' || this.kind === 'unavailable';
  }
}

/** Configuration problems are programmer/operator errors, reported at startup. */
export class AiConfigError extends Error {
  override readonly name = 'AiConfigError';
}
