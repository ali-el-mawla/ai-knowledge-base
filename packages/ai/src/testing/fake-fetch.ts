/**
 * Test doubles for the HTTP layer: the real SDK runs against canned OpenAI-shaped
 * responses, so tests cover request building, parsing and error mapping offline.
 */

export interface CapturedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

type Handler = (request: CapturedRequest, init?: RequestInit) => Response | Promise<Response>;

export function fakeFetch(handler: Handler) {
  const requests: CapturedRequest[] = [];
  async function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request: CapturedRequest = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    requests.push(request);
    return handler(request, init);
  }
  return { fetch, requests };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A complete server-sent event stream, terminated like OpenAI's with `[DONE]`. */
export function sse(events: unknown[]): Response {
  const lines = [...events.map((event) => JSON.stringify(event)), '[DONE]'];
  return new Response(lines.map((line) => `data: ${line}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Sends `events`, then keeps the connection open until the request is aborted. */
export function openSse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** A server that never answers; the promise rejects when the request is aborted. */
export function noAnswer(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
