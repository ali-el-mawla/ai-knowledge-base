import { type AiErrorKind, AiProviderError, type EmbeddingModelConfig } from '@repo/ai';
import { DatabaseError } from '../common/errors/app-errors.js';

type EmbeddingTarget = Pick<EmbeddingModelConfig, 'baseUrl' | 'model'>;

const PROVIDER_FAILURES: Record<
  AiErrorKind,
  (error: AiProviderError, target: EmbeddingTarget) => string
> = {
  unavailable: (error, { baseUrl }) =>
    `Embedding provider ${error.status === null ? 'unreachable' : 'unavailable'} (${error.provider} at ${baseUrl})`,
  timeout: (error, { baseUrl }) => `Embedding provider timed out (${error.provider} at ${baseUrl})`,
  auth: (error) => `Embedding provider rejected the API key (${error.provider})`,
  rate_limit: (error) =>
    `Embedding provider is rate limiting requests (${error.provider}); reindex to retry`,
  context_length: (_error, { model }) => `A chunk is too long for the embedding model (${model})`,
  bad_request: (error, { model }) =>
    error.status === 404
      ? `Embedding model "${model}" not found (${error.provider})`
      : `Embedding provider rejected the request (${error.provider}, ${model})`,
  invalid_response: (error, { model }) =>
    `Embedding provider returned an unexpected response (${error.provider}, ${model})`,
};

/**
 * The short reason stored in `documents.ingestion_error` and shown in the UI. It names
 * what to fix without leaking internals; the full error (provider response, SQL error,
 * stack) goes to the log only.
 */
export function ingestionErrorMessage(error: unknown, embedding: EmbeddingTarget): string {
  if (error instanceof AiProviderError) return PROVIDER_FAILURES[error.kind](error, embedding);
  if (error instanceof DatabaseError) return 'Could not save the chunks (database error)';
  return 'Ingestion failed unexpectedly';
}
