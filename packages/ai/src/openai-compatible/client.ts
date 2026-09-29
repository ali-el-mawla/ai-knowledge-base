import OpenAI from 'openai';

export interface ClientOptions {
  /** Replaces the global fetch, e.g. with a fake in tests. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Per attempt: time to response headers, plus the body for non-streamed calls. */
  timeoutMs?: number;
  /** Retries on connection errors, 408, 409, 429 and 5xx, with exponential backoff. */
  maxRetries?: number;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;

export function createOpenAIClient(
  baseUrl: string,
  apiKey: string,
  options: ClientOptions,
): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    fetch: options.fetch,
    // The SDK would otherwise read OPENAI_ORG_ID / OPENAI_PROJECT_ID from the environment
    // and send them to whichever provider is configured.
    organization: null,
    project: null,
  });
}
