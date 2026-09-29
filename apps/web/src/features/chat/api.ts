import type {
  AiInfo,
  Conversation,
  ConversationList,
  ConversationWithMessages,
  CreateConversationBody,
  SendMessageBody,
  UpdateConversationBody,
} from '@repo/shared';
import { apiClient } from '@/lib/api-client';

const conversationPath = (id: string) => `/conversations/${encodeURIComponent(id)}`;

export async function listConversations(signal?: AbortSignal) {
  const { items } = await apiClient.get<ConversationList>('/conversations', { signal });
  return items;
}

export function getConversation(id: string, signal?: AbortSignal) {
  return apiClient.get<ConversationWithMessages>(conversationPath(id), { signal });
}

/** Without a title the API uses "New conversation"; the first question then renames it. */
export function createConversation(body: CreateConversationBody = {}) {
  return apiClient.post<Conversation>('/conversations', body);
}

export function renameConversation(id: string, body: UpdateConversationBody) {
  return apiClient.patch<Conversation>(conversationPath(id), body);
}

export function deleteConversation(id: string) {
  return apiClient.delete(conversationPath(id));
}

export function getAiInfo(signal?: AbortSignal) {
  return apiClient.get<AiInfo>('/ai/info', { signal });
}

/**
 * Resolves with the raw `text/event-stream` response once the headers arrive. Validation,
 * rate limit and ownership failures come before streaming, so they reject with an `ApiError`.
 */
export function sendMessage(conversationId: string, content: string, signal: AbortSignal) {
  const body: SendMessageBody = { content };
  return apiClient.raw('POST', `${conversationPath(conversationId)}/messages`, { body, signal });
}

export type SendMessageFn = typeof sendMessage;
