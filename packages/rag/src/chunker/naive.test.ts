import { describe, expect, it } from 'vitest';
import {
  codeLines,
  consecutivePairs,
  distinctWords,
  handbook,
  hasBrokenCharacter,
  numberedSentences,
} from '../__fixtures__/fixtures.js';
import { buildEmbeddingText } from '../header.js';
import { DEFAULT_CHUNKER_OPTIONS, type TextChunk } from '../types.js';
import { chunkFixedSize } from './naive.js';

const TITLE = 'Northwind handbook';
const { maxChars, overlapChars, targetChars } = DEFAULT_CHUNKER_OPTIONS;

function chunk(content: string, title = TITLE): TextChunk[] {
  return chunkFixedSize({ title, content });
}

/**
 * Glues the chunks back together, dropping from each chunk the words that repeat the end
 * of the text so far. With distinct words the overlap is unambiguous.
 */
function mergeOverlaps(chunks: readonly TextChunk[]): { words: string[]; overlaps: string[][] } {
  const words: string[] = [];
  const overlaps: string[][] = [];
  for (const c of chunks) {
    const next = c.content.split(/\s+/);
    let shared = Math.min(words.length, next.length);
    while (shared > 0 && words.slice(-shared).join(' ') !== next.slice(0, shared).join(' ')) {
      shared -= 1;
    }
    overlaps.push(next.slice(0, shared));
    words.push(...next.slice(shared));
  }
  return { words, overlaps };
}

describe('chunkFixedSize', () => {
  it.each([
    { name: 'distinct words', title: TITLE, content: distinctWords(3_000) },
    { name: 'a 10,000-character paragraph', title: TITLE, content: numberedSentences(200) },
    { name: 'a 10,000-character word', title: TITLE, content: 'x'.repeat(10_000) },
    { name: '5,000 emoji without spaces', title: TITLE, content: '\u{1F600}'.repeat(5_000) },
    { name: 'a 1,900-character title', title: 'T'.repeat(1_900), content: numberedSentences(50) },
    { name: 'a code block', title: TITLE, content: `\`\`\`ts\n${codeLines(120)}\n\`\`\`` },
  ])('respects the hard limit, header included, for $name', ({ title, content }) => {
    const chunks = chunkFixedSize({ title, content });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(buildEmbeddingText(title, c.headingPath, c.content).length).toBeLessThanOrEqual(
        maxChars,
      );
      expect(c.content.length).toBeLessThanOrEqual(targetChars);
      expect(hasBrokenCharacter(c.content)).toBe(false);
    }
  });

  it('never splits a word', () => {
    const text = distinctWords(3_000);
    const vocabulary = new Set(text.split(/\s+/));
    for (const c of chunk(text)) {
      for (const word of c.content.split(/\s+/)) expect(vocabulary.has(word)).toBe(true);
    }
  });

  it('covers all the text: the chunks minus their overlaps give the content back', () => {
    const text = distinctWords(3_000);
    const chunks = chunk(text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(mergeOverlaps(chunks).words.join(' ')).toBe(text.split(/\s+/).join(' '));
  });

  it('overlaps consecutive windows by whole words, at most overlapChars', () => {
    const { overlaps } = mergeOverlaps(chunk(distinctWords(3_000)));
    for (const overlap of overlaps.slice(1)) {
      expect(overlap.length).toBeGreaterThan(0);
      expect(overlap.join(' ').length).toBeLessThanOrEqual(overlapChars);
    }
  });

  it('cuts a word longer than the window into pieces that add up to it', () => {
    const word = 'x'.repeat(10_000);
    expect(
      chunk(word)
        .map((c) => c.content)
        .join(''),
    ).toBe(word);
  });

  it('ignores markdown structure', () => {
    const chunks = chunkFixedSize({ title: TITLE, content: handbook }, { targetChars: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.headingPath === '')).toBe(true);
    expect(chunks.some((c) => c.content.includes('# Employee handbook'))).toBe(true);
  });

  it('carries the end of one window into the next', () => {
    const chunks = chunk(numberedSentences(100));
    for (const [previous, next] of consecutivePairs(chunks)) {
      const firstWords = next.content.split(' ').slice(0, 3).join(' ');
      expect(previous.content).toContain(firstWords);
    }
  });

  it('returns a short text as a single trimmed chunk', () => {
    expect(chunk('  A short note.\n')).toEqual([
      { index: 0, headingPath: '', content: 'A short note.', tokenEstimate: 4 },
    ]);
  });

  it('returns no chunks for empty or blank content', () => {
    expect(chunk('')).toEqual([]);
    expect(chunk(' \n\t ')).toEqual([]);
  });

  it('treats CRLF line endings like LF', () => {
    const text = distinctWords(1_000);
    expect(chunk(text.replace(/\n/g, '\r\n'))).toEqual(chunk(text));
  });

  it('is deterministic', () => {
    const text = distinctWords(2_000);
    expect(chunk(text)).toEqual(chunk(text));
  });
});
