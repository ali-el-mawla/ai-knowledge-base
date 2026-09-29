import { Module } from '@nestjs/common';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  imports: [RetrievalModule],
  controllers: [ConversationsController, ChatController],
  providers: [ConversationsService, ChatService],
})
export class ChatModule {}
