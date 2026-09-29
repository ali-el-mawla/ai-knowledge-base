import type { ApiErrorBody, ApiErrorCode } from '@repo/shared';
import { getPublicEnv } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase/client';

/** Codes the client adds when the API gave no usable answer. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** Every failed API call rejects with this. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly code: ApiErrorCode | ClientErrorCode;
  /** HTTP status, or 0 when the request never got an answer. */
  readonly status: number;
  readonly requestId: string | null;
  readonly details: unknown;
  /** Seconds to wait before trying again, from a `Retry-After` header (429, 503). */
  readonly retryAfter: number | null;

  constructor(init: {
    code: ApiErrorCode | ClientErrorCode;
    message: string;
    status: number;
    requestId?: string | null;
    details?: unknown;
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId ?? null;
    this.details = init.details;
    this.retryAfter = init.retryAfter ?? null;
  }

  /** 4xx answers will not change on retry (bad input, missing resource, signed out). */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A message safe to show the user, for any thrown value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

/** Used when the body is not the documented error shape (a proxy page, an empty 502, ...). */
function codeForStatus(status: number): ApiErrorCode | ClientErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL' : 'INVALID_RESPONSE';
  }
}

/** `Retry-After` (seconds or an HTTP date) as whole seconds, or null when unreadable. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Prefers the API's own error body over a generic message for the status. */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
  if (isApiErrorBody(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      requestId: body.error.requestId ?? response.headers.get('x-request-id'),
      details: body.error.details,
      retryAfter,
    });
  }
  return new ApiError({
    code: codeForStatus(response.status),
    message: `The server answered with an unexpected error (HTTP ${response.status}).`,
    status: response.status,
    requestId: response.headers.get('x-request-id'),
    retryAfter,
  });
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  /** Includes the `/api` prefix. A function so it is resolved lazily. */
  baseUrl: string | (() => string);
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export interface ApiClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  /** The raw response, for streams. Errors are still thrown. */
  raw(method: string, path: string, options?: RequestOptions): Promise<Response>;
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  delete<T = void>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Typed `fetch` for the API: adds the access token and turns every failure into an `ApiError`. */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const fetchImpl = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function raw(method: string, path: string, options: RequestOptions = {}) {
    const baseUrl = typeof config.baseUrl === 'function' ? config.baseUrl() : config.baseUrl;
    const token = await config.getAccessToken();
    const headers = new Headers({ Accept: 'application/json' });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (error) {
      // Aborts are intentional (TanStack Query cancels stale requests): rethrow as-is.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check that the API is running and try again.',
        status: 0,
      });
    }

    if (!response.ok) throw await parseErrorResponse(response);
    return response;
  }

  async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const response = await raw(method, path, options);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError({
        code: 'INVALID_RESPONSE',
        message: 'The server sent a response that is not valid JSON.',
        status: response.status,
        requestId: response.headers.get('x-request-id'),
      });
    }
  }

  return {
    request,
    raw,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
  };
}

/** Token from the browser's Supabase session. */
export const apiClient = createApiClient({
  baseUrl: () => getPublicEnv().apiUrl,
  getAccessToken,
});
