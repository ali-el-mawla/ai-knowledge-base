import { type ChatStreamEvent, encodeSseEvent } from '@repo/shared';
import type { Response } from 'express';

/**
 * Where the chat service writes its stream. Keeping HTTP behind this interface lets the
 * service be tested without a server, and keeps SSE framing out of the chat logic.
 */
export interface ChatEventSink {
  /**
   * Commits to a streaming response: status and headers go out. Before this call a
   * failure is still an ordinary JSON error; after it, failures travel as `error` events.
   */
  open(): void;
  send(event: ChatStreamEvent): void;
  /** An SSE comment line. Parsers ignore it; proxies see traffic and keep the connection. */
  comment(text: string): void;
  /** Ends the response. Safe to call more than once. */
  end(): void;
}

/** Adapts an Express response to `ChatEventSink` as a `text/event-stream`. */
export function createSseSink(res: Response): ChatEventSink {
  // After the client disconnects there is nobody to write to; writes become no-ops.
  const writable = (): boolean => !res.writableEnded && !res.destroyed;
  return {
    open() {
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      // no-transform: proxies must not compress or buffer the stream into one late chunk.
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // nginx buffers proxied responses by default; this header turns that off for the stream.
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
    },
    send(event) {
      if (writable()) res.write(encodeSseEvent(event));
    },
    comment(text) {
      if (writable()) res.write(`: ${text}\n\n`);
    },
    end() {
      if (writable()) res.end();
    },
  };
}
