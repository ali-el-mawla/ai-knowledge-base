import type { RetrievalMode } from '@repo/shared';

/**
 * Retrieval tuning, in one place on purpose: these numbers decide answer quality and cost.
 *
 * - `chatSources` (6): chunks given to the model per answer. Chunks are about 1,200
 *   characters, so 6 sources are roughly 1,800 tokens of evidence: enough for an answer
 *   spread over a few sections, small enough that the relevant chunk is not buried and
 *   every answer stays cheap. It is also the default `limit` of `POST /search`.
 * - `rrfK` (60): the constant of Reciprocal Rank Fusion, `score = sum(weight / (k + rank))`,
 *   as proposed by Cormack et al. (2009). A large k flattens the gap between rank 1 and
 *   rank 5, so a chunk that both arms rank fairly high beats one that only a single arm
 *   ranks first. Fusion uses ranks, not raw scores, because cosine distance and ts_rank
 *   live on different scales.
 * - `candidatesPerArm` (30): how many chunks the vector arm and the keyword arm each
 *   return before fusion (5x the sources). A chunk only earns both terms when it is in
 *   both lists, so the lists must be longer than the result. 30 also stays under
 *   pgvector's default `hnsw.ef_search` of 40, so one index pass can fill the vector arm.
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
