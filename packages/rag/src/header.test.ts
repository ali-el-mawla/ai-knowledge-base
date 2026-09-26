import { describe, expect, it } from 'vitest';
import { buildChunkHeader, buildEmbeddingText, estimateTokens, hashChunk } from './header.js';

describe('buildChunkHeader', () => {
  it('joins the title and the heading path', () => {
    expect(buildChunkHeader('Handbook', 'Leave > Parental leave')).toBe(
      'Handbook > Leave > Parental leave',
    );
  });

  it('uses the title alone before the first heading', () => {
    expect(buildChunkHeader('Handbook', '')).toBe('Handbook');
  });

  it('does not repeat an H1 that equals the title', () => {
    expect(buildChunkHeader('Travel Policy', 'travel policy > Meals > Limits')).toBe(
      'Travel Policy > Meals > Limits',
    );
    expect(buildChunkHeader('Travel Policy', 'Travel Policy')).toBe('Travel Policy');
  });
});

describe('hashChunk', () => {
  const base = {
    embeddingModel: 'nomic-embed-text',
    dimensions: 768,
    prefix: 'search_document: ',
    embeddingText: buildEmbeddingText('Handbook', 'Leave', 'Twenty days.'),
  };

  it('is stable for the same input', () => {
    expect(hashChunk(base)).toBe(hashChunk({ ...base }));
  });

  it.each([
    ['model', { embeddingModel: 'text-embedding-3-small' }],
    ['dimensions', { dimensions: 512 }],
    ['prefix', { prefix: '' }],
    ['text', { embeddingText: buildEmbeddingText('Handbook', 'Leave', 'Twenty-five days.') }],
  ])('changes when the %s changes', (_name, change) => {
    expect(hashChunk({ ...base, ...change })).not.toBe(hashChunk(base));
  });
});

describe('estimateTokens', () => {
  it('rounds up and never returns zero', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
