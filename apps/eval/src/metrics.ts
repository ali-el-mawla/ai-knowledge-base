/** A question's rank is the 1-based position of its first hit, or null when none was retrieved. */
export type Rank = number | null;

export interface Rate {
  hits: number;
  total: number;
}

export interface Summary {
  /** hit@k for each requested k, in the order requested. */
  hitAt: { k: number; rate: Rate }[];
  /** Mean reciprocal rank over the first `cutoff` results. */
  mrr: number;
}

/** 1-based position of the first result that passes `isHit`, or null. */
export function firstHitRank<T>(results: readonly T[], isHit: (result: T) => boolean): Rank {
  const index = results.findIndex(isHit);
  return index === -1 ? null : index + 1;
}

/** Questions whose first hit is within the top k. */
export function hitAtK(ranks: readonly Rank[], k: number): Rate {
  return { hits: ranks.filter((rank) => rank !== null && rank <= k).length, total: ranks.length };
}

/** 1/rank, or 0 when there is no hit within the cutoff. */
export function reciprocalRank(rank: Rank, cutoff: number): number {
  return rank !== null && rank <= cutoff ? 1 / rank : 0;
}

/** Mean of 1/rank over all questions (a miss counts as 0). 0 for an empty list. */
export function meanReciprocalRank(ranks: readonly Rank[], cutoff: number): number {
  if (ranks.length === 0) return 0;
  const sum = ranks.reduce<number>((total, rank) => total + reciprocalRank(rank, cutoff), 0);
  return sum / ranks.length;
}

export function summarize(ranks: readonly Rank[], ks: readonly number[], cutoff: number): Summary {
  return {
    hitAt: ks.map((k) => ({ k, rate: hitAtK(ranks, k) })),
    mrr: meanReciprocalRank(ranks, cutoff),
  };
}

/** "23/30 (77%)"; "n/a" when there is nothing to count. */
export function formatRate({ hits, total }: Rate): string {
  if (total === 0) return 'n/a';
  return `${hits}/${total} (${Math.round((100 * hits) / total)}%)`;
}

export function formatMrr(mrr: number): string {
  return mrr.toFixed(3);
}
