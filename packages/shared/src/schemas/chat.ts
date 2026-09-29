import { z } from 'zod';
import type { Source } from './search.js';

export const MESSAGE_CONTENT_MAX = 4000;

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});
export type CreateConversationBody = z.output<typeof createConversationSchema>;

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export type UpdateConversationBody = z.output<typeof updateConversationSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_CONTENT_MAX),
});
export type SendMessageBody = z.output<typeof sendMessageSchema>;

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'complete' | 'aborted' | 'error';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  /** The standalone question used for retrieval, when a follow-up was rewritten. Assistant messages only. */
  rewrittenQuery: string | null;
  /** Snapshot of the sources given to the model, so citations survive later document edits. */
  sources: Source[];
  /** Source indexes the answer cited, validated by the server. */
  citations: number[];
  usage: TokenUsage | null;
  /** "provider/model" that produced an assistant message. */
  model: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationList {
  items: Conversation[];
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}
