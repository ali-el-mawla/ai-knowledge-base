import { describe, expect, it } from 'vitest';
import {
  type ChatStreamAction,
  type ChatStreamState,
  chatStreamReducer,
  initialChatStreamState,
  isStreamActive,
} from './stream-state';
import { makeMessage, makeSource } from './test-fixtures';

const userMessage = makeMessage({ id: 'user-1' });
const answer = makeMessage({
  id: 'answer-1',
  role: 'assistant',
  content: 'You get 25 days [1].',
  citations: [1],
});
const failure = {
  code: 'AI_PROVIDER_ERROR',
  message: 'Provider down',
  retryAfter: null,
  requestId: null,
} as const;

function run(actions: ChatStreamAction[], from: ChatStreamState = initialChatStreamState) {
  return actions.reduce(chatStreamReducer, from);
}

const send: ChatStreamAction = { type: 'send', runId: 1, conversationId: 'c1', question: 'Leave?' };
const start: ChatStreamAction = {
  type: 'start',
  runId: 1,
  userMessage,
  rewrittenQuery: 'annual leave days',
  sources: [makeSource(1)],
};

describe('chatStreamReducer', () => {
  it('goes idle -> sending on send, remembering the question', () => {
    const state = run([send]);
    expect(state).toMatchObject({
      status: 'sending',
      runId: 1,
      conversationId: 'c1',
      question: 'Leave?',
      text: '',
      error: null,
    });
  });

  it('goes sending -> streaming on start, with the saved question and sources', () => {
    const state = run([send, start]);
    expect(state.status).toBe('streaming');
    expect(state.userMessage).toBe(userMessage);
    expect(state.rewrittenQuery).toBe('annual leave days');
    expect(state.sources).toHaveLength(1);
  });

  it('appends deltas while streaming and ignores empty ones', () => {
    const state = run([
      send,
      start,
      { type: 'delta', runId: 1, text: 'You get ' },
      { type: 'delta', runId: 1, text: '' },
      { type: 'delta', runId: 1, text: '25 days' },
    ]);
    expect(state.text).toBe('You get 25 days');
  });

  it('goes streaming -> done and takes the saved content as the final text', () => {
    const state = run([
      send,
      start,
      { type: 'delta', runId: 1, text: 'You get 25' },
      { type: 'done', runId: 1, message: answer },
    ]);
    expect(state).toMatchObject({ status: 'done', message: answer, text: 'You get 25 days [1].' });
  });

  it('marks a failure before streaming as a request error', () => {
    const state = run([send, { type: 'fail', runId: 1, error: failure }]);
    expect(state.status).toBe('error');
    expect(state.error).toEqual({ ...failure, phase: 'request' });
  });

  it('marks a failure while streaming as a stream error and keeps the partial text', () => {
    const state = run([
      send,
      start,
      { type: 'delta', runId: 1, text: 'Partial' },
      { type: 'fail', runId: 1, error: failure },
    ]);
    expect(state.status).toBe('error');
    expect(state.error?.phase).toBe('stream');
    expect(state.text).toBe('Partial');
  });

  it.each([
    ['sending', [send]],
    ['streaming', [send, start, { type: 'delta', runId: 1, text: 'Partial' }]],
  ] as const)('aborts from %s and keeps what arrived', (_, actions) => {
    const state = run([...actions, { type: 'abort', runId: 1 }]);
    expect(state.status).toBe('aborted');
    expect(state.question).toBe('Leave?');
  });

  it('ignores a second send while a request is active', () => {
    const active = run([send, start]);
    expect(
      chatStreamReducer(active, { type: 'send', runId: 2, conversationId: 'c2', question: 'x' }),
    ).toBe(active);
  });

  it.each(['done', 'error', 'aborted'] as const)('can send again after %s', (status) => {
    const settled: ChatStreamState = { ...run([send, start]), status };
    const next = chatStreamReducer(settled, {
      type: 'send',
      runId: 2,
      conversationId: 'c1',
      question: 'Again',
    });
    expect(next).toMatchObject({ status: 'sending', runId: 2, question: 'Again', text: '' });
    expect(next.userMessage).toBeNull();
  });

  it('ignores events of an earlier run', () => {
    const current = run([send, start, { type: 'abort', runId: 1 }, { ...send, runId: 2 }]);
    const late: ChatStreamAction[] = [
      { type: 'start', runId: 1, userMessage, rewrittenQuery: null, sources: [] },
      { type: 'delta', runId: 1, text: 'stale' },
      { type: 'done', runId: 1, message: answer },
      { type: 'fail', runId: 1, error: failure },
    ];
    expect(run(late, current)).toBe(current);
  });

  it('ignores events that do not fit the current state', () => {
    const sending = run([send]);
    expect(chatStreamReducer(sending, { type: 'delta', runId: 1, text: 'early' })).toBe(sending);
    expect(chatStreamReducer(sending, { type: 'done', runId: 1, message: answer })).toBe(sending);

    const streaming = run([send, start]);
    expect(chatStreamReducer(streaming, start)).toBe(streaming);

    const done = run([send, start, { type: 'done', runId: 1, message: answer }]);
    expect(chatStreamReducer(done, { type: 'abort', runId: 1 })).toBe(done);
    expect(chatStreamReducer(done, { type: 'fail', runId: 1, error: failure })).toBe(done);
  });

  it('resets a settled turn but keeps the run id; an active one is left alone', () => {
    const errored = run([send, { type: 'fail', runId: 1, error: failure }]);
    expect(chatStreamReducer(errored, { type: 'reset' })).toEqual({
      ...initialChatStreamState,
      runId: 1,
    });
    const active = run([send]);
    expect(chatStreamReducer(active, { type: 'reset' })).toBe(active);
  });

  it('reports sending and streaming as active', () => {
    expect(
      ['idle', 'sending', 'streaming', 'done', 'error', 'aborted'].map((s) =>
        isStreamActive(s as ChatStreamState['status']),
      ),
    ).toEqual([false, true, true, false, false, false]);
  });
});
