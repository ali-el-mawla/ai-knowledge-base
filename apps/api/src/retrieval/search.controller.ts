import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { type SearchRequest, searchRequestSchema, type SearchResponse } from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { RetrievalService } from './retrieval.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly retrieval: RetrievalService) {}

  /**
   * Retrieval without generation: what the chat would give the model, with both ranks,
   * so results can be inspected and the three modes compared. POST because the query is
   * free text; 200 because nothing is created.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async search(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: SearchRequest,
  ): Promise<SearchResponse> {
    const items = await this.retrieval.search(user, body.query, {
      mode: body.mode,
      limit: body.limit,
    });
    return { items };
  }
}
