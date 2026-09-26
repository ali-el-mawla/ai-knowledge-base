import type { Message, Source } from '@repo/shared';

/** Builders for chat tests: complete objects with overridable fields. */

export function makeSource(index: number, overrides: Partial<Source> = {}): Source {
  return {
    index,
    chunkId: `chunk-${index}`,
    documentId: `doc-${index}`,
    documentTitle: `Document ${index}`,
    headingPath: `Section ${index}`,
    content: `Passage number ${index}.`,
    score: { fused: 0.03 / index, semanticRank: index, keywordRank: null },
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    role: 'user',
    content: 'How many leave days do I get?',
    status: 'complete',
    rewrittenQuery: null,
    sources: [],
    citations: [],
    usage: null,
    model: null,
    createdAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}
