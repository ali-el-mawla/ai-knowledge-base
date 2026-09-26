-- Deterministic ranking. Keyword scores tie often (ts_rank_cd over short chunks), and
-- ties were broken by physical row order, so rewriting unchanged rows could reorder
-- results between runs. Every ORDER BY now ends with the chunk's content hash, which
-- is stable for identical content, so the same data always ranks the same way.
-- Found by the retrieval evaluation (apps/eval).

-- Using a vector value loads the pgvector library in this session, which registers
-- its settings (hnsw.iterative_scan). Without it the setting is an unknown
-- placeholder, and Postgres only lets superusers attach unknown settings to a function.
select '[1]'::extensions.vector;

create or replace function public.hybrid_search(
  query_text text,
  query_embedding extensions.vector(768),
  query_embedding_model text,
  match_count integer default 6,
  full_text_weight double precision default 1,
  semantic_weight double precision default 1,
  rrf_k integer default 60,
  candidate_count integer default 30
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  heading_path text,
  content text,
  semantic_rank integer,
  keyword_rank integer,
  fused_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.iterative_scan = relaxed_order
as $$
  with
  -- websearch_to_tsquery would AND every word, so a natural-language question would
  -- rarely match anything. Instead OR the question's stemmed lexemes together and let
  -- ts_rank_cd reward chunks that contain more of them, closer together.
  keyword_query as (
    select to_tsquery('simple', string_agg(quote_literal(t.lexeme), ' | ')) as tsq
    from unnest(to_tsvector('english', query_text)) as t
  ),
  semantic as (
    select nearest.id, row_number() over (order by nearest.distance, nearest.content_hash) as rank_ix
    from (
      -- Ordering by distance alone keeps the HNSW index usable; ties are broken outside.
      select c.id, c.content_hash, c.embedding <=> query_embedding as distance
      from document_chunks c
      where semantic_weight > 0
        and c.embedding_model = query_embedding_model
      order by c.embedding <=> query_embedding
      limit candidate_count
    ) as nearest
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc, c.content_hash) as rank_ix
    from document_chunks c
    cross join keyword_query q
    where full_text_weight > 0
      and q.tsq is not null
      and c.embedding_model = query_embedding_model
      and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc, c.content_hash
    limit candidate_count
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      s.rank_ix::integer as semantic_rank,
      k.rank_ix::integer as keyword_rank,
      coalesce(semantic_weight / (rrf_k + s.rank_ix), 0.0)
        + coalesce(full_text_weight / (rrf_k + k.rank_ix), 0.0) as fused_score
    from semantic s
    full outer join keyword k on k.id = s.id
  )
  select
    c.id, c.document_id, c.document_title, c.heading_path, c.content,
    f.semantic_rank, f.keyword_rank, f.fused_score
  from fused f
  join document_chunks c on c.id = f.id
  order by f.fused_score desc, f.semantic_rank nulls last, f.keyword_rank nulls last, c.content_hash
  limit least(match_count, 50);
$$;
