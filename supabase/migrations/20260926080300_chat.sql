create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 100000),
  status text not null default 'complete' check (status in ('complete', 'aborted', 'error')),
  -- Assistant messages only: the standalone question used for retrieval,
  -- a snapshot of the sources shown to the model, and the [n] numbers it cited.
  rewritten_query text,
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  citations integer[] not null default '{}',
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  model text,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.conversations (id, user_id) on delete cascade
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- A new message moves its conversation to the top of the list.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();
