-- pgvector stores the chunk embeddings and provides the HNSW index and distance operators.
create extension if not exists vector with schema extensions;

-- Shared trigger helper: keeps updated_at honest on tables that use it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
