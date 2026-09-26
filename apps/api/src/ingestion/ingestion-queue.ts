/**
 * The seam between documents and ingestion (chunk, embed, store).
 *
 * DocumentsService depends only on this abstract class, which is also the DI token.
 * IngestionModule decides which implementation is bound, so the real worker replaces
 * the binding without touching any caller.
 *
 * Contract for implementations:
 * - `enqueue` returns immediately and never throws; failures are recorded on the
 *   document (`ingestion_status = 'failed'`, `ingestion_error`), not raised to the caller.
 * - Jobs are keyed by document id and read the latest row when they run, so enqueueing
 *   the same id twice is harmless (the second request can be coalesced).
 */
export abstract class IngestionQueue {
  abstract enqueue(documentId: string): void;
}
