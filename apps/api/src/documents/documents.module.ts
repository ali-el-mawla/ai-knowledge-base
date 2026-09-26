import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { TagsController } from './tags.controller.js';

@Module({
  imports: [IngestionModule],
  controllers: [DocumentsController, TagsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
