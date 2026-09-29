# API reference

Base URL: `http://127.0.0.1:4000/api`. Types live in `packages/shared` and are shared with the web app.

Every route except `GET /health` needs `Authorization: Bearer <Supabase access token>`. The API verifies the token against the Supabase JWKS (ES256 or RS256) and queries the database as that user, so Row Level Security decides what they can see. Another user's resource answers `404`, never `403`, so ids cannot be probed.

Errors are always `{ "error": { "code", "message", "details"?, "requestId" } }`, with codes from `API_ERROR_CODES` (see [ARCHITECTURE.md](ARCHITECTURE.md#6-error-model)).

| Method | Route                         | Body / query                                          | Response                                                                |
| ------ | ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/health`                     | `?deep=1` also pings the embedding provider           | `HealthResponse`                                                        |
| GET    | `/ai/info`                    |                                                       | `AiInfo` (active chat, rewrite and embedding models; stale chunk count) |
| GET    | `/documents`                  | `?tag&q&limit=20&offset=0`                            | `DocumentList`                                                          |
| POST   | `/documents`                  | `CreateDocumentInput`                                 | `201 Document` (ingestion starts in the background)                     |
| GET    | `/documents/:id`              |                                                       | `Document`                                                              |
| PATCH  | `/documents/:id`              | `UpdateDocumentInput`                                 | `Document` (re-ingests only if title or content changed)                |
| DELETE | `/documents/:id`              |                                                       | `204` (chunks are deleted by cascade)                                   |
| POST   | `/documents/:id/reindex`      |                                                       | `202 Document` (forces re-embedding)                                    |
| GET    | `/documents/:id/chunks`       |                                                       | `{ items: DocumentChunk[] }`                                            |
| GET    | `/tags`                       |                                                       | `{ items: TagCount[] }`                                                 |
| POST   | `/search`                     | `{ query, mode: hybrid \| vector \| keyword, limit }` | `SearchResponse`                                                        |
| GET    | `/conversations`              |                                                       | `ConversationList` (most recent first)                                  |
| POST   | `/conversations`              | `{ title? }` (body optional)                          | `201 Conversation`                                                      |
| GET    | `/conversations/:id`          |                                                       | `ConversationWithMessages`                                              |
| PATCH  | `/conversations/:id`          | `{ title }`                                           | `Conversation`                                                          |
| DELETE | `/conversations/:id`          |                                                       | `204`                                                                   |
| POST   | `/conversations/:id/messages` | `{ content }`                                         | `text/event-stream` of `ChatStreamEvent`                                |

## Chat stream

`POST /conversations/:id/messages` validates the request and checks ownership and the rate limit before streaming, so those failures are normal JSON errors. After the headers, the stream is:

```
event: start   data: { conversationId, userMessage, rewrittenQuery, sources }
event: delta   data: { text }            (many)
event: done    data: { message }         (the saved assistant message)
event: error   data: { code, message }   (instead of done, if generation fails)
```

Rate limits: 300 requests per minute per route and caller, and 20 chat messages per minute per user (`429 RATE_LIMITED` with `Retry-After`). A conversation still called "New conversation" is renamed after its first question.

Closing the connection aborts the upstream model call and saves the partial answer with `status: "aborted"`. `EventSource` cannot send an `Authorization` header, so the web app reads the stream with `fetch` and `createSseParser()` from `@repo/shared`.
