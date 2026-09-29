# Tests

Four suites, fastest first. All use Vitest except the end-to-end smoke test, which uses Playwright.

| Suite                 | Command                    | Needs                                                   | Runs in CI |
| --------------------- | -------------------------- | ------------------------------------------------------- | ---------- |
| Unit, every package   | `npm test`                 | nothing (no `.env`, no database, no network)            | yes        |
| API integration       | `npm run test:integration` | local Supabase (`npm run db:start`) and the root `.env` | yes        |
| Retrieval evaluation  | `npm run eval`             | local Supabase and the embedding model                  | no         |
| End-to-end smoke test | `npm run test:e2e`         | the whole stack, including a chat model and its key     | no         |

## Unit tests

`turbo run test` runs `vitest run` in every package, each testing its own code in isolation:

- `packages/rag`: the structure-aware and fixed-size chunkers, chunk headers and hashes, the prompt builder and the citation parser.
- `packages/ai`: configuration and provider presets, and the OpenAI-compatible chat and embedding clients against a fake `fetch` (streaming, usage, normalised errors).
- `packages/shared`: the chat stream (SSE) encoder and parser.
- `apps/api` (`src/**/*.test.ts`): config validation, the auth guard, the error filter and validation pipes, the chat service, the ingestion service and worker, retrieval and the row mappers. Collaborators are replaced with test doubles.
- `apps/web` (`src/**/*.test.{ts,tsx}`, jsdom): the chat stream state and hook, citation chips and the usage line in answers, the composer, document form validation, the status badge and the API client.
- `apps/eval`: answer-span matching, the metrics (hit@k, MRR) and the question file validation.

## API integration tests

`apps/api/test/*.int.test.ts` boot the real Nest application on an ephemeral port and call it over HTTP, against the local Postgres with its migrations and Row Level Security. Each test file creates its own users with real Supabase access tokens and deletes them afterwards.

They cover authentication (missing, malformed and forged tokens), the error contract, documents CRUD, RLS with two users (reads, writes, `replace_document_chunks` and assistant messages denied to signed-in users, cascades), the ingestion pipeline (incremental re-embedding, concurrent edits, failures, the reembed path) and the streaming chat (events, saved answers, follow-up rewriting, client disconnects).

The chat and embedding models are fakes (`apps/api/test/support/fake-models.ts`), so the suite needs no Ollama and no API key, and costs nothing. `LIVE_AI=1` runs a separate block against the configured providers instead (3 short chat calls); see the top of `chat.int.test.ts`.

## Retrieval evaluation

`npm run eval` indexes `fixtures/corpus` with two chunking strategies, searches it with three retrieval modes and scores the answers to `fixtures/questions.json` (hit@1, hit@3, hit@5, MRR@10). It writes the report to [`docs/EVAL.md`](EVAL.md). It needs the embedding model but makes no chat calls.

## End-to-end smoke test

`apps/web/e2e/smoke.spec.ts` drives Chromium through the product once: it signs up a new user, creates a document holding a made-up fact, waits for the Ready badge, asks the chat about the fact, checks that the streamed answer contains it, opens the citation chip to check the source panel shows the passage, and deletes the document.

It makes one short chat call per run, so it stays out of `turbo run test` and CI. Servers already listening on `:3000` and `:4000` (for example `npm run dev`) are reused; otherwise Playwright builds and starts the API and the web app, then stops them. Install the browser once with `npx playwright install chromium`.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs two jobs on every push to `main` and every pull request:

- `checks`: `prettier --check .`, then `turbo run lint typecheck test build` (the unit tests). There is no `.env`: the web build gets placeholder `NEXT_PUBLIC_*` values, and the Turborepo cache is kept between runs.
- `database`: starts the local Supabase stack in Docker, which applies every migration to an empty database, writes a `.env` from `supabase status`, then runs the API integration tests.

The evaluation and the smoke test need real models, so they are not in CI.
