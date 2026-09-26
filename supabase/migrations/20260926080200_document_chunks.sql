-- One row per chunk of one version ("generation") of a document.
-- The dimension is a schema decision: 768 fits nomic-embed-text natively and
-- OpenAI text-embedding-3-small with dimensions=768. Other sizes need a new migration.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null,
  document_version integer not null,
  -- Denormalised so the keyword index can weight titles; rewritten on every new generation.
  document_title text not null,
  chunk_index integer not null check (chunk_index >= 0),
  heading_path text not null default '',
  content text not null,
  token_estimate integer not null check (token_estimate > 0),
  -- sha256 over (embedding model, dimensions, prefix, header, text): an unchanged hash
  -- means the stored vector can be reused instead of calling the embedding model again.
  content_hash text not null,
  embedding extensions.vector(768) not null,
  embedding_model text not null,
  fts tsvector generated always as (
    setweight(to_tsvector('english', document_title), 'A')
    || setweight(to_tsvector('english', heading_path), 'A')
    || setweight(to_tsvector('english', content), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade,
  unique (document_id, document_version, chunk_index)
);

comment on table public.document_chunks is 'Embedded chunks; written only by the ingestion worker through replace_document_chunks().';

-- Approximate nearest neighbour search on cosine distance (<=>).
create index document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
-- Keyword (full-text) search.
create index document_chunks_fts_idx on public.document_chunks using gin (fts);
-- RLS filters on user_id; ingestion looks chunks up by document and hash.
create index document_chunks_user_idx on public.document_chunks (user_id);
create index document_chunks_document_hash_idx on public.document_chunks (document_id, content_hash);
