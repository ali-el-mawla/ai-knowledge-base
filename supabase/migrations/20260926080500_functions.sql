-- Hybrid retrieval: vector similarity and full-text keyword search, fused with
-- Reciprocal Rank Fusion (RRF). Each arm ranks its own candidates; a chunk scores
-- weight / (rrf_k + rank) per arm it appears in, so ranks are fused, not raw scores
-- (cosine distance and ts_rank live on different scales).
--
-- security invoker: runs as the calling user, so RLS limits results to their chunks.
-- hnsw.iterative_scan: RLS filters after the index scan; iterative scanning keeps
-- going until enough of the user's own rows are found instead of returning short.
-- Weights 1/0 or 0/1 give vector-only or keyword-only retrieval (used by the eval).
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
    select nearest.id, row_number() over (order by nearest.distance) as rank_ix
    from (
      select c.id, c.embedding <=> query_embedding as distance
      from document_chunks c
      where semantic_weight > 0
        and c.embedding_model = query_embedding_model
      order by c.embedding <=> query_embedding
      limit candidate_count
    ) as nearest
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc) as rank_ix
    from document_chunks c
    cross join keyword_query q
    where full_text_weight > 0
      and q.tsq is not null
      and c.embedding_model = query_embedding_model
      and c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc
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
  order by f.fused_score desc, f.semantic_rank nulls last
  limit least(match_count, 50);
$$;

comment on function public.hybrid_search is 'RRF fusion of vector (cosine) and keyword (full-text) retrieval over the caller''s own chunks.';

revoke execute on function public.hybrid_search from public, anon;
grant execute on function public.hybrid_search to authenticated, service_role;

-- Atomically swaps a document's chunks for a new generation.
-- p_chunks: [{chunk_index, heading_path, content, token_estimate, content_hash,
--             embedding (number[] or null to reuse the stored vector for that hash)}]
-- Readers keep seeing the previous generation until commit. If the document changed
-- since the worker read it (content_version moved on), nothing is written: the
-- newer version is already queued, so the latest edit wins.
create or replace function public.replace_document_chunks(
  p_document_id uuid,
  p_content_version integer,
  p_embedding_model text,
  p_chunks jsonb
)
returns table (applied boolean, inserted integer, reused integer)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_doc public.documents%rowtype;
  v_total integer;
  v_reused integer;
begin
  select * into v_doc from documents where id = p_document_id for update;
  if not found or v_doc.content_version <> p_content_version then
    return query select false, 0, 0;
    return;
  end if;

  -- A duplicate job for a version that is already written is a successful no-op.
  if exists (
    select 1 from document_chunks
    where document_id = p_document_id and document_version = p_content_version
  ) then
    update documents
    set ingestion_status = 'ready', ingestion_error = null
    where id = p_document_id and ingestion_status <> 'ready';
    return query select true, 0, 0;
    return;
  end if;

  select count(*), count(*) filter (where c.value -> 'embedding' is null or c.value -> 'embedding' = 'null'::jsonb)
    into v_total, v_reused
  from jsonb_array_elements(p_chunks) c;

  insert into document_chunks (
    document_id, user_id, document_version, document_title, chunk_index, heading_path,
    content, token_estimate, content_hash, embedding, embedding_model
  )
  select
    p_document_id,
    v_doc.user_id,
    p_content_version,
    v_doc.title,
    (c.value ->> 'chunk_index')::integer,
    coalesce(c.value ->> 'heading_path', ''),
    c.value ->> 'content',
    (c.value ->> 'token_estimate')::integer,
    c.value ->> 'content_hash',
    coalesce(
      nullif(c.value -> 'embedding', 'null'::jsonb)::text::vector,
      (
        select old.embedding
        from document_chunks old
        where old.document_id = p_document_id
          and old.content_hash = c.value ->> 'content_hash'
          and old.embedding_model = p_embedding_model
          and old.document_version <> p_content_version
        limit 1
      )
    ),
    p_embedding_model
  from jsonb_array_elements(p_chunks) c;

  delete from document_chunks
  where document_id = p_document_id and document_version <> p_content_version;

  update documents
  set ingestion_status = 'ready',
      ingestion_error = null,
      chunk_count = v_total,
      ingested_at = now()
  where id = p_document_id;

  return query select true, v_total - v_reused, v_reused;
end;
$$;

comment on function public.replace_document_chunks is 'Ingestion worker only: writes a new chunk generation and deletes older ones in one transaction.';

-- Supabase grants EXECUTE on new functions to everyone by default. This one must
-- only be reachable by the API's worker (service role), never by a signed-in user.
revoke execute on function public.replace_document_chunks from public, anon, authenticated;
grant execute on function public.replace_document_chunks to service_role;

-- The embedding column's dimension, read at API boot to fail fast on a config mismatch.
create or replace function public.embedding_dimensions()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select a.atttypmod
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.document_chunks'::regclass
    and a.attname = 'embedding';
$$;

revoke execute on function public.embedding_dimensions from public, anon;
grant execute on function public.embedding_dimensions to authenticated, service_role;

-- Tag facets for the documents list, over the caller's own documents.
create or replace function public.document_tag_counts()
returns table (tag text, count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*)
  from public.documents d
  cross join unnest(d.tags) as t (tag)
  group by t.tag
  order by count(*) desc, t.tag;
$$;

revoke execute on function public.document_tag_counts from public, anon;
grant execute on function public.document_tag_counts to authenticated, service_role;
