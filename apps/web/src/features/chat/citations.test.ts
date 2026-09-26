import { describe, expect, it } from 'vitest';
import { markerNumbers, parseCitations, splitCitationMarkers } from './citations';

// The same cases as packages/rag/src/citations.test.ts: the web copy must read markers
// exactly like the API does, or chips and the server's `citations` would disagree.
describe('parseCitations (parity with @repo/rag)', () => {
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
    ['an unclosed fence (mid-stream)', 'Code:\n```ts\nconst first = items[1];'],
    ['text without markers', 'Plain answer.'],
  ])('ignores %s', (_, text) => {
    expect(parseCitations(text, 5)).toEqual([]);
  });

  it('keeps the valid part of a range and does not loop over a huge one', () => {
    expect(parseCitations('See [4-9] and [0-1].', 5)).toEqual([1, 4, 5]);
    expect(parseCitations('See [1-999999999].', 3)).toEqual([1, 2, 3]);
  });
});

describe('markerNumbers', () => {
  it('expands lists and ranges in reading order, without repeats', () => {
    expect(markerNumbers('[3, 1-2, 3]', 5)).toEqual([3, 1, 2]);
  });

  it('drops numbers outside 1..sourceCount', () => {
    expect(markerNumbers('[0, 2, 7]', 5)).toEqual([2]);
    expect(markerNumbers('[9]', 5)).toEqual([]);
  });
});

describe('splitCitationMarkers', () => {
  it('splits prose into text and markers, in order', () => {
    expect(splitCitationMarkers('Leave is 25 days [1][2], or more [3-4].')).toEqual([
      { type: 'text', value: 'Leave is 25 days ' },
      { type: 'marker', value: '[1]' },
      { type: 'marker', value: '[2]' },
      { type: 'text', value: ', or more ' },
      { type: 'marker', value: '[3-4]' },
      { type: 'text', value: '.' },
    ]);
  });

  it('returns the text alone when there is no marker', () => {
    expect(splitCitationMarkers('No markers [a] here')).toEqual([
      { type: 'text', value: 'No markers [a] here' },
    ]);
  });
});
