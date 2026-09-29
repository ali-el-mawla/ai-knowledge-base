# 0007. Streaming chat as server-sent events over a fetch POST

- Status: accepted
- Date: 2026-09-26

## Context

An answer takes a few seconds (`claude-haiku-4-5`: first token after about 1.4 seconds, complete after about 2.5), so it must stream. The request carries a body and must be authenticated like every other call, with a Bearer token. WebSockets add a second protocol and connection state for a one-way stream. The browser's `EventSource` only does GET and cannot send an `Authorization` header, so the token would go into the URL or a cookie. Nest's `@Sse()` also serves only GET.

## Decision

- `POST /api/conversations/:id/messages` answers with `text/event-stream`, read with `fetch`, a `TextDecoderStream` and `createSseParser()` from `@repo/shared`.
- A typed event union shared by both sides: one `start` (saved question, rewritten query, sources), any number of `delta`, then exactly one `done` or `error`.
- Everything that can be refused is checked before the headers go out (auth, the 20-per-minute rate limit, validation, ownership, chat configuration, retrieval), so those failures are ordinary JSON errors. After the headers, failures are `error` events.
- `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, and a `: keep-alive` comment every 15 seconds.
- A disconnect cancels the model call: when the response closes unfinished, an `AbortController` aborts the upstream request and the partial answer, if any, is saved as `aborted`. The request's own `close` event would have cancelled every answer at once, because it fires as soon as the body is read.

## Consequences

- One request per turn, the same auth as every route, nothing for a proxy to do beyond not buffering.
- The parser is small, unit-tested (split frames, CRLF, comments, unknown events) and shared, so the protocol cannot drift.
- Generation is tied to the connection: no resume. A dropped connection ends the turn with the partial answer saved. Resumable background generation is on the improvement list.
