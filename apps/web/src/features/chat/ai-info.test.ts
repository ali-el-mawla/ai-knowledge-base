import type { AiInfo } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import { describeAiInfo, formatAiInfo } from './ai-info';

const info: AiInfo = {
  chat: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  rewrite: { provider: 'anthropic', model: 'claude-haiku-4-5' },
  embedding: { provider: 'ollama', model: 'nomic-embed-text', dimensions: 768 },
  staleChunks: 0,
};

describe('formatAiInfo', () => {
  it('names the chat and embedding models plainly', () => {
    expect(formatAiInfo(info)).toBe(
      'claude-haiku-4-5 via anthropic · embeddings: nomic-embed-text (ollama)',
    );
  });

  it('says when no chat model is configured', () => {
    expect(formatAiInfo({ ...info, chat: null, rewrite: null })).toBe(
      'No chat model · embeddings: nomic-embed-text (ollama)',
    );
  });
});

describe('describeAiInfo', () => {
  it('lists every model and warns about stale chunks', () => {
    expect(describeAiInfo({ ...info, staleChunks: 12 })).toEqual([
      'Answers: claude-haiku-4-5 (anthropic)',
      'Follow-up rewriting: claude-haiku-4-5 (anthropic)',
      'Embeddings: nomic-embed-text (ollama), 768 dimensions',
      '12 chunks were embedded with another model; run npm run reembed.',
    ]);
  });
});
