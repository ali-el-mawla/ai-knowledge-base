import { describe, expect, it } from 'vitest';
import { safeCutIndex, truncateText } from './text.js';

describe('truncateText', () => {
  it('returns text that fits unchanged', () => {
    expect(truncateText('short', 10)).toBe('short');
    expect(truncateText('exactly10!', 10)).toBe('exactly10!');
  });

  it('cuts to the limit, ellipsis included', () => {
    expect(truncateText('abcdefghij', 5)).toBe('abcd…');
  });

  it('never breaks an emoji in half', () => {
    // "ab" + two emoji is 6 UTF-16 units; cutting at 3 would split the first emoji.
    expect(truncateText('ab\u{1F600}\u{1F600}', 4)).toBe('ab…');
  });
});

describe('safeCutIndex', () => {
  it('moves a cut out of the middle of a surrogate pair', () => {
    expect(safeCutIndex('a\u{1F600}b', 2)).toBe(1);
    expect(safeCutIndex('a\u{1F600}b', 3)).toBe(3);
    expect(safeCutIndex('abc', 2)).toBe(2);
  });
});
