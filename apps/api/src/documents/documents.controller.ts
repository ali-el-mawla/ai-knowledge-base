import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateDocumentBody,
  createDocumentSchema,
  type Document,
  type DocumentChunk,
  type DocumentList,
  type ListDocumentsQuery,
  listDocumentsQuerySchema,
  type UpdateDocumentBody,
  updateDocumentSchema,
} from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ParseUuidPipe, ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { DocumentsService } from './documents.service.js';

/** HTTP only; the rules live in DocumentsService. */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listDocumentsQuerySchema)) query: ListDocumentsQuery,
  ): Promise<DocumentList> {
    return this.documents.list(user, query);
  }

  /** 201; ingestion starts in the background (`ingestion.status` is `pending`). */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocumentBody,
  ): Promise<Document> {
    return this.documents.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUuidPipe) id: string): Promise<Document> {
    return this.documents.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body(new ZodValidationPipe(updateDocumentSchema)) body: UpdateDocumentBody,
  ): Promise<Document> {
    return this.documents.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.documents.remove(user, id);
  }

  /** 202: accepted for re-embedding, which happens in the background. */
  @Post(':id/reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  reindex(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<Document> {
    return this.documents.reindex(user, id);
  }

  @Get(':id/chunks')
  async chunks(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<{ items: DocumentChunk[] }> {
    return { items: await this.documents.listChunks(user, id) };
  }
}
