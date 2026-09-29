import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { IngestionQueue } from './ingestion-queue.js';
import { type IngestionOutcome, IngestionService } from './ingestion.service.js';

/** How long shutdown waits for the running job before leaving it to the next start. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export type OutcomeListener = (outcome: IngestionOutcome) => void;

/**
 * The in-process ingestion queue, bound as the application's `IngestionQueue`.
 *
 * - Coalesced by document id: a job carries only the id and reads the latest row when
 *   it runs, so a burst of edits to one document queues one job.
 * - Concurrency 1, in arrival order: the local GPU embeds one batch at a time anyway,
 *   and a hosted provider has one rate limit.
 * - In memory, but the database is the source of truth: a document stays `pending` or
 *   `processing` until its chunks are written, so a restart requeues what a stopped
 *   process left. Production would use a durable queue (pgmq or pg-boss) with retries
 *   and several workers.
 */
@Injectable()
export class IngestionWorker
  extends IngestionQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('Ingestion');
  /** Waiting ids in arrival order; a Set ignores an id that is already waiting. */
  private readonly pending = new Set<string>();
  private running: string | null = null;
  private runAgain = false;
  private draining: Promise<void> | null = null;
  private accepting = true;
  private readonly idleWaiters: (() => void)[] = [];
  private readonly listeners = new Set<OutcomeListener>();

  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  enqueue(documentId: string): void {
    if (!this.accepting) {
      this.logger.warn(`shutting down: ${documentId} stays pending until the next start`);
      return;
    }
    if (documentId === this.running) {
      // The running job may have read the row before this change: run it once more after.
      this.runAgain = true;
      return;
    }
    this.pending.add(documentId);
    this.draining ??= this.drain();
  }

  /** Resolves once nothing is queued or running. For CLIs and tests. */
  idle(): Promise<void> {
    if (!this.draining) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Calls `listener` with the outcome of every job; returns the unsubscribe function. */
  onOutcome(listener: OutcomeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A crash or restart mid-job leaves documents pending or processing: pick them up again. */
  async onApplicationBootstrap(): Promise<void> {
    const unfinished = await this.ingestion.findUnfinished();
    for (const documentId of unfinished) this.enqueue(documentId);
    if (unfinished.length > 0) {
      this.logger.log(`requeued ${unfinished.length} unfinished document(s)`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop(SHUTDOWN_TIMEOUT_MS);
  }

  /**
   * Stops taking jobs and waits up to `timeoutMs` for the running one. Queued ids are
   * only dropped from memory: those documents stay pending and the next start requeues
   * them. Resolves false if the running job did not finish in time.
   */
  async stop(timeoutMs: number): Promise<boolean> {
    this.accepting = false;
    this.pending.clear();
    if (!this.draining) return true;

    const finished = await Promise.race([
      this.idle().then(() => true),
      // Unreferenced: a pending timer must not keep the process alive after the job ends.
      sleep(timeoutMs, false, { ref: false }),
    ]);
    if (!finished) {
      this.logger.warn(
        `stopped while ingesting ${this.running ?? 'a document'}; it is requeued on the next start`,
      );
    }
    return finished;
  }

  private async drain(): Promise<void> {
    try {
      for (let next = this.takeNext(); next !== null; next = this.takeNext()) {
        await this.run(next);
      }
    } finally {
      // Runs in the same tick as the takeNext() that found the queue empty, so no enqueue
      // can slip in between and be left without a drain.
      this.draining = null;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }

  private takeNext(): string | null {
    const [next] = this.pending;
    if (next === undefined) return null;
    this.pending.delete(next);
    return next;
  }

  private async run(documentId: string): Promise<void> {
    this.running = documentId;
    this.runAgain = false;
    try {
      this.emit(await this.ingestion.ingest(documentId));
    } catch (error) {
      // ingest() never throws by contract; this only keeps the queue alive if it ever does.
      this.logger.error(
        `unexpected error while ingesting ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = null;
    }
    if (this.runAgain && this.accepting) this.pending.add(documentId);
  }

  private emit(outcome: IngestionOutcome): void {
    for (const listener of this.listeners) {
      try {
        listener(outcome);
      } catch (error) {
        this.logger.warn(`an outcome listener failed: ${String(error)}`);
      }
    }
  }
}
