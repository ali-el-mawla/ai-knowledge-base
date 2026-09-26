import { createSseParser } from '@repo/shared';
import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { createSseSink } from './chat-event-sink.js';

/** Just enough of an Express response to watch what the sink does with it. */
class FakeResponse {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  readonly written: string[] = [];
  headersFlushed = false;
  writableEnded = false;
  destroyed = false;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  flushHeaders(): void {
    this.headersFlushed = true;
  }

  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }
}

function setup() {
  const res = new FakeResponse();
  return { res, sink: createSseSink(res as unknown as Response) };
}

describe('createSseSink', () => {
  it('sends the event-stream headers at once when opened', () => {
    const { res, sink } = setup();
    sink.open();
    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    expect(res.headersFlushed).toBe(true);
  });

  it('writes events the shared parser reads back, and comments it ignores', () => {
    const { res, sink } = setup();
    sink.open();
    sink.send({ type: 'delta', text: 'Hello\nworld' });
    sink.comment('keep-alive');
    sink.send({ type: 'error', code: 'AI_PROVIDER_ERROR', message: 'Try again.' });

    expect(res.written[1]).toBe(': keep-alive\n\n');
    expect(createSseParser().push(res.written.join(''))).toEqual([
      { type: 'delta', text: 'Hello\nworld' },
      { type: 'error', code: 'AI_PROVIDER_ERROR', message: 'Try again.' },
    ]);
  });

  it('ignores writes once the response ended or the client went away', () => {
    const { res, sink } = setup();
    sink.open();
    sink.end();
    sink.send({ type: 'delta', text: 'late' });
    sink.end();
    res.writableEnded = false;
    res.destroyed = true;
    sink.comment('keep-alive');
    expect(res.written).toEqual([]);
  });
});
