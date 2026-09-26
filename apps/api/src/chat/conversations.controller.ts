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
} from '@nestjs/common';
import {
  type Conversation,
  type ConversationList,
  type ConversationWithMessages,
  type CreateConversationBody,
  createConversationSchema,
  type UpdateConversationBody,
  updateConversationSchema,
} from '@repo/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ParseUuidPipe, ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ConversationsService } from './conversations.service.js';

// Every field is optional, so a POST without a body is as valid as `{}`.
const createBodySchema = z.preprocess((body) => body ?? {}, createConversationSchema);

/** HTTP only; the rules live in ConversationsService. Messages are sent through ChatController. */
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /** Most recently active first (a new message moves its conversation to the top). */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ConversationList> {
    return this.conversations.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBodySchema)) body: CreateConversationBody,
  ): Promise<Conversation> {
    return this.conversations.create(user, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<ConversationWithMessages> {
    return this.conversations.get(user, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) body: UpdateConversationBody,
  ): Promise<Conversation> {
    return this.conversations.rename(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUuidPipe) id: string): Promise<void> {
    return this.conversations.remove(user, id);
  }
}
