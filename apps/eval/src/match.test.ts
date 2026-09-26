import { describe, expect, it } from 'vitest';
import { containsAnswer, normalizeForMatch } from './match.js';

describe('normalizeForMatch', () => {
  it('collapses whitespace, including line breaks, and lowercases', () => {
    expect(normalizeForMatch('  Page size:\n  default 50,\tmaximum 200 ')).toBe(
      'page size: default 50, maximum 200',
    );
  });

  it('drops emphasis and code markers', () => {
    expect(normalizeForMatch('**18 weeks** at _full_ `base` pay')).toBe(
      '18 weeks at full base pay',
    );
  });

  it('turns table pipes into spaces', () => {
    expect(normalizeForMatch('| P1 | 15 minutes, 24/7 |')).toBe('p1 15 minutes, 24/7');
  });
});

describe('containsAnswer', () => {
  it('finds a span inside a table row', () => {
    const chunk = '| Code | Category |\n|---|---|\n| EXP-TRV-04 | Meals and incidentals per diem |';
    expect(containsAnswer(chunk, 'Meals and incidentals per diem')).toBe(true);
  });

  it('finds a span that a chunk wrapped onto two lines or put in bold', () => {
    expect(
      containsAnswer(
        'they repay\n100% of the **gross amount**.',
        'they repay 100% of the gross amount',
      ),
    ).toBe(true);
  });

  it('finds a span inside a code comment', () => {
    const chunk = '```ts\n// Reject events more than 300 seconds old\nif (age > 300) return;\n```';
    expect(containsAnswer(chunk, 'more than 300 seconds old')).toBe(true);
  });

  it('rejects a chunk that holds only part of the span', () => {
    expect(containsAnswer('they repay 100% of the', 'they repay 100% of the gross amount')).toBe(
      false,
    );
  });

  it('matches whole words only at the edges of the span', () => {
    expect(containsAnswer('Page size: maximum 1200 items.', '200 items')).toBe(false);
    expect(containsAnswer('the max is 2000', 'max is 200')).toBe(false);
    expect(containsAnswer('the maximum is 200.', 'maximum is 200')).toBe(true);
    // A later occurrence on word boundaries still counts after an earlier glued one.
    expect(containsAnswer('1200 items, then 200 items', '200 items')).toBe(true);
  });

  it('allows punctuation at the edges of the span', () => {
    expect(containsAnswer('(default 50, maximum 200)', 'default 50, maximum 200')).toBe(true);
  });

  it('never matches an empty answer', () => {
    expect(containsAnswer('anything', '  ** ')).toBe(false);
  });
});
