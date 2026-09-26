import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service.js';
import { SearchController } from './search.controller.js';

/** Hybrid retrieval: `POST /search`, and the sources behind every chat answer. */
@Module({
  controllers: [SearchController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
