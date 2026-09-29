# Architecture

How a request moves through the system, how data is stored and protected, how the API and the web app are organised, and the two wire contracts (errors and the chat stream). The [README](../README.md) has the overview and the [ADRs](adr/) the reasons.

- [1. Components](#1-components)
- [2. Request flows](#2-request-flows)
- [3. Data model](#3-data-model)
- [4. API module map](#4-api-module-map)
- [5. Frontend](#5-frontend)
- [6. Error model](#6-error-model)
- [7. Chat stream protocol (SSE)](#7-chat-stream-protocol-sse)
- [8. Configuration](#8-configuration)

## 1. Components

| Component                    | Runs as                                         | Talks to                                                          |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| Web (`apps/web`, Next.js 16) | `next dev` on 127.0.0.1:3000                    | Supabase Auth (sign in, session refresh), the API (all data)      |
| API (`apps/api`, NestJS 12)  | Node process on 127.0.0.1:4000, prefix `/api`   | Supabase Auth (JWKS), PostgREST, the embedding and chat providers |
| Ingestion worker             | Inside the API process (an in-memory queue)     | PostgREST with the secret key, the embedding provider             |
| CLIs (`seed`, `reembed`)     | Nest application context, no HTTP server        | The same services and worker as the API                           |
| Supabase (local, Docker)     | Auth, PostgREST, Postgres 17 with pgvector 0.8  |                                                                   |
| Embedding provider           | Ollama on 127.0.0.1:11434 by default            |                                                                   |
| Chat provider                | Anthropic by default, any OpenAI-compatible API |                                                                   |

The API never opens a direct Postgres connection. Every query goes through PostgREST with supabase-js: user requests with the caller's JWT (role `authenticated`, RLS applies), system work with the secret key (role `service_role`, RLS bypassed).

## 2. Request flows

### 2.1 Save a document

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as API (DocumentsService)
  participant P as PostgREST and Postgres
  participant W as Ingestion worker
  B->>A: POST /api/documents {title, content, tags}, Bearer JWT
  Note over A: auth guard (JWT verified with the cached JWKS), rate limit, zod validation
  A->>P: insert as the user
  Note over P: RLS: user_id must equal auth.uid() (its default)<br/>grants: only title, content, tags are writable
  P-->>A: row: content_version 1, ingestion_status pending
  A->>W: enqueue(document id), returns at once
  A-->>B: 201 Document (status pending, shown as "Queued")
  loop every 1.5 s while pending or processing
    B->>A: GET /api/documents/:id
  end
```

An edit (`PATCH /api/documents/:id`) works the same way with one extra rule. When the body touches `title` or `content`, the service reads `content_version` first, then updates. The `documents_before_update` trigger bumps the version and resets the status to `pending` only when the title or content changed, so the service enqueues the document only when the version moved. A tags-only edit (or a save with no change) never re-embeds.

`POST /api/documents/:id/reindex` forces a new generation: ownership is checked with the user's client, then the admin client bumps `content_version` (a column users cannot write), filtered by owner and by the version just read (an optimistic lock), and the document is enqueued.

### 2.2 The ingestion job

[`ingestion.worker.ts`](../apps/api/src/ingestion/ingestion.worker.ts) and [`ingestion.service.ts`](../apps/api/src/ingestion/ingestion.service.ts):

1. Queue: waiting ids sit in a `Set` in arrival order, so an id already waiting is not added twice. One job runs at a time. If the running document is enqueued again, it runs once more after the current job (the job may have read the row before that edit).
2. Read the latest row with the admin client. A deleted document is skipped; a document whose status is already `ready` is skipped as up to date (every title or content change resets the status, so `ready` means this exact version is indexed).
3. Mark `processing` for that version only, so a newer edit keeps its own `pending` status.
4. Chunk with `chunkMarkdown` from `@repo/rag`, build each embedding text (`title > heading path`, a blank line, the chunk), and hash it: SHA-256 over (embedding model, dimensions, document prefix, embedding text).
5. Compare with the stored hashes of this document and model. Only new hashes are embedded, each once even if the same text repeats.
6. Embed the missing texts with the `document` purpose (the model adds `search_document: `), in provider-sized batches (64 for Ollama), one batch after another.
7. Write the generation with `replace_document_chunks(document, version, model, chunks)`. A chunk whose hash already has a vector is sent with `embedding: null`, and the function copies the stored vector.
8. If the write is not applied, the document changed or was deleted while the job was embedding. The job reads it again and retries, up to 3 attempts; after that it stops, because the latest edit queued its own job. A Postgres `23502` error (a vector marked for reuse disappeared because another process replaced the chunks at the same moment) is handled the same way.
9. Any error marks this version `failed` with a short reason that names what to fix without internals (for example "Embedding provider unreachable (ollama at http://127.0.0.1:11434/v1)"); the full error goes to the log.
10. On boot the worker requeues every document left `pending` or `processing`. On shutdown it stops accepting jobs and waits up to 10 seconds for the running one; anything unfinished stays `pending` or `processing` in the database and is picked up on the next start.

Inside `replace_document_chunks` (one transaction):

1. Lock the document row (`for update`). If its `content_version` is not the one the job computed, write nothing and return `applied = false`.
2. If chunks for this version already exist (a duplicate job), mark the document `ready` and return.
3. Insert the new generation, taking each vector from the payload or, when it is null, from an older generation of the same document with the same hash and model.
4. Delete every older generation.
5. Set `ready`, `chunk_count` and `ingested_at`.

Readers keep seeing the previous generation until the commit, so search never sees a half-indexed document.

### 2.3 Ask a question

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (useChatStream)
  participant C as API (ChatController, ChatService)
  participant P as PostgREST and Postgres
  participant E as Embedding model
  participant L as Chat model
  B->>C: POST /api/conversations/:id/messages {content}, fetch with Bearer JWT
  Note over C: auth guard, 20 messages per minute per user,<br/>UUID and zod validation, chat configured?
  C->>P: read the conversation as the user (404 if not theirs)
  C->>P: last 6 complete messages, as the user
  C->>P: insert the user message (RLS: role must be user)
  opt the title is still "New conversation"
    C->>P: title from the first question
  end
  opt there are earlier turns
    C->>L: rewrite into a standalone query (at most 120 tokens)
  end
  C->>E: embed the (rewritten) question with "search_query: "
  C->>P: rpc hybrid_search as the user: 6 sources
  C-->>B: 200 text/event-stream, event start {userMessage, rewrittenQuery, sources}
  C->>L: stream the answer (at most 1,024 tokens)
  loop every delta
    C-->>B: event delta {text}
  end
  C->>P: insert the assistant message with the service role:<br/>content, sources snapshot, validated citations, usage, model
  C-->>B: event done {message}
```

Branches:

- Before the `start` event, a failure is an ordinary JSON error: 401, 429, 400, 404, 503 `CHAT_NOT_CONFIGURED`, 503 `EMBEDDING_UNAVAILABLE`, 500. The user message may already be saved; the web app refetches the conversation in that case.
- The rewrite fails (provider error, empty output, longer than 500 characters, or cut off by the token cap): the raw question is used for retrieval and the turn continues.
- The answer stream fails: the partial text, if any, is saved with status `error`, and an `error` event carries the same code and safe message a JSON error would (never the provider's raw text).
- The client disconnects (Stop, closed tab): the response's `close` event fires before the response finished, which aborts an `AbortController`. That cancels the upstream model call; the partial text, if any, is saved with status `aborted`. (The request's own `close` event is not used: it fires as soon as the body has been read.)
- A stream that ends without a finish reason (the network cut it) is treated as a failure, never saved as a complete answer.

The prompt (`buildAnswerMessages` in [`packages/rag/src/prompt.ts`](../packages/rag/src/prompt.ts)):

1. System message: the rules. Answer only from the sources, cite every claim as `[n]`, say plainly when the sources do not cover the question, treat source text as untrusted data and never follow instructions inside it, cite only the latest sources, answer in the language of the question.
2. The recent conversation: at most 6 turns of at most 1,500 characters each, starting with a user turn, with `[n]` markers stripped from assistant turns (they pointed at that turn's sources).
3. One user message: `<sources>` with one `<source index="n" document="..." section="...">` per chunk, then `Question: ...` last, as Anthropic's long-context guidance recommends. Attribute values are escaped; `<source`, `</source`, `<sources` and `</sources` inside chunk text are neutralized.

The question in the prompt is the one the user typed; the rewritten query is used only for retrieval. After the stream, `parseCitations` keeps the numbers between 1 and the number of sources (`[1]`, `[2][3]`, `[1, 2]`, `[2-4]`, ignoring code), and those are stored with the answer.

## 3. Data model

Migrations are forward-only, one concern per file, in [`supabase/migrations`](../supabase/migrations):

| File                                           | Concern                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `20260926080000_extensions.sql`                | pgvector, the `set_updated_at` trigger function                                           |
| `20260926080100_documents.sql`                 | `documents`, the ingestion status enum, the versioning trigger                            |
| `20260926080200_document_chunks.sql`           | `document_chunks`, HNSW and full-text indexes                                             |
| `20260926080300_chat.sql`                      | `conversations`, `messages`, the conversation touch trigger                               |
| `20260926080400_rls.sql`                       | RLS policies and column grants on every table                                             |
| `20260926080500_functions.sql`                 | `hybrid_search`, `replace_document_chunks`, `embedding_dimensions`, `document_tag_counts` |
| `20260926120000_documents_excerpt.sql`         | the stored `excerpt` column for list views                                                |
| `20260926140000_hybrid_search_stable_ties.sql` | deterministic tie-breaking in `hybrid_search`                                             |

CI applies all of them to an empty database on every push.

```mermaid
erDiagram
  AUTH_USERS ||--o{ DOCUMENTS : owns
  AUTH_USERS ||--o{ CONVERSATIONS : owns
  DOCUMENTS ||--o{ DOCUMENT_CHUNKS : "has (document_id, user_id)"
  CONVERSATIONS ||--o{ MESSAGES : "has (conversation_id, user_id)"
```

### Tables

#### `documents`

| Column                                | Notes                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `id` uuid, `user_id` uuid             | `user_id` defaults to `auth.uid()`, references `auth.users` on delete cascade    |
| `title`, `content`, `tags`            | 1 to 200 characters; 1 to 200,000 characters; at most 10 tags                    |
| `content_version`                     | bumped by the trigger on a title or content change, or by a forced reindex       |
| `ingestion_status`, `ingestion_error` | enum `pending`, `processing`, `ready`, `failed`, plus a short user-safe reason   |
| `chunk_count`, `ingested_at`          | written by `replace_document_chunks`                                             |
| `excerpt`                             | generated: the first 400 characters, so the list never reads 200k-character rows |
| `created_at`, `updated_at`            | `updated_at` moves on user edits only, not on the worker's status updates        |

Indexes: `(user_id, updated_at desc)`, GIN on `tags`, and `unique (id, user_id)` as the target of the composite foreign key.

#### `document_chunks` (one row per chunk of one generation)

| Column                                       | Notes                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `document_id`, `user_id`                     | composite foreign key to `documents (id, user_id)`, on delete cascade             |
| `document_version`, `chunk_index`            | `unique (document_id, document_version, chunk_index)`                             |
| `document_title`, `heading_path`, `content`  | the title is denormalized so the keyword index can weight it                      |
| `token_estimate`                             | characters / 4, for display                                                       |
| `content_hash`                               | SHA-256 of (model, dimensions, prefix, header and text): the key for vector reuse |
| `embedding` `vector(768)`, `embedding_model` | retrieval only compares chunks of the configured model                            |
| `fts`                                        | generated `tsvector` (English): title and heading path weight A, content weight B |

Indexes: HNSW on `embedding` with `vector_cosine_ops`, GIN on `fts`, `(user_id)` for RLS, `(document_id, content_hash)` for the ingestion lookups.

#### `conversations`

`id`, `user_id` (default `auth.uid()`), `title` (1 to 120 characters, default "New conversation"), timestamps; index `(user_id, updated_at desc)`; `unique (id, user_id)`.

#### `messages`

| Column                                        | Notes                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `conversation_id`, `user_id`                  | composite foreign key to `conversations (id, user_id)`, on delete cascade           |
| `role`, `content`, `status`                   | `user` or `assistant`; at most 100,000 characters; `complete`, `aborted` or `error` |
| `rewritten_query`                             | the standalone question used for retrieval (assistant rows)                         |
| `sources` jsonb                               | snapshot of the sources given to the model, so citations survive later edits        |
| `citations` int[]                             | the validated `[n]` numbers                                                         |
| `prompt_tokens`, `completion_tokens`, `model` | usage per answer, and `provider/model`                                              |

Index `(conversation_id, created_at)`. The `messages_touch_conversation` trigger (`security definer`, because users cannot write `updated_at`) moves the conversation to the top of the list on every new message.

### Row Level Security and grants

RLS is enabled on all four tables. Every policy compares `(select auth.uid())` with `user_id`. `anon` has no privileges on any table.

| Table             | Policies for `authenticated`                            | Table and column grants for `authenticated`                             |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `documents`       | select, insert, update, delete: own rows                | `select`, `delete`; `insert` and `update` on `title`, `content`, `tags` |
| `document_chunks` | select: own rows                                        | `select` only (chunks are written by the worker)                        |
| `conversations`   | select, insert, update, delete: own rows                | `select`, `delete`; `insert` and `update` on `title`                    |
| `messages`        | select: own rows; insert: own rows with `role = 'user'` | `select`; `insert` on `conversation_id`, `role`, `content`              |

The integration suite checks this with two real users: each sees only their own rows (including through `hybrid_search` and the tag counts), cannot update, delete or post into the other's rows, cannot create a document on someone else's behalf, cannot write chunks, cannot call `replace_document_chunks`, cannot insert an assistant message, and deleting a document removes its chunks.

### SQL functions

| Function                  | What it does                                                                                                                                                                                                                  | Who may call it                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `hybrid_search`           | Vector arm and keyword arm, 30 candidates each, fused with RRF, deterministic ties. `security invoker` (RLS applies), `hnsw.iterative_scan = relaxed_order`. Weights 1/0 and 0/1 give the vector-only and keyword-only modes. | `authenticated`, `service_role` |
| `replace_document_chunks` | Atomically swaps a document's chunk generation (section 2.2). Returns `applied`, `inserted`, `reused`.                                                                                                                        | `service_role` only             |
| `embedding_dimensions`    | The `vector(n)` size of `document_chunks.embedding`, for the boot-time guard.                                                                                                                                                 | `authenticated`, `service_role` |
| `document_tag_counts`     | Tag facets over the caller's own documents.                                                                                                                                                                                   | `authenticated`, `service_role` |

`hybrid_search` in detail:

- Keyword query: `to_tsvector('english', question)` gives the stemmed lexemes; they are joined with `|` into a `tsquery`. A chunk matches if it has any of them, and `ts_rank_cd` ranks chunks with more of them, closer together, higher.
- Semantic arm: `order by embedding <=> query limit 30`, ordered by distance alone so the HNSW index stays usable; ties are broken by the content hash outside that subquery.
- Fusion: a full outer join of the two lists; `score = semantic_weight / (60 + semantic_rank) + full_text_weight / (60 + keyword_rank)`, a missing rank contributing 0.
- Order: fused score, then semantic rank, then keyword rank, then content hash. At most 50 rows.

## 4. API module map

| Module            | Provides                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigModule`    | The validated `AppConfig` (global). Built by the entry point before Nest starts, so a bad `.env` fails with a readable list.            |
| `SupabaseModule`  | `SupabaseService.forUser(token)` (RLS applies) and `admin()` (secret key); `EmbeddingDimensionsCheck` at boot (global).                 |
| `AiModule`        | The `EMBEDDING_MODEL`, `CHAT_MODEL` and `REWRITE_MODEL` injection tokens (global). The only place that turns config into model clients. |
| `AuthModule`      | `TokenVerifier` (jose, remote JWKS, ES256 or RS256, issuer and audience). `SupabaseAuthGuard` is a global guard; `@Public()` opts out.  |
| `DocumentsModule` | `DocumentsController` (`/documents`), `TagsController` (`/tags`), `DocumentsService`.                                                   |
| `IngestionModule` | `IngestionRepository` (admin queries), `IngestionService` (chunk, embed, write), `IngestionQueue` bound to `IngestionWorker`.           |
| `RetrievalModule` | `SearchController` (`POST /search`), `RetrievalService` (query embedding plus `hybrid_search`).                                         |
| `ChatModule`      | `ConversationsController` (CRUD), `ChatController` (the SSE route), `ConversationsService`, `ChatService`.                              |
| `HealthModule`    | `GET /health` (public, `?deep=1` pings the embedding model) and `GET /ai/info` (active models, stale chunk count).                      |
| `CliModule`       | Config, Supabase, AI and Documents without HTTP, for `seed` and `reembed`.                                                              |

Cross-cutting pieces, in the order a request meets them: `requestIdMiddleware` (accepts a safe incoming `x-request-id` or makes one, echoes it), Helmet, CORS for the web origin and its loopback twin (`127.0.0.1` and `localhost`), a 1 MB JSON body limit, the `/api` prefix, the global `SupabaseAuthGuard`, then `UserThrottlerGuard` (300 requests per minute per route and caller by default, tracked by user id when signed in and by IP otherwise; 20 per minute on the chat route), `ZodValidationPipe` with the schemas from `@repo/shared`, and `ApiExceptionFilter` for every error. `DocumentsService` depends on the abstract `IngestionQueue`, not the worker, so tests swap in a recording queue.

## 5. Frontend

Routes (App Router): `/login`, `/signup`, `/documents`, `/documents/new`, `/documents/[id]` (Write, Preview and Chunks tabs), `/chat`, `/chat/[id]`. `/` redirects to `/documents`. Route groups `(auth)` and `(app)` carry their own layouts; `(app)` has an error boundary and loading skeletons.

Auth: `src/proxy.ts` runs before every page request: it refreshes the Supabase session cookies (`getClaims()` validates the JWT), sends signed-out visitors to `/login?next=...` and signed-in users away from the auth pages. `next` is validated so the login page cannot be an open redirect. The browser Supabase client is used for authentication only; `apiClient` attaches the current access token to every API call. The proxy is an optimistic guard for navigation: the API verifies the token on every request.

State, by kind:

| Kind                    | Where it lives                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server data             | TanStack Query with key factories per feature (`documentKeys`, `chatKeys`). 30 s stale time, no refetch on window focus, 2 retries except for 4xx.                                   |
| Ingestion progress      | Polling every 1.5 s, only while a document on screen is `pending` or `processing`. Chunks are keyed by `ingestedAt`, so a finished run refetches them by itself.                     |
| List filters            | The URL (`?q=&tag=&page=`), updated with `history.replaceState`, so a search survives a reload and can be shared.                                                                    |
| Forms                   | Local state (`useDocumentDraft`): draft, last saved version, field errors after the first submit, an unsaved-changes guard.                                                          |
| The chat turn in flight | A reducer (`stream-state.ts`) with states `idle`, `sending`, `streaming`, `done`, `error`, `aborted`. Every action carries a run id, so late events from an earlier run are ignored. |
| Small preferences       | `localStorage` (the conversation list open or closed).                                                                                                                               |

The chat hook (`use-chat-stream.ts`) sends the message with `fetch`, reads the body through `TextDecoderStream` and `createSseParser()` from `@repo/shared`, and batches deltas into one render per animation frame. On `done` it writes the user message and the saved answer into the cached conversation before the state changes, so the thread shows what a reload would show. Stop aborts the request and keeps the partial turn in the cache, marked stale so the next visit loads the server's copy. Unmounting the view stops the stream.

Citations render as chips inside the Markdown answer (a remark plugin); a chip opens the source panel with the passage snapshot, its heading path, its semantic rank, keyword rank and fused score, and a link to the document.

## 6. Error model

Every error leaves the API with the same body ([`packages/shared/src/errors.ts`](../packages/shared/src/errors.ts)):

```json
{ "error": { "code": "NOT_FOUND", "message": "Document not found", "requestId": "..." } }
```

`details` is added when it helps the client (zod's flattened field errors, the reason chat is off, the provider and error kind). `requestId` matches the `x-request-id` header and the log line.

| Code                    | Status | When                                                                                   |
| ----------------------- | ------ | -------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`     | 400    | A body, query or id failed its zod schema                                              |
| `BAD_REQUEST`           | 400    | Other client errors, such as malformed JSON                                            |
| `UNAUTHORIZED`          | 401    | Missing, malformed, forged or expired token                                            |
| `NOT_FOUND`             | 404    | Unknown route or id, and another user's resource                                       |
| `CONFLICT`              | 409    | Reserved for conflicting writes                                                        |
| `PAYLOAD_TOO_LARGE`     | 413    | JSON body over 1 MB                                                                    |
| `RATE_LIMITED`          | 429    | Throttled; the `Retry-After` header says when to retry                                 |
| `AI_PROVIDER_ERROR`     | 502    | The chat or rewrite model failed; `details` has `provider`, `kind`, `retryable`        |
| `CHAT_NOT_CONFIGURED`   | 503    | No chat provider or no key; `details.reason` says which                                |
| `EMBEDDING_UNAVAILABLE` | 503    | The embedding model failed, so nothing can be searched                                 |
| `INTERNAL`              | 500    | Anything else; the client gets a generic message, the log gets the stack and the cause |

`ApiExceptionFilter` is the single place that maps exceptions to responses. Services throw typed `AppError` subclasses that fix their status and code; provider errors arrive normalized as `AiProviderError` from `@repo/ai`. Client mistakes are not logged, upstream failures are logged as warnings with the provider's message, and our own failures are logged with the stack and the PostgREST cause. The web client adds two codes of its own, `NETWORK_ERROR` and `INVALID_RESPONSE`, for answers that never arrived or could not be parsed.

## 7. Chat stream protocol (SSE)

`POST /api/conversations/:id/messages` with `{ "content": "..." }` (1 to 4,000 characters). Once every check has passed, the response is `200` with these headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Each event is one frame: an `event:` line with the type, one `data:` line with a JSON payload, and a blank line.

```
event: start
data: {"conversationId":"...","userMessage":{...},"rewrittenQuery":null,"sources":[...]}

event: delta
data: {"text":"Parental leave is "}

event: done
data: {"message":{...}}
```

| Event   | Payload                                                      | Rule                                            |
| ------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `start` | `conversationId`, `userMessage`, `rewrittenQuery`, `sources` | exactly one, first                              |
| `delta` | `text`                                                       | any number                                      |
| `done`  | `message` (the saved assistant message)                      | exactly one of `done` or `error`, last          |
| `error` | `code`, `message`                                            | same codes and safe messages as the JSON errors |

A comment line (`: keep-alive`) is written every 15 seconds so proxies do not close an idle connection; parsers ignore comments and unknown event types. The types (`ChatStreamEvent`), the encoder and the incremental parser live in `@repo/shared` and are used by both sides, so the protocol cannot drift. The parser accepts frames split at any point and CRLF line endings.

## 8. Configuration

One `.env` at the repository root configures both apps; [`.env.example`](../.env.example) documents every variable.

- API: `src/load-env.ts` is the first import of every entry point and calls `process.loadEnvFile`. Variables already set in the environment win, so CI and production can inject them without a file. `loadAppConfig` validates everything with zod and `loadAiConfig`, and reports all problems at once.
- Web: `next.config.ts` loads the root file with `@next/env`. The `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time.
- Turborepo: `.env` is a global dependency, so changing it invalidates the build cache; the variables a task may read are declared in `turbo.json`.
- Startup guards: a missing Supabase variable, an unknown provider, a missing embedding key, or a dimension that does not match the database column stops the API before it listens, with the fix in the message. A missing chat key does not: chat is optional.
