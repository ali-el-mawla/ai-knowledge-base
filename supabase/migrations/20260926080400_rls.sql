-- Row Level Security: every row belongs to one user, and the database itself
-- enforces it, whichever client connects. `(select auth.uid())` is evaluated once
-- per statement instead of once per row.
--
-- Column privileges are the second layer: users can only write the fields a user
-- should control. Ingestion state, versions and chunks are written by the API's
-- worker with the service role.

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- documents ---------------------------------------------------------------
revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;
grant insert (title, content, tags) on public.documents to authenticated;
grant update (title, content, tags) on public.documents to authenticated;

create policy "documents: owner can read" on public.documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "documents: owner can create" on public.documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "documents: owner can update" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "documents: owner can delete" on public.documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- document_chunks: read-only for users ------------------------------------
revoke all on public.document_chunks from anon, authenticated;
grant select on public.document_chunks to authenticated;

create policy "chunks: owner can read" on public.document_chunks
  for select to authenticated using ((select auth.uid()) = user_id);

-- conversations -----------------------------------------------------------
revoke all on public.conversations from anon, authenticated;
grant select, delete on public.conversations to authenticated;
grant insert (title) on public.conversations to authenticated;
grant update (title) on public.conversations to authenticated;

create policy "conversations: owner can read" on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "conversations: owner can create" on public.conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "conversations: owner can rename" on public.conversations
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "conversations: owner can delete" on public.conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- messages: users write only their own questions ---------------------------
-- Assistant messages are written by the API (service role) after generation,
-- so a user cannot forge assistant turns that later re-enter the prompt as history.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, role, content) on public.messages to authenticated;

create policy "messages: owner can read" on public.messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "messages: owner can ask" on public.messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id and role = 'user');
