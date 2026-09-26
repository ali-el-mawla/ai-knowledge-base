import { describe, expect, it } from 'vitest';
import { parseCitations, stripCitations } from './citations.js';

describe('parseCitations', () => {
  it.each([
    ['a single marker', 'Parents get 16 weeks [1].', [1]],
    ['markers after several claims', 'A [1]. B [3]. C [2].', [1, 2, 3]],
    ['adjacent markers', 'Both agree [2][3].', [2, 3]],
    ['a comma list', 'Both agree [1, 3] and [2,4].', [1, 2, 3, 4]],
    ['a hyphen range', 'See [2-4].', [2, 3, 4]],
    ['an en dash range', 'See [2–4].', [2, 3, 4]],
    ['spaces inside the brackets', 'See [ 2 ].', [2]],
    ['repeated numbers, once and sorted', 'X [3]. Y [1]. Z [3][1].', [1, 3]],
  ])('reads %s', (_, text, expected) => {
    expect(parseCitations(text, 5)).toEqual(expected);
  });

  it.each([
    ['zero', 'Nothing [0].'],
    ['numbers above the source count', 'Nothing [6] or [99].'],
    ['a reversed range', 'Nothing [3-1].'],
    ['markdown links', 'See [1](https://example.com) and ![2](chart.png).'],
    ['footnotes', 'A footnote[^1].'],
    ['inline code', 'Use `items[1]` here.'],
    ['fenced code', '```ts\nconst first = items[1];\n```'],
    ['text without markers', 'Plain answer.'],
  ])('ignores %s', (_, text) => {
    expect(parseCitations(text, 5)).toEqual([]);
  });

  it('keeps the valid part of a range that runs past the sources', () => {
    expect(parseCitations('See [4-9] and [0-1].', 5)).toEqual([1, 4, 5]);
  });

  it('does not loop over a huge range', () => {
    expect(parseCitations('See [1-999999999].', 3)).toEqual([1, 2, 3]);
  });

  it('finds nothing when there are no sources', () => {
    expect(parseCitations('Claim [1].', 0)).toEqual([]);
  });
});

describe('stripCitations', () => {
  it.each([
    ['a marker before a period', 'Employees get 25 days [1].', 'Employees get 25 days.'],
    [
      'adjacent markers before a comma',
      'Birth parents get 16 weeks [1][2], other parents 8 weeks [3].',
      'Birth parents get 16 weeks, other parents 8 weeks.',
    ],
    [
      'lists and ranges mid-sentence',
      'Leave [1, 2] can be split [2-3] in two.',
      'Leave can be split in two.',
    ],
    ['markers separated by spaces', 'See [1] [2] for details.', 'See for details.'],
    ['a marker glued to a word', 'Claim[1] and more.', 'Claim and more.'],
    [
      'markers at the start of lines, keeping indentation',
      '[1] Starts a line.\n  - [2] nested item',
      'Starts a line.\n  - nested item',
    ],
    ['a marker at the end of a line', 'Line one [1]\nLine two', 'Line one\nLine two'],
  ])('removes %s', (_, text, expected) => {
    expect(stripCitations(text)).toBe(expected);
  });

  it('leaves no double spaces and no space before punctuation', () => {
    const stripped = stripCitations(
      'Parental leave is 16 weeks [1], paid in full [2]. It can start early [3] if needed [2-3].',
    );
    expect(stripped).toBe(
      'Parental leave is 16 weeks, paid in full. It can start early if needed.',
    );
    expect(stripped).not.toMatch(/ {2}|\s[.,]/);
  });

  it('keeps links, footnotes and code untouched', () => {
    const text =
      'Read [the guide](https://example.com) and [^1].\n\n```ts\nconst x = items[1];\n```\n\nUse `a[2]`.';
    expect(stripCitations(text)).toBe(text);
  });

  it('returns text without markers unchanged', () => {
    expect(stripCitations('A plain answer, with a list:\n\n- one\n- two')).toBe(
      'A plain answer, with a list:\n\n- one\n- two',
    );
  });
});
