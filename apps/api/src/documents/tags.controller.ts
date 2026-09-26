import { Controller, Get } from '@nestjs/common';
import type { TagCount } from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DocumentsService } from './documents.service.js';

@Controller('tags')
export class TagsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: TagCount[] }> {
    return { items: await this.documents.tagCounts(user) };
  }
}
