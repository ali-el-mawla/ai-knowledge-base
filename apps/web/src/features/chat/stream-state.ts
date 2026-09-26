import type { Message, Source } from '@repo/shared';
import type { ApiError } from '@/lib/api-client';

/**
 * One chat turn, as the UI sees it:
 *
 *   idle -> sending -> streaming -> done
 *              |           |------> error    (an `error` event, or the connection dropped)
 *              |           |------> aborted  (stop(), or the view unmounted)
 *              |------------------> error    (the request failed before streaming: 429, 503...)
 *              |------------------> aborted
 *
 * Any settled state (done, error, aborted) can send again. Every action of a run carries
 * its run id, so events that arrive late from an earlier run are ignored.
 */
export type ChatStreamStatus = 'idle' | 'sending' | 'streaming' | 'done' | 'error' | 'aborted';

export interface ChatStreamError {
  code: ApiError['code'];
  message: string;
  /** `request`: nothing was streamed (the question may not be saved). `stream`: it broke midway. */
  phase: 'request' | 'stream';
  /** Seconds to wait before retrying (rate limit), when the server said. */
  retryAfter: number | null;
  requestId: string | null;
}

export interface ChatStreamState {
  status: ChatStreamStatus;
  runId: number;
  conversationId: string | null;
  /** The question as typed, kept for Retry. */
  question: string;
  /** The saved user message, from the `start` event. */
  userMessage: Message | null;
  rewrittenQuery: string | null;
  sources: Source[];
  /** The answer so far; the saved content once done. */
  text: string;
  /** The saved assistant message, from the `done` event. */
  message: Message | null;
  error: ChatStreamError | null;
}

export type ChatStreamAction =
  | { type: 'send'; runId: number; conversationId: string; question: string }
  | {
      type: 'start';
      runId: number;
      userMessage: Message;
      rewrittenQuery: string | null;
      sources: Source[];
    }
  | { type: 'delta'; runId: number; text: string }
  | { type: 'done'; runId: number; message: Message }
  | { type: 'fail'; runId: number; error: Omit<ChatStreamError, 'phase'> }
  | { type: 'abort'; runId: number }
  | { type: 'reset' };

export const initialChatStreamState: ChatStreamState = {
  status: 'idle',
  runId: 0,
  conversationId: null,
  question: '',
  userMessage: null,
  rewrittenQuery: null,
  sources: [],
  text: '',
  message: null,
  error: null,
};

/** A request is in flight: sending another one must wait (or stop this one first). */
export function isStreamActive(status: ChatStreamStatus): boolean {
  return status === 'sending' || status === 'streaming';
}

export function chatStreamReducer(
  state: ChatStreamState,
  action: ChatStreamAction,
): ChatStreamState {
  if (action.type === 'reset') {
    // Keeps the run id, so a late event of the finished run still finds a mismatch.
    return isStreamActive(state.status) ? state : { ...initialChatStreamState, runId: state.runId };
  }
  if (action.type === 'send') {
    if (isStreamActive(state.status)) return state;
    return {
      ...initialChatStreamState,
      status: 'sending',
      runId: action.runId,
      conversationId: action.conversationId,
      question: action.question,
    };
  }
  if (action.runId !== state.runId) return state;

  switch (action.type) {
    case 'start':
      if (state.status !== 'sending') return state;
      return {
        ...state,
        status: 'streaming',
        userMessage: action.userMessage,
        rewrittenQuery: action.rewrittenQuery,
        sources: action.sources,
      };
    case 'delta':
      if (state.status !== 'streaming' || !action.text) return state;
      return { ...state, text: state.text + action.text };
    case 'done':
      if (state.status !== 'streaming') return state;
      return { ...state, status: 'done', message: action.message, text: action.message.content };
    case 'fail':
      if (!isStreamActive(state.status)) return state;
      return {
        ...state,
        status: 'error',
        error: { ...action.error, phase: state.status === 'sending' ? 'request' : 'stream' },
      };
    case 'abort':
      if (!isStreamActive(state.status)) return state;
      return { ...state, status: 'aborted' };
  }
}
