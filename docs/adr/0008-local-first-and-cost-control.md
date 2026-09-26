# 0008. Local-first stack and cost control

- Status: accepted
- Date: 2026-09-26

## Context

Reviewers run the project on their own machines, and it is developed on a laptop with a 2 GB GPU. A hosted Supabase project would mean accounts, keys and shared state for every reviewer; hosted embeddings would mean a second paid key before anything works. Every chat answer costs money, and so would tests that call a model. Documents may be private.

## Decision

- **Local Supabase:** the CLI is pinned as a devDependency (2.118.0) and runs the stack in Docker. Unused services are disabled in `supabase/config.toml` (realtime, storage, edge runtime, analytics, pooler); Studio and the mail inbox stay on locally and are excluded in CI.
- **Local embeddings:** `nomic-embed-text` through Ollama, free, about 0.02 seconds per question on the laptop GPU, and documents never leave the machine. OpenAI embeddings are one `.env` block away.
- **A small chat model with caps:** `claude-haiku-4-5`, at most 1,024 output tokens per answer and 120 per rewrite, 6 sources per prompt.
- **Fewer calls:** only follow-ups are rewritten, keyword-only search skips the embedding call, and ingestion embeds only changed chunks.
- **Limits and accounting:** 20 chat messages per minute per user, and prompt tokens, completion tokens and `provider/model` stored on every answer.
- **Free tests:** unit and integration tests use fake models; the evaluation never calls a chat model and reuses stored vectors; the one Playwright test that makes a chat call stays out of CI.

## Consequences

- The whole system, CI included, runs without paying for anything except chat answers.
- The first setup downloads the Supabase images (a few GB) and needs Docker and Ollama running.
- The README's timings are laptop numbers with a local embedding model.
- Everything local uses `127.0.0.1`: Supabase issues tokens for the exact host, and the API checks the issuer exactly.
- A hosted deployment needs what local skips: a durable queue, a shared rate-limit store, managed secrets or workload identity, and connection pooling.
