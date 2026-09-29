import type { RetrievalMode } from '@repo/shared';

/**
 * Retrieval settings; these numbers decide answer quality and cost.
 *
 * - `chatSources` (6): chunks given to the model per answer, and the default `limit` of
 *   `POST /search`. Chunks target 1,200 characters (the demo corpus averages about 490),
 *   so 6 sources are at most about 1,800 tokens of evidence and usually far less: enough
 *   for an answer spread over a few sections, few enough that the relevant chunk is not
 *   buried and answers stay cheap.
 * - `rrfK` (60): the Reciprocal Rank Fusion constant, `score = sum(weight / (k + rank))`,
 *   from Cormack et al. (2009). A large k flattens the gap between rank 1 and rank 5, so a
 *   chunk both arms rank fairly high beats one that only a single arm ranks first. Fusion
 *   uses ranks because cosine distance and ts_rank live on different scales.
 * - `candidatesPerArm` (30): chunks each arm returns before fusion (5x the sources). A
 *   chunk earns both terms only when it is in both lists, so the lists must be longer than
 *   the result. 30 also stays under pgvector's default `hnsw.ef_search` of 40, so one
 *   index pass can fill the vector arm.
 */
export const RETRIEVAL = {
  chatSources: 6,
  rrfK: 60,
  candidatesPerArm: 30,
} as const;

export interface ArmWeights {
  /** Weight of the vector (cosine similarity) arm; 0 switches it off. */
  semantic: number;
  /** Weight of the keyword (full-text) arm; 0 switches it off. */
  fullText: number;
}

/** One SQL function serves all modes: vector-only and keyword-only are hybrid with one arm off. */
export const MODE_WEIGHTS: Readonly<Record<RetrievalMode, ArmWeights>> = {
  hybrid: { semantic: 1, fullText: 1 },
  vector: { semantic: 1, fullText: 0 },
  keyword: { semantic: 0, fullText: 1 },
};
