import { Module } from '@nestjs/common';
import { IngestionQueue } from './ingestion-queue.js';
import { LoggingIngestionQueue } from './logging-ingestion-queue.js';

@Module({
  // Swap `useClass` for the real worker; nothing else changes.
  providers: [{ provide: IngestionQueue, useClass: LoggingIngestionQueue }],
  exports: [IngestionQueue],
})
export class IngestionModule {}
