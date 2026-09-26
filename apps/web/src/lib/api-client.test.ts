import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, parseErrorResponse } from './api-client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function clientWith(fetchImpl: typeof fetch, token: string | null = 'token-123') {
  return createApiClient({
    baseUrl: 'http://api.test/api',
    getAccessToken: async () => token,
    fetch: fetchImpl,
  });
}

describe('parseErrorResponse', () => {
  it('reads the documented error body', async () => {
    const error = await parseErrorResponse(
      jsonResponse(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Title is required',
          details: [{ path: ['title'] }],
          requestId: 'req-1',
        },
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Title is required',
      status: 422,
      requestId: 'req-1',
      details: [{ path: ['title'] }],
    });
    expect(error.isClientError).toBe(true);
  });

  it('falls back to the status when the body is not JSON', async () => {
    const error = await parseErrorResponse(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        headers: { 'x-request-id': 'req-2' },
      }),
    );
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502, requestId: 'req-2' });
    expect(error.isClientError).toBe(false);
  });

  it('maps well-known statuses when the body has another shape', async () => {
    const error = await parseErrorResponse(jsonResponse(404, { message: 'nope' }));
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404, requestId: null });
  });
});

describe('createApiClient', () => {
  it('sends the bearer token, a JSON body and only the non-empty query params', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, { ok: true }));
    const result = await clientWith(fetchMock).request('POST', '/documents', {
      body: { title: 'Hello' },
      query: { q: 'leave', tag: undefined, offset: 0, empty: '' },
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.test/api/documents?q=leave&offset=0');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ title: 'Hello' }));
  });

  it('omits the Authorization header when signed out', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));
    await clientWith(fetchMock, null).get('/tags');
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has('Authorization')).toBe(false);
  });

  it('resolves 204 answers to undefined', async () => {
    const client = clientWith(async () => new Response(null, { status: 204 }));
    await expect(client.delete('/documents/1')).resolves.toBeUndefined();
  });

  it('throws an ApiError built from the error body', async () => {
    const client = clientWith(async () =>
      jsonResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Document not found', requestId: 'req-3' },
      }),
    );
    await expect(client.get('/documents/missing')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'NOT_FOUND',
      status: 404,
      requestId: 'req-3',
    });
  });

  it('turns a failed connection into NETWORK_ERROR', async () => {
    const client = clientWith(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client.get('/documents')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('lets aborts through untouched', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    const client = clientWith(async () => {
      throw abort;
    });
    await expect(client.get('/documents')).rejects.toBe(abort);
  });
});
