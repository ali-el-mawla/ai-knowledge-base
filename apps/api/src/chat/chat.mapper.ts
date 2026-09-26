import type {
  Conversation,
  Message,
  MessageRole,
  MessageStatus,
  Source,
  TokenUsage,
} from '@repo/shared';
import { z } from 'zod';
import type { Json, Tables } from '../database.types.js';

/**
 * Row shapes of `conversations` and `messages` and their mapping to the shared DTOs.
 * As for documents, `user_id` is never selected: ownership is implied by RLS.
 */
export const CONVERSATION_COLUMNS = 'id, title, created_at, updated_at';
export type ConversationRow = Pick<
  Tables<'conversations'>,
  'id' | 'title' | 'created_at' | 'updated_at'
>;

export const MESSAGE_COLUMNS =
  'id, conversation_id, role, content, status, rewritten_query, sources, citations, prompt_tokens, completion_tokens, model, created_at';
export type MessageRow = Omit<Tables<'messages'>, 'user_id'>;

export function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

// The database CHECK constraints allow only these values; the fallbacks are unreachable.
export const toRole = (role: string): MessageRole => (role === 'assistant' ? 'assistant' : 'user');
const MESSAGE_STATUSES: readonly MessageStatus[] = ['complete', 'aborted', 'error'];
const toStatus = (status: string): MessageStatus =>
  MESSAGE_STATUSES.find((known) => known === status) ?? 'error';

export function toMessage(row: MessageRow): Message {
  const usage: TokenUsage | null =
    row.prompt_tokens !== null && row.completion_tokens !== null
      ? { promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens }
      : null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: toRole(row.role),
    content: row.content,
    status: toStatus(row.status),
    rewrittenQuery: row.rewritten_query,
    sources: parseSourcesSnapshot(row.sources),
    citations: row.citations,
    usage,
    model: row.model,
    createdAt: row.created_at,
  };
}

/**
 * The sources an answer was given are stored with it (jsonb), so its [n] citations keep
 * pointing at the exact text the model read even after the document is edited or deleted.
 */
export function toSourcesSnapshot(sources: readonly Source[]): Json[] {
  return sources.map((source) => ({ ...source, score: { ...source.score } }));
}

const sourceSnapshotSchema = z.array(
  z.object({
    index: z.number().int(),
    chunkId: z.string(),
    documentId: z.string(),
    documentTitle: z.string(),
    headingPath: z.string(),
    content: z.string(),
    score: z.object({
      fused: z.number(),
      semanticRank: z.number().nullable(),
      keywordRank: z.number().nullable(),
    }),
  }),
);

/** A snapshot that does not parse shows no sources instead of failing the whole conversation. */
export function parseSourcesSnapshot(value: Json): Source[] {
  const parsed = sourceSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
