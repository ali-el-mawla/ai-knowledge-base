import { Module } from '@nestjs/common';
import { IngestionQueue } from './ingestion-queue.js';
import { IngestionRepository } from './ingestion.repository.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionWorker } from './ingestion.worker.js';

@Module({
  providers: [
    IngestionRepository,
    IngestionService,
    // The worker is the IngestionQueue binding itself, not an alias of a separate provider:
    // a test that overrides IngestionQueue replaces the worker, lifecycle hooks included.
    { provide: IngestionQueue, useClass: IngestionWorker },
  ],
  exports: [IngestionQueue],
})
export class IngestionModule {}
