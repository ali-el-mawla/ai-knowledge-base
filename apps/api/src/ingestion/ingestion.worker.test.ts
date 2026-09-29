import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestionOutcome } from './ingestion.service.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionWorker } from './ingestion.worker.js';

/**
 * Stands in for IngestionService. With `hold` on, every job waits until the test
 * calls `finishRunning()`, so the test decides when each job ends.
 */
class FakeIngestionService {
  hold = false;
  unfinished: string[] = [];
  failFor = new Set<string>();
  readonly started: string[] = [];
  active = 0;
  maxActive = 0;
  private readonly waiting: (() => void)[] = [];

  async ingest(documentId: string): Promise<IngestionOutcome> {
    this.started.push(documentId);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.hold) await new Promise<void>((resolve) => this.waiting.push(resolve));
      else await nextTurn();
      if (this.failFor.has(documentId)) throw new Error(`broken ${documentId}`);
      return {
        status: 'ready',
        documentId,
        version: 1,
        chunks: 2,
        embedded: 1,
        reused: 1,
        durationMs: 5,
      };
    } finally {
      this.active -= 1;
    }
  }

  findUnfinished(): Promise<string[]> {
    return Promise.resolve(this.unfinished);
  }

  async finishRunning(): Promise<void> {
    this.waiting.shift()?.();
    // Let the worker record the outcome and start its next job.
    await nextTurn();
  }
}

let service: FakeIngestionService;
let worker: IngestionWorker;

beforeEach(async () => {
  service = new FakeIngestionService();
  const moduleRef = await Test.createTestingModule({
    providers: [IngestionWorker, { provide: IngestionService, useValue: service }],
  }).compile();
  worker = moduleRef.get(IngestionWorker);
  // compile() installs a logger that prints errors; these tests provoke some on purpose.
  Logger.overrideLogger(false);
});

afterEach(async () => {
  // Release anything a test left running.
  service.hold = false;
  while (service.active > 0) await service.finishRunning();
  await worker.idle();
});

describe('IngestionWorker', () => {
  it('starts a job as soon as an id is enqueued', () => {
    worker.enqueue('a');
    expect(service.started).toEqual(['a']);
  });

  it('runs one job at a time, in arrival order', async () => {
    for (const id of ['a', 'b', 'c', 'd']) worker.enqueue(id);
    await worker.idle();
    expect(service.started).toEqual(['a', 'b', 'c', 'd']);
    expect(service.maxActive).toBe(1);
  });

  it('coalesces an id that is already waiting', async () => {
    service.hold = true;
    worker.enqueue('a');
    for (const id of ['b', 'c', 'b', 'c', 'b']) worker.enqueue(id);

    await service.finishRunning();
    await service.finishRunning();
    await service.finishRunning();
    expect(service.started).toEqual(['a', 'b', 'c']);
  });

  it('runs the running id once more after it finishes, behind the ids already waiting', async () => {
    service.hold = true;
    worker.enqueue('a');
    worker.enqueue('b');
    worker.enqueue('a'); // e.g. an edit saved while "a" is being embedded
    worker.enqueue('a'); // a second edit still means one more run

    await service.finishRunning();
    await service.finishRunning();
    await service.finishRunning();
    expect(service.started).toEqual(['a', 'b', 'a']);
    await service.finishRunning();
    expect(service.started).toEqual(['a', 'b', 'a']);
  });

  it('idle() resolves at once when there is nothing to do', async () => {
    await expect(worker.idle()).resolves.toBeUndefined();
  });

  it('idle() resolves only after the last queued job', async () => {
    service.hold = true;
    worker.enqueue('a');
    worker.enqueue('b');
    let idle = false;
    const waiting = worker.idle().then(() => {
      idle = true;
    });

    await service.finishRunning();
    expect(idle).toBe(false);
    await service.finishRunning();
    await waiting;
    expect(idle).toBe(true);
  });

  it('starts again after going idle', async () => {
    worker.enqueue('a');
    await worker.idle();
    worker.enqueue('b');
    await worker.idle();
    expect(service.started).toEqual(['a', 'b']);
  });

  it('keeps going when a job throws, although ingest() promises never to', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error');
    service.failFor.add('a');
    worker.enqueue('a');
    worker.enqueue('b');
    await worker.idle();
    expect(service.started).toEqual(['a', 'b']);
    expect(logError).toHaveBeenCalledWith(
      'unexpected error while ingesting a',
      expect.stringContaining('broken a'),
    );
    logError.mockRestore();
  });

  it('reports every outcome to listeners until they unsubscribe', async () => {
    const seen: string[] = [];
    const unsubscribe = worker.onOutcome((outcome) => seen.push(outcome.documentId));
    worker.onOutcome(() => {
      throw new Error('a broken listener does not stop the others');
    });

    worker.enqueue('a');
    await worker.idle();
    unsubscribe();
    worker.enqueue('b');
    await worker.idle();
    expect(seen).toEqual(['a']);
  });

  it('requeues pending and processing documents at start-up', async () => {
    service.unfinished = ['x', 'y'];
    await worker.onApplicationBootstrap();
    await worker.idle();
    expect(service.started).toEqual(['x', 'y']);
  });

  describe('shutdown', () => {
    it('stops accepting, drops waiting ids and lets the running job finish', async () => {
      service.hold = true;
      worker.enqueue('a');
      worker.enqueue('b');
      worker.enqueue('a'); // the re-run is dropped too

      const stopping = worker.onApplicationShutdown();
      worker.enqueue('c');
      await service.finishRunning();
      await stopping;
      await worker.idle();
      // b and c stay pending in the database; the next start requeues them.
      expect(service.started).toEqual(['a']);
    });

    it('returns true at once when nothing is running', async () => {
      await expect(worker.stop(1_000)).resolves.toBe(true);
    });

    it('stops waiting after the timeout when the running job hangs', async () => {
      service.hold = true;
      worker.enqueue('a');
      await expect(worker.stop(20)).resolves.toBe(false);
    });
  });
});
