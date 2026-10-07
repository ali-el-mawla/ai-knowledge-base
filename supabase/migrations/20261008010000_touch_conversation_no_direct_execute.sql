-- touch_conversation is a trigger function. It is security definer so the trigger can bump
-- conversations.updated_at, and Postgres does not check EXECUTE when a trigger fires.
-- Nobody needs to call it directly, so the Data API roles lose EXECUTE. This clears the
-- Supabase security advisor warnings for anon and authenticated.
revoke execute on function public.touch_conversation() from public, anon, authenticated;
