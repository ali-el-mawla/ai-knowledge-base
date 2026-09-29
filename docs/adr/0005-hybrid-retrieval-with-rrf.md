# 0005. Hybrid retrieval fused with Reciprocal Rank Fusion

- Status: accepted
- Date: 2026-09-26

## Context

Vector search finds meaning ("time off after a baby" finds "Parental leave") but blurs exact identifiers such as `PLN-GROWTH-24` or `SEV2`. Keyword search is the opposite. Their scores cannot be added: cosine distance and `ts_rank_cd` live on different scales. Retrieval runs under RLS, which filters rows after an approximate (HNSW) index scan, and results must be reproducible for the evaluation to mean anything.

## Decision

One SQL function, `hybrid_search`, `security invoker` so RLS applies:

- Semantic arm: cosine distance over HNSW, top 30, only chunks of the configured embedding model.
- Keyword arm: full-text search over a generated `tsvector` (title and heading path weigh more than the body), `ts_rank_cd`, top 30. The query is the OR of the question's stemmed lexemes, because `websearch_to_tsquery` ANDs every word and a natural question would match almost nothing.
- Reciprocal Rank Fusion: `weight / (60 + rank)` summed over the arms a chunk appears in. k = 60 from Cormack, Clarke and Buettcher (2009): a chunk both arms rank well beats one that only one arm ranks first.
- `hnsw.iterative_scan = relaxed_order` (pgvector 0.8), so the index keeps scanning until it finds enough of the caller's rows.
- Deterministic order: ties end with the content hash (the evaluation caught keyword ties reordering results).
- Modes by weights: 1/1 hybrid, 1/0 vector, 0/1 keyword, for `POST /search` and the evaluation. 6 sources go to the chat.

## Consequences

- Exact codes and paraphrases are both findable. The source panel shows both ranks and the fused score, which explains a surprising result.
- Fusion is plain SQL in one round trip: no second service, no score calibration.
- The keyword arm uses the English configuration.
- 30 candidates (under pgvector's default `ef_search` of 40) and k = 60 are defaults, not tuned values. The evaluation decides whether a reranker is worth adding.
