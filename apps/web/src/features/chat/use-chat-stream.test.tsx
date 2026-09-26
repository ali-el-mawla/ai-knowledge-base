import { type ChatStreamEvent, type ConversationWithMessages, encodeSseEvent } from '@repo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import type { SendMessageFn } from './api';
import { chatKeys } from './queries';
import { makeMessage, makeSource } from './test-fixtures';
import { useChatStream } from './use-chat-stream';

const CONVERSATION_ID = 'conversation-1';
const userMessage = makeMessage({ id: 'user-1', content: 'Can I carry leave over?' });
const sources = [makeSource(1), makeSource(2)];
// Multi-byte characters on purpose: a split inside one must not garble the text.
const ANSWER = 'Yes: up to 5 days carry over into the next year (café rules apply) [1] 🙂 [2–3].';
const savedAnswer = makeMessage({
  id: 'answer-1',
  role: 'assistant',
  content: ANSWER,
  sources,
  citations: [1, 2],
  rewrittenQuery: 'leave carry over rules',
});

const startEvent: ChatStreamEvent = {
  type: 'start',
  conversationId: CONVERSATION_ID,
  userMessage,
  rewrittenQuery: 'leave carry over rules',
  sources,
};

/** Splits a string into deltas of uneven sizes, the way a model streams tokens. */
function deltas(text: string, sizes = [3, 1, 8, 2, 13]): ChatStreamEvent[] {
  // Array.from keeps surrogate pairs together, like a real tokenizer's output would.
  const chars = Array.from(text);
  const events: ChatStreamEvent[] = [];
  for (let at = 0, i = 0; at < chars.length; i += 1) {
    const size = sizes[i % sizes.length]!;
    events.push({ type: 'delta', text: chars.slice(at, at + size).join('') });
    at += size;
  }
  return events;
}

/** SSE bytes cut every `size` bytes: through field names, frame ends and UTF-8 sequences. */
function chunkedBody(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size)
        controller.enqueue(bytes.slice(at, at + size));
      controller.close();
    },
  });
}

function sseResponse(body: ReadableStream<Uint8Array>) {
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

/** A stream the test feeds by hand; it errors like fetch does when the request is aborted. */
function controllableStream(signal: AbortSignal) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  signal.addEventListener('abort', () =>
    controller.error(new DOMException('The operation was aborted.', 'AbortError')),
  );
  return {
    body,
    push: (...events: ChatStreamEvent[]) =>
      controller.enqueue(encoder.encode(events.map(encodeSseEvent).join(''))),
    close: () => controller.close(),
  };
}

function setup(sendMessage: SendMessageFn) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cached: ConversationWithMessages = {
    conversation: {
      id: CONVERSATION_ID,
      title: 'New conversation',
      createdAt: '2026-09-26T10:00:00.000Z',
      updatedAt: '2026-09-26T10:00:00.000Z',
    },
    messages: [],
  };
  queryClient.setQueryData(chatKeys.detail(CONVERSATION_ID), cached);
  const hook = renderHook(() => useChatStream({ sendMessage }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  const history = () =>
    queryClient.getQueryData<ConversationWithMessages>(chatKeys.detail(CONVERSATION_ID))
      ?.messages ?? [];
  return { ...hook, queryClient, history };
}

/** Lets the hook read what was pushed and render the next frame. */
const settleFrames = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));

describe('useChatStream', () => {
  it.each([1, 2, 7, 64])(
    'streams a whole answer whose bytes arrive in %i-byte chunks',
    async (size) => {
      const sse = [
        encodeSseEvent(startEvent),
        ': keep-alive\n\n',
        ...deltas(ANSWER).map(encodeSseEvent),
        encodeSseEvent({ type: 'done', message: savedAnswer }),
      ].join('');
      const sendMessage = vi.fn<SendMessageFn>(async () => sseResponse(chunkedBody(sse, size)));
      const { result, history } = setup(sendMessage);

      await act(() => result.current.send(CONVERSATION_ID, 'Can I carry leave over?'));

      expect(sendMessage).toHaveBeenCalledWith(
        CONVERSATION_ID,
        'Can I carry leave over?',
        expect.any(AbortSignal),
      );
      expect(result.current.state).toMatchObject({
        status: 'done',
        text: ANSWER,
        userMessage,
        rewrittenQuery: 'leave carry over rules',
        message: savedAnswer,
        error: null,
      });
      expect(result.current.state.sources).toEqual(sources);
      // A reload would show the same history.
      expect(history()).toEqual([userMessage, savedAnswer]);
    },
  );

  it('shows the question and sources on start, then the text as it arrives', async () => {
    let stream!: ReturnType<typeof controllableStream>;
    const { result } = setup(async (_id, _content, signal) => {
      stream = controllableStream(signal);
      return sseResponse(stream.body);
    });

    let settled!: Promise<void>;
    act(() => {
      settled = result.current.send(CONVERSATION_ID, 'Can I carry leave over?');
    });
    expect(result.current.state.status).toBe('sending');

    stream.push(startEvent);
    await settleFrames();
    expect(result.current.state).toMatchObject({ status: 'streaming', userMessage, sources });

    stream.push({ type: 'delta', text: 'Yes, ' }, { type: 'delta', text: 'up to 5 days' });
    await settleFrames();
    expect(result.current.state.text).toBe('Yes, up to 5 days');

    stream.push({ type: 'done', message: savedAnswer });
    await act(() => settled);
    expect(result.current.state.status).toBe('done');
  });

  it('stops on request: aborts the fetch and keeps the partial answer as stopped', async () => {
    let stream!: ReturnType<typeof controllableStream>;
    let requestSignal!: AbortSignal;
    const { result, history } = setup(async (_id, _content, signal) => {
      requestSignal = signal;
      stream = controllableStream(signal);
      return sseResponse(stream.body);
    });

    let settled!: Promise<void>;
    act(() => {
      settled = result.current.send(CONVERSATION_ID, 'Can I carry leave over?');
    });
    stream.push(startEvent, { type: 'delta', text: 'Yes, up to 5 days [1]' });
    await settleFrames();

    act(() => result.current.stop());
    await act(() => settled);

    expect(requestSignal.aborted).toBe(true);
    expect(result.current.state).toMatchObject({
      status: 'aborted',
      text: 'Yes, up to 5 days [1]',
    });
    const [question, partial] = history();
    expect(question).toEqual(userMessage);
    expect(partial).toMatchObject({
      role: 'assistant',
      status: 'aborted',
      content: 'Yes, up to 5 days [1]',
      citations: [1],
    });
  });

  it('shows an error event inline, keeps the partial answer, and retries the same question', async () => {
    const sse = [
      encodeSseEvent(startEvent),
      encodeSseEvent({ type: 'delta', text: 'Partial' }),
      encodeSseEvent({
        type: 'error',
        code: 'AI_PROVIDER_ERROR',
        message: 'The provider timed out.',
      }),
    ].join('');
    const sendMessage = vi.fn<SendMessageFn>(async () => sseResponse(chunkedBody(sse, 5)));
    const { result, history } = setup(sendMessage);

    await act(() => result.current.send(CONVERSATION_ID, 'Can I carry leave over?'));

    expect(result.current.state).toMatchObject({
      status: 'error',
      text: 'Partial',
      error: { code: 'AI_PROVIDER_ERROR', message: 'The provider timed out.', phase: 'stream' },
    });
    expect(history().map((message) => message.status)).toEqual(['complete', 'error']);

    await act(() => result.current.retry());
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]?.[1]).toBe('Can I carry leave over?');
  });

  it('reports a failure before streaming, with the wait a rate limit asks for', async () => {
    const sendMessage = vi.fn<SendMessageFn>(async () => {
      throw new ApiError({
        code: 'RATE_LIMITED',
        message: 'Too many requests.',
        status: 429,
        retryAfter: 30,
        requestId: 'req-9',
      });
    });
    const { result, history } = setup(sendMessage);

    await act(() => result.current.send(CONVERSATION_ID, 'Again?'));

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests.',
      phase: 'request',
      retryAfter: 30,
      requestId: 'req-9',
    });
    expect(history()).toEqual([]);
  });

  it('treats a stream that ends without done as a lost connection', async () => {
    const sse = encodeSseEvent(startEvent) + encodeSseEvent({ type: 'delta', text: 'Half' });
    const { result } = setup(async () => sseResponse(chunkedBody(sse, 9)));

    await act(() => result.current.send(CONVERSATION_ID, 'Question'));

    expect(result.current.state).toMatchObject({
      status: 'error',
      text: 'Half',
      error: { code: 'NETWORK_ERROR', phase: 'stream' },
    });
  });

  it('ignores a second send while one is in flight', async () => {
    let stream!: ReturnType<typeof controllableStream>;
    const sendMessage = vi.fn<SendMessageFn>(async (_id, _content, signal) => {
      stream = controllableStream(signal);
      return sseResponse(stream.body);
    });
    const { result } = setup(sendMessage);

    act(() => {
      void result.current.send(CONVERSATION_ID, 'First');
    });
    await act(() => result.current.send(CONVERSATION_ID, 'Second'));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.state.question).toBe('First');
    act(() => result.current.stop());
  });

  it('aborts the request when the component unmounts', async () => {
    let requestSignal!: AbortSignal;
    const { result, unmount } = setup(async (_id, _content, signal) => {
      requestSignal = signal;
      return sseResponse(controllableStream(signal).body);
    });

    act(() => {
      void result.current.send(CONVERSATION_ID, 'Question');
    });
    await settleFrames();
    unmount();

    expect(requestSignal.aborted).toBe(true);
  });
});
