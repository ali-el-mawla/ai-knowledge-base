import type { ApiErrorCode } from './errors.js';
import type { Message } from './schemas/chat.js';
import type { Source } from './schemas/search.js';

/**
 * Events streamed by `POST /conversations/:id/messages` (text/event-stream).
 * Order: one `start`, any number of `delta`, then exactly one `done` or `error`.
 */
export type ChatStreamEvent =
  | {
      type: 'start';
      conversationId: string;
      userMessage: Message;
      rewrittenQuery: string | null;
      sources: Source[];
    }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: Message }
  | { type: 'error'; code: ApiErrorCode; message: string };

export type ChatStreamEventType = ChatStreamEvent['type'];

const EVENT_TYPES: ReadonlySet<string> = new Set(['start', 'delta', 'done', 'error']);

/** Serialises one event as an SSE frame. The payload is JSON on a single data line. */
export function encodeSseEvent(event: ChatStreamEvent): string {
  const { type, ...payload } = event;
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Incremental SSE parser for fetch streams: feed it text chunks as they arrive
 * (frames may be split anywhere) and it returns the complete events so far.
 */
export function createSseParser(): { push(chunk: string): ChatStreamEvent[] } {
  let buffer = '';
  return {
    push(chunk: string): ChatStreamEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: ChatStreamEvent[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseFrame(frame);
        if (event) events.push(event);
        boundary = buffer.indexOf('\n\n');
      }
      return events;
    },
  };
}

function parseFrame(frame: string): ChatStreamEvent | null {
  let type = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!EVENT_TYPES.has(type) || data.length === 0) return null;
  const payload = JSON.parse(data.join('\n')) as Record<string, unknown>;
  return { type, ...payload } as ChatStreamEvent;
}
