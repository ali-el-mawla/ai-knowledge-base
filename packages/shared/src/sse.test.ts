import { describe, expect, it } from 'vitest';
import { createSseParser, encodeSseEvent, type ChatStreamEvent } from './sse.js';

describe('SSE codec', () => {
  const events: ChatStreamEvent[] = [
    { type: 'delta', text: 'Hello' },
    { type: 'delta', text: ' world\nwith a newline and "quotes"' },
    { type: 'error', code: 'AI_PROVIDER_ERROR', message: 'upstream failed' },
  ];

  it('round-trips events', () => {
    const parser = createSseParser();
    const parsed = parser.push(events.map(encodeSseEvent).join(''));
    expect(parsed).toEqual(events);
  });

  it('handles frames split at arbitrary points', () => {
    const wire = events.map(encodeSseEvent).join('');
    const parser = createSseParser();
    const parsed: ChatStreamEvent[] = [];
    for (let i = 0; i < wire.length; i += 3) parsed.push(...parser.push(wire.slice(i, i + 3)));
    expect(parsed).toEqual(events);
  });

  it('ignores comments, keep-alives and unknown event types', () => {
    const parser = createSseParser();
    const parsed = parser.push(
      ': keep-alive\n\nevent: unknown\ndata: {}\n\n' + encodeSseEvent(events[0]!),
    );
    expect(parsed).toEqual([events[0]]);
  });

  it('accepts CRLF line endings', () => {
    const parser = createSseParser();
    const parsed = parser.push(encodeSseEvent(events[0]!).replace(/\n/g, '\r\n'));
    expect(parsed).toEqual([events[0]]);
  });
});
