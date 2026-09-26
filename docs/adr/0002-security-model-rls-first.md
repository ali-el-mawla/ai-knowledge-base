# 0002. Security model: RLS as the source of truth, user-scoped clients

- Status: accepted
- Date: 2026-09-26

## Context

Every row belongs to one user. Adding `where user_id = ?` to every API query fails silently the one time someone forgets it. Supabase gives Postgres Row Level Security and signed user tokens, so the database can enforce ownership whatever client connects. Two jobs still need more than a user may do: the worker writes chunks and ingestion state for everyone, and chat answers must be stored without letting users write answers.

## Decision

- **RLS on every table**, one policy per operation, comparing `(select auth.uid())` with `user_id`. `anon` gets nothing.
- **The API acts as the user:** a per-request supabase-js client sends the caller's JWT to PostgREST, so queries run as `authenticated`. The JWT is verified first against the JWKS (ES256 or RS256, exact issuer and audience).
- **Column grants as a second layer:** users write only `title`, `content` and `tags` of documents, `title` of conversations, and `conversation_id`, `role` and `content` of messages. Chunks are read-only, and owner columns default to `auth.uid()`.
- **No assistant messages from users:** the insert policy requires `role = 'user'`, so nobody can plant answers that re-enter later prompts as history.
- **A narrow secret key:** the worker, the CLIs, the boot and health checks, and two writes (the assistant answer, the reindex version bump) made only after ownership was proven with the user's client. `replace_document_chunks` is not executable by `authenticated`.
- **404, never 403**, and **composite foreign keys** `(document_id, user_id)` and `(conversation_id, user_id)`.

## Consequences

- An API bug that forgets a filter returns nothing extra. The integration tests prove it with two real users, including `hybrid_search` and the worker-only function.
- `security invoker` functions inherit RLS, but RLS filters after an index scan, which needs pgvector's iterative scan ([ADR 0005](0005-hybrid-retrieval-with-rrf.md)).
- Each admin-client call is a review point. There are few, and the rule for using that client is written on `SupabaseService.admin()`.
