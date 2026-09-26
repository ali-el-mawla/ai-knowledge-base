import { Injectable, Logger } from '@nestjs/common';
import { IngestionQueue } from './ingestion-queue.js';

/**
 * Placeholder binding until the ingestion worker lands: records the request and does
 * nothing else, so documents stay `pending`.
 */
@Injectable()
export class LoggingIngestionQueue extends IngestionQueue {
  private readonly logger = new Logger(IngestionQueue.name);

  enqueue(documentId: string): void {
    this.logger.log(`Ingestion requested for document ${documentId} (no worker bound yet)`);
  }
}
