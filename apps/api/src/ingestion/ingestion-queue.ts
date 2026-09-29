/**
 * The seam between documents and ingestion, and the DI token. IngestionModule binds the
 * worker to it; tests bind a recording queue.
 *
 * Contract for implementations:
 * - `enqueue` returns immediately and never throws; failures are recorded on the
 *   document (`ingestion_status = 'failed'`, `ingestion_error`).
 * - Jobs are keyed by document id and read the latest row when they run, so enqueueing
 *   the same id twice is harmless (the second request can be coalesced).
 */
export abstract class IngestionQueue {
  abstract enqueue(documentId: string): void;
}
