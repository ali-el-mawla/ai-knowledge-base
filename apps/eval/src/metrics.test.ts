import { describe, expect, it } from 'vitest';
import {
  firstHitRank,
  formatMrr,
  formatRate,
  hitAtK,
  meanReciprocalRank,
  reciprocalRank,
  summarize,
} from './metrics.js';

describe('firstHitRank', () => {
  it('returns the 1-based position of the first hit', () => {
    expect(firstHitRank(['a', 'b', 'hit', 'hit'], (r) => r === 'hit')).toBe(3);
    expect(firstHitRank(['hit'], (r) => r === 'hit')).toBe(1);
  });

  it('returns null when nothing matches or nothing was retrieved', () => {
    expect(firstHitRank(['a', 'b'], (r) => r === 'hit')).toBeNull();
    expect(firstHitRank([], () => true)).toBeNull();
  });
});

describe('hitAtK', () => {
  // Five questions: first hits at ranks 1, 2, 4, 7 and one miss.
  const ranks = [1, 2, 4, 7, null];

  it('counts questions whose first hit is within the top k', () => {
    expect(hitAtK(ranks, 1)).toEqual({ hits: 1, total: 5 });
    expect(hitAtK(ranks, 3)).toEqual({ hits: 2, total: 5 });
    expect(hitAtK(ranks, 5)).toEqual({ hits: 3, total: 5 });
    expect(hitAtK(ranks, 10)).toEqual({ hits: 4, total: 5 });
  });

  it('includes a hit exactly at rank k', () => {
    expect(hitAtK([4], 4)).toEqual({ hits: 1, total: 1 });
  });

  it('handles an empty question set', () => {
    expect(hitAtK([], 5)).toEqual({ hits: 0, total: 0 });
  });
});

describe('reciprocal rank', () => {
  it('is 1/rank within the cutoff and 0 otherwise', () => {
    expect(reciprocalRank(1, 10)).toBe(1);
    expect(reciprocalRank(4, 10)).toBe(0.25);
    expect(reciprocalRank(11, 10)).toBe(0);
    expect(reciprocalRank(null, 10)).toBe(0);
  });

  it('averages over all questions, a miss counting as 0', () => {
    // (1 + 1/2 + 1/4 + 0) / 4 = 1.75 / 4 = 0.4375
    expect(meanReciprocalRank([1, 2, 4, null], 10)).toBeCloseTo(0.4375, 10);
    // With cutoff 3, rank 5 is outside, so both count 0.
    expect(meanReciprocalRank([5, null], 3)).toBe(0);
    expect(meanReciprocalRank([], 10)).toBe(0);
  });
});

describe('summarize', () => {
  it('reports hit@k in the order asked and MRR@cutoff', () => {
    const summary = summarize([1, 3, null], [1, 3, 5], 10);
    expect(summary.hitAt).toEqual([
      { k: 1, rate: { hits: 1, total: 3 } },
      { k: 3, rate: { hits: 2, total: 3 } },
      { k: 5, rate: { hits: 2, total: 3 } },
    ]);
    // (1 + 1/3 + 0) / 3 = 0.4444...
    expect(summary.mrr).toBeCloseTo(4 / 9, 10);
  });
});

describe('formatting', () => {
  it('writes a rate as count, total and rounded percentage', () => {
    expect(formatRate({ hits: 23, total: 30 })).toBe('23/30 (77%)');
    expect(formatRate({ hits: 1, total: 6 })).toBe('1/6 (17%)');
    expect(formatRate({ hits: 0, total: 0 })).toBe('n/a');
  });

  it('writes MRR with three decimals', () => {
    expect(formatMrr(4 / 9)).toBe('0.444');
    expect(formatMrr(1)).toBe('1.000');
  });
});
