create type public.ingestion_status as enum ('pending', 'processing', 'ready', 'failed');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 200000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  -- Bumped whenever title or content changes; ingestion writes are only applied
  -- for the version they were computed from (latest edit wins).
  content_version integer not null default 1,
  ingestion_status public.ingestion_status not null default 'pending',
  ingestion_error text,
  chunk_count integer not null default 0,
  ingested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target of the composite foreign keys that stop user_id drifting on child rows.
  unique (id, user_id)
);

comment on table public.documents is 'User-owned knowledge base documents (markdown or plain text).';
comment on column public.documents.content_version is 'Incremented on title/content change or reindex; chunks carry the version they were built from.';

create index documents_user_updated_idx on public.documents (user_id, updated_at desc);
create index documents_tags_idx on public.documents using gin (tags);

-- A content change resets ingestion; updated_at only moves on user-visible edits,
-- not on the worker's status updates.
create or replace function public.documents_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.content_version := old.content_version + 1;
    new.ingestion_status := 'pending';
    new.ingestion_error := null;
  end if;
  if new.title is distinct from old.title
     or new.content is distinct from old.content
     or new.tags is distinct from old.tags then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger documents_before_update
  before update on public.documents
  for each row execute function public.documents_before_update();
