import { Module } from '@nestjs/common';
import { RetrievalService } from './retrieval.service.js';
import { SearchController } from './search.controller.js';

@Module({
  controllers: [SearchController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
