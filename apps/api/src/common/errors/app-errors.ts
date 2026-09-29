import type { AiProviderError } from '@repo/ai';
import type { ApiErrorCode } from '@repo/shared';

interface AppErrorOptions {
  /** Sent to the client as `error.details`; must be safe to expose. */
  details?: unknown;
  /** The underlying error; logged, never sent. */
  cause?: unknown;
}

/**
 * Errors the application throws on purpose. Each subclass fixes the HTTP status and
 * error code; the exception filter decides how it is rendered.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  readonly status = 400;
  readonly code = 'VALIDATION_FAILED';
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHORIZED';
}

/** Also used for other users' resources, so ids cannot be probed (never 403). */
export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';

  static resource(name: string): NotFoundError {
    return new NotFoundError(`${name} not found`);
  }
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}

export class ChatNotConfiguredError extends AppError {
  readonly status = 503;
  readonly code = 'CHAT_NOT_CONFIGURED';

  constructor(reason: string) {
    super(`Chat is not configured: ${reason}`, { details: { reason } });
  }
}

const AI_FAILURE_MESSAGES: Record<AiProviderError['kind'], string> = {
  auth: 'The AI provider rejected the API key.',
  rate_limit: 'The AI provider is rate limiting requests. Try again shortly.',
  timeout: 'The AI provider did not answer in time. Try again.',
  context_length: 'The request is too long for the model.',
  unavailable: 'The AI provider is unavailable. Try again later.',
  bad_request: 'The AI provider rejected the request.',
  invalid_response: 'The AI provider returned an unexpected response.',
};

function aiFailureDetails(error: AiProviderError): Record<string, unknown> {
  return { provider: error.provider, kind: error.kind, retryable: error.retryable };
}

/** A chat or rewrite model call failed upstream (502). */
export class AiProviderFailure extends AppError {
  readonly status: number = 502;
  readonly code: ApiErrorCode = 'AI_PROVIDER_ERROR';

  static from(error: AiProviderError): AiProviderFailure {
    return new AiProviderFailure(AI_FAILURE_MESSAGES[error.kind], {
      details: aiFailureDetails(error),
      cause: error,
    });
  }
}

/**
 * The embedding model failed (503): without embeddings nothing can be indexed or
 * searched. Embedding call sites wrap provider errors with `EmbeddingUnavailableError.from`;
 * an unwrapped `AiProviderError` is treated as a chat failure.
 */
export class EmbeddingUnavailableError extends AiProviderFailure {
  override readonly status = 503;
  override readonly code = 'EMBEDDING_UNAVAILABLE';

  static override from(error: AiProviderError): EmbeddingUnavailableError {
    return new EmbeddingUnavailableError(
      `Embeddings are unavailable. ${AI_FAILURE_MESSAGES[error.kind]}`,
      { details: aiFailureDetails(error), cause: error },
    );
  }
}

/**
 * A database call failed for a reason the client cannot fix. Rendered as a generic
 * 500; the PostgREST error travels as `cause` so it is logged with the request id.
 */
export class DatabaseError extends AppError {
  readonly status = 500;
  readonly code = 'INTERNAL';

  constructor(operation: string, cause: unknown) {
    super(`Database operation failed: ${operation}`, { cause });
  }
}
