'use client';

import { type ChatStreamEvent, createSseParser, type Message, type Source } from '@repo/shared';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { isApiError } from '@/lib/api-client';
import { sendMessage as sendMessageRequest, type SendMessageFn } from './api';
import { parseCitations } from './citations';
import {
  addMessagesToCache,
  markConversationStale,
  refetchConversation,
  refetchConversationList,
} from './queries';
import {
  type ChatStreamAction,
  type ChatStreamError,
  chatStreamReducer,
  initialChatStreamState,
} from './stream-state';

type Dispatch = (action: ChatStreamAction) => void;
type StreamFailure = Omit<ChatStreamError, 'phase'>;

/** Bookkeeping of one request. The reducer state is what renders; this is what side effects read. */
interface Run {
  id: number;
  conversationId: string;
  question: string;
  controller: AbortController;
  /** Set once the turn has an outcome; later events and errors of the run are ignored. */
  settled: boolean;
  userMessage: Message | null;
  rewrittenQuery: string | null;
  sources: Source[];
  /** Everything received so far. */
  text: string;
  /** Received but not rendered yet: deltas are batched into one render per frame. */
  pending: string;
  frame: number | null;
}

const CONNECTION_LOST: StreamFailure = {
  code: 'NETWORK_ERROR',
  message: 'The connection to the server was lost before the answer was complete.',
  retryAfter: null,
  requestId: null,
};

const UNREADABLE_STREAM: StreamFailure = {
  code: 'INVALID_RESPONSE',
  message: 'The server sent an answer the app could not read.',
  retryAfter: null,
  requestId: null,
};

// Background tabs pause animation frames; the final flush on `done` still renders everything.
function requestFrame(callback: () => void): number {
  return typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : window.setTimeout(callback, 16);
}

function cancelFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
  else window.clearTimeout(frame);
}

function toFailure(error: unknown): StreamFailure {
  if (isApiError(error)) {
    return {
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
      requestId: error.requestId,
    };
  }
  return error instanceof SyntaxError ? UNREADABLE_STREAM : CONNECTION_LOST;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Renders the text received since the last frame, now. */
function flush(run: Run, dispatch: Dispatch): void {
  if (run.frame !== null) {
    cancelFrame(run.frame);
    run.frame = null;
  }
  if (run.pending) {
    dispatch({ type: 'delta', runId: run.id, text: run.pending });
    run.pending = '';
  }
}

/** The unfinished answer as the server stores it (content so far, validated citations). */
function unfinishedAnswer(run: Run, userMessage: Message, status: 'aborted' | 'error'): Message {
  return {
    id: `local-${userMessage.id}`,
    conversationId: run.conversationId,
    role: 'assistant',
    content: run.text,
    status,
    rewrittenQuery: run.rewrittenQuery,
    sources: run.sources,
    citations: parseCitations(run.text, run.sources.length),
    usage: null,
    model: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Puts an unfinished turn into the cached history, the way the server saves it (the question,
 * and the partial answer when there is one), so the thread matches what a reload shows. The
 * cache is marked stale: the next visit replaces this copy with the server's.
 */
function keepUnfinishedTurn(queryClient: QueryClient, run: Run, status: 'aborted' | 'error') {
  const { userMessage } = run;
  if (!userMessage) {
    // Nothing was streamed; the question may or may not have been saved. Ask the server.
    void refetchConversation(queryClient, run.conversationId);
    return;
  }
  const messages = run.text
    ? [userMessage, unfinishedAnswer(run, userMessage, status)]
    : [userMessage];
  addMessagesToCache(queryClient, run.conversationId, messages);
  void markConversationStale(queryClient, run.conversationId);
  void refetchConversationList(queryClient);
}

export interface UseChatStreamOptions {
  /** Opens the event stream; injectable for tests. */
  sendMessage?: SendMessageFn;
}

/**
 * Sends a chat message and follows its server-sent events (see `stream-state.ts` for the
 * states). The finished turn is written into the TanStack Query cache, so the thread shows
 * the same history a reload would. One request at a time; unmounting stops it.
 */
export function useChatStream({ sendMessage = sendMessageRequest }: UseChatStreamOptions = {}) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chatStreamReducer, initialChatStreamState);
  const runRef = useRef<Run | null>(null);
  const runCount = useRef(0);

  const settle = useCallback((run: Run) => {
    flush(run, dispatch);
    run.settled = true;
  }, []);

  const fail = useCallback(
    (run: Run, failure: StreamFailure) => {
      settle(run);
      keepUnfinishedTurn(queryClient, run, 'error');
      dispatch({ type: 'fail', runId: run.id, error: failure });
    },
    [queryClient, settle],
  );

  /** Handles one event; returns true once the turn is over. */
  const handleEvent = useCallback(
    (run: Run, event: ChatStreamEvent): boolean => {
      switch (event.type) {
        case 'start':
          run.userMessage = event.userMessage;
          run.rewrittenQuery = event.rewrittenQuery;
          run.sources = event.sources;
          dispatch({
            type: 'start',
            runId: run.id,
            userMessage: event.userMessage,
            rewrittenQuery: event.rewrittenQuery,
            sources: event.sources,
          });
          // The API names a new conversation after its first question before streaming.
          void refetchConversationList(queryClient);
          return false;
        case 'delta':
          run.text += event.text;
          run.pending += event.text;
          run.frame ??= requestFrame(() => {
            run.frame = null;
            flush(run, dispatch);
          });
          return false;
        case 'done':
          settle(run);
          // Cache first, then state: the render that ends the live turn already has the history.
          addMessagesToCache(
            queryClient,
            run.conversationId,
            run.userMessage ? [run.userMessage, event.message] : [event.message],
          );
          dispatch({ type: 'done', runId: run.id, message: event.message });
          void refetchConversationList(queryClient);
          return true;
        case 'error':
          fail(run, {
            code: event.code,
            message: event.message,
            retryAfter: null,
            requestId: null,
          });
          return true;
      }
    },
    [queryClient, settle, fail],
  );

  const readEvents = useCallback(
    async (run: Run, response: Response) => {
      if (!response.body) {
        fail(run, UNREADABLE_STREAM);
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      const parser = createSseParser();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const event of parser.push(value)) {
            if (run.settled || handleEvent(run, event)) {
              void reader.cancel().catch(() => undefined);
              return;
            }
          }
        }
      } catch (error) {
        if (run.settled || isAbortError(error)) return;
        fail(run, toFailure(error));
        return;
      }
      // The stream ended without `done` or `error`: the server went away mid-answer.
      if (!run.settled) fail(run, CONNECTION_LOST);
    },
    [fail, handleEvent],
  );

  /**
   * Sends a question; the promise settles when the turn does (never rejects: failures end
   * up in `state.error`). Ignored while another request is active.
   */
  const send = useCallback(
    async (conversationId: string, question: string): Promise<void> => {
      if (runRef.current && !runRef.current.settled) return;
      runCount.current += 1;
      const run: Run = {
        id: runCount.current,
        conversationId,
        question,
        controller: new AbortController(),
        settled: false,
        userMessage: null,
        rewrittenQuery: null,
        sources: [],
        text: '',
        pending: '',
        frame: null,
      };
      runRef.current = run;
      dispatch({ type: 'send', runId: run.id, conversationId, question });

      let response: Response;
      try {
        response = await sendMessage(conversationId, question, run.controller.signal);
      } catch (error) {
        if (run.settled || isAbortError(error)) return;
        fail(run, toFailure(error));
        return;
      }
      if (run.settled) return;
      await readEvents(run, response);
    },
    [sendMessage, fail, readEvents],
  );

  /** Stops the answer. The server saves what was generated so far as "aborted". */
  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run || run.settled) return;
    settle(run);
    run.controller.abort();
    keepUnfinishedTurn(queryClient, run, 'aborted');
    dispatch({ type: 'abort', runId: run.id });
  }, [queryClient, settle]);

  /** Sends the last question again (after an error, or to regenerate a stopped answer). */
  const retry = useCallback(async () => {
    const run = runRef.current;
    if (run?.settled) await send(run.conversationId, run.question);
  }, [send]);

  /** Clears a settled turn (for example, dismissing an error). */
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  // Leaving the chat closes the connection; the server keeps the partial answer.
  useEffect(() => stop, [stop]);

  return useMemo(() => ({ state, send, stop, retry, reset }), [state, send, stop, retry, reset]);
}

export type ChatStream = ReturnType<typeof useChatStream>;
