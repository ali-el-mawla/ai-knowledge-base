# 0006. A provider-agnostic AI layer with presets as data

- Status: accepted
- Date: 2026-09-26

## Context

The brief requires that any OpenAI-spec provider can be swapped in by configuration. Providers that speak that format still differ: `max_tokens` or `max_completion_tokens`, the temperature range, whether streamed usage must be requested, whether embeddings accept `dimensions`, batch limits. Some have no embeddings (Anthropic, Groq). The usual failure is `if (provider === 'x')` scattered through the code, or SDK types leaking into every caller.

## Decision

- **Two neutral interfaces** in `@repo/ai`: `ChatModel` (`complete`, and `stream` as an async iterable of `delta`, `usage` and `finish`) and `EmbeddingModel` (`embed(texts, purpose)`, the purpose picking the task prefix). No SDK types in them.
- **Two slots, configured separately:** chat (`CHAT_*`, optional `REWRITE_MODEL`) and embeddings (`EMBEDDING_*`), possibly from different companies.
- **One OpenAI-compatible implementation per capability, and presets as data:** base URL, key requirement and capability flags, each checked against the provider's docs (cited in `presets.ts`). The classes read flags and never branch on a provider name.
- **One factory** picks the implementation and one Nest module injects the models; everything else depends on the interfaces, and tests inject fakes.
- **Normalized errors:** `AiProviderError` with a `kind` and `retryable`. An abort is never wrapped, and a stream without a finish reason is an error, not a short answer.
- **Chat is optional:** without a key the API still indexes and searches, and chat answers `503 CHAT_NOT_CONFIGURED`.

## Consequences

- Swapping is an `.env` edit and a restart. Verified with Anthropic and Ollama for chat and Ollama for embeddings; the other presets are configuration only.
- Claude runs through Anthropic's OpenAI-compatible endpoint, which Anthropic does not consider production-ready for most use cases and which has no prompt caching. A native class behind `ChatModel` is the production path; no caller changes.
- Flags are per provider, not per model: OpenAI's reasoning models accept only the default temperature, while this app sends 0.2 and 0.
- Embedding model changes are guarded: a dimension mismatch stops the boot, retrieval only compares chunks of the configured model, and `npm run reembed` rebuilds.
