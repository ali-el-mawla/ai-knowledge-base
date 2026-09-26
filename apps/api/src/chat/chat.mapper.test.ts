import type { Source } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import {
  type MessageRow,
  parseSourcesSnapshot,
  toConversation,
  toMessage,
  toSourcesSnapshot,
} from './chat.mapper.js';

const SOURCE: Source = {
  index: 1,
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  documentTitle: 'Handbook',
  headingPath: 'Leave',
  content: 'Full-time staff get 25 days.',
  score: { fused: 0.0325, semanticRank: 1, keywordRank: null },
};

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'message-1',
    conversation_id: 'conversation-1',
    role: 'assistant',
    content: 'You get 25 days [1].',
    status: 'complete',
    rewritten_query: 'How many vacation days do full-time staff get?',
    sources: toSourcesSnapshot([SOURCE]),
    citations: [1],
    prompt_tokens: 812,
    completion_tokens: 40,
    model: 'anthropic/claude-haiku-4-5',
    created_at: '2026-09-26T10:00:00+00:00',
    ...overrides,
  };
}

describe('toMessage', () => {
  it('maps an assistant row, with its sources snapshot, citations and usage', () => {
    expect(toMessage(messageRow())).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: 'You get 25 days [1].',
      status: 'complete',
      rewrittenQuery: 'How many vacation days do full-time staff get?',
      sources: [SOURCE],
      citations: [1],
      usage: { promptTokens: 812, completionTokens: 40 },
      model: 'anthropic/claude-haiku-4-5',
      createdAt: '2026-09-26T10:00:00+00:00',
    });
  });

  it('maps a user row: no usage, no sources, no model', () => {
    const message = toMessage(
      messageRow({
        role: 'user',
        rewritten_query: null,
        sources: [],
        citations: [],
        prompt_tokens: null,
        completion_tokens: null,
        model: null,
      }),
    );
    expect(message).toMatchObject({ role: 'user', usage: null, sources: [], model: null });
  });

  it('keeps aborted and error statuses', () => {
    expect(toMessage(messageRow({ status: 'aborted' })).status).toBe('aborted');
    expect(toMessage(messageRow({ status: 'error' })).status).toBe('error');
  });
});

describe('sources snapshot', () => {
  it('round-trips through jsonb unchanged', () => {
    const json = JSON.parse(JSON.stringify(toSourcesSnapshot([SOURCE]))) as ReturnType<
      typeof toSourcesSnapshot
    >;
    expect(parseSourcesSnapshot(json)).toEqual([SOURCE]);
  });

  it('shows no sources for a snapshot it cannot read, instead of failing', () => {
    expect(parseSourcesSnapshot([{ index: 'one' }])).toEqual([]);
    expect(parseSourcesSnapshot({ not: 'an array' })).toEqual([]);
  });
});

describe('toConversation', () => {
  it('maps a row to the DTO', () => {
    expect(
      toConversation({
        id: 'conversation-1',
        title: 'Leave questions',
        created_at: '2026-09-26T10:00:00+00:00',
        updated_at: '2026-09-26T11:00:00+00:00',
      }),
    ).toEqual({
      id: 'conversation-1',
      title: 'Leave questions',
      createdAt: '2026-09-26T10:00:00+00:00',
      updatedAt: '2026-09-26T11:00:00+00:00',
    });
  });
});
