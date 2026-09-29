import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';
import { type AiErrorKind, AiProviderError } from '../errors.js';

/**
 * True when a call ended because its AbortSignal fired (Stop, or the client went away).
 * An abort is not a provider failure, so it is never wrapped into AiProviderError.
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof APIUserAbortError || (error instanceof Error && error.name === 'AbortError')
  );
}

/** Rethrow helper: aborts pass through unchanged, everything else becomes AiProviderError. */
export function normalizeError(error: unknown, provider: string): unknown {
  return isAbortError(error) ? error : toAiProviderError(error, provider);
}

export function invalidResponse(provider: string, detail: string): AiProviderError {
  return new AiProviderError(
    'invalid_response',
    `${provider} returned an invalid response: ${detail}`,
    provider,
  );
}

// Providers word this differently: OpenAI "maximum context length", Anthropic "prompt is
// too long", Groq "reduce the length of the messages".
const CONTEXT_LENGTH_MESSAGE =
  /context.?(length|window)|prompt is too long|reduce the length|too many tokens/i;

export function toAiProviderError(error: unknown, provider: string): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const cause = { cause: error };
  if (error instanceof APIConnectionTimeoutError) {
    return new AiProviderError(
      'timeout',
      `${provider} did not respond in time.`,
      provider,
      null,
      cause,
    );
  }
  if (error instanceof APIConnectionError) {
    return new AiProviderError(
      'unavailable',
      `Could not reach ${provider}: ${error.message}`,
      provider,
      null,
      cause,
    );
  }
  if (error instanceof APIError) {
    return new AiProviderError(
      kindOf(error),
      `${provider}: ${error.message}`,
      provider,
      error.status ?? null,
      cause,
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new AiProviderError(
    'invalid_response',
    `${provider} returned an invalid response: ${detail}`,
    provider,
    null,
    cause,
  );
}

function kindOf(error: APIError): AiErrorKind {
  const { status } = error;
  // No status: the provider sent an error event in the middle of a stream.
  if (status === undefined) return 'unavailable';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'unavailable';
  if (status >= 400) return isContextLength(error) ? 'context_length' : 'bad_request';
  return 'invalid_response';
}

function isContextLength(error: APIError): boolean {
  return error.code === 'context_length_exceeded' || CONTEXT_LENGTH_MESSAGE.test(error.message);
}
