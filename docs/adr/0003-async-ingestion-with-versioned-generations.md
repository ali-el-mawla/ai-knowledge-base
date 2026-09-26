# 0003. Asynchronous in-process ingestion with versioned chunk generations

- Status: accepted
- Date: 2026-09-26

## Context

Chunking and embedding takes from a fraction of a second to many seconds (the 127-chunk demo corpus takes about 18 seconds on a laptop GPU), and the provider can be down. Saving must not wait. Users edit during indexing, so a slow job must never overwrite a newer edit, search must never see half a document, and a typo fix should not re-embed everything. The app runs as one process.

## Decision

- **Save returns at once** and enqueues the id. The queue is in-process: a `Set` of ids (a burst of edits is one job), concurrency 1 (one GPU, or one provider rate limit). The job reads the latest row when it runs.
- **The database is the source of truth.** A trigger bumps `content_version` and resets the status on title or content changes (not tags). Boot requeues everything `pending` or `processing`.
- **Incremental re-embedding:** each chunk's hash covers model, dimensions, prefix, header and text. Only new hashes are embedded; the rest reuse their stored vector.
- **Atomic generation swap:** `replace_document_chunks` locks the row, writes nothing if the version moved on (the latest edit wins), inserts the new generation, deletes older ones and marks the document `ready`, in one transaction.
- **Failures are data:** `failed` plus a short, user-safe reason. Reindex or `npm run reembed` retries.

## Consequences

- One edited paragraph costs one embedding: measured "embedded 1, reused 21" in about 0.36 seconds. A title change re-embeds every chunk, because the title is in every header.
- Readers see the old generation until the commit, then the new one.
- The UI polls (every 1.5 seconds while indexing) instead of receiving pushes.
- The queue does not survive the process or spread across instances. Nothing is lost on restart, but production needs a durable queue with retries and several workers (pgmq or pg-boss). `IngestionQueue` is the seam: callers depend on it, not on the worker.
