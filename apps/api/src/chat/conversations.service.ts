import { Injectable } from '@nestjs/common';
import type { HistoryTurn } from '@repo/rag';
import type {
  Conversation,
  ConversationList,
  ConversationWithMessages,
  CreateConversationBody,
  Message,
  MessageStatus,
  Source,
  TokenUsage,
  UpdateConversationBody,
} from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseError, NotFoundError } from '../common/errors/app-errors.js';
import { type Db, SupabaseService } from '../supabase/supabase.service.js';
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  toConversation,
  toMessage,
  toRole,
  toSourcesSnapshot,
} from './chat.mapper.js';

/** The column default in the chat migration; the first question replaces it. */
export const DEFAULT_CONVERSATION_TITLE = 'New conversation';

/** No pagination yet: the sidebar lists the most recent conversations only. */
const CONVERSATION_LIST_LIMIT = 200;

export interface AssistantMessageDraft {
  content: string;
  status: MessageStatus;
  rewrittenQuery: string | null;
  sources: readonly Source[];
  citations: number[];
  usage: TokenUsage | null;
  /** "provider/model". */
  model: string;
}

/**
 * User requests run through the user's own client, so RLS hides another user's
 * conversation (404). The exception is saving an assistant answer: users may not write
 * assistant rows (a forged turn would re-enter the prompt as history), so the API writes
 * them with the admin client after checking ownership.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(user: AuthUser): Promise<ConversationList> {
    const { data, error } = await this.db(user)
      .from('conversations')
      .select(CONVERSATION_COLUMNS)
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(CONVERSATION_LIST_LIMIT);
    if (error) throw new DatabaseError('list conversations', error);
    return { items: data.map(toConversation) };
  }

  async create(user: AuthUser, body: CreateConversationBody): Promise<Conversation> {
    const { data, error } = await this.db(user)
      .from('conversations')
      .insert(body.title ? { title: body.title } : {})
      .select(CONVERSATION_COLUMNS)
      .single();
    if (error) throw new DatabaseError('create conversation', error);
    return toConversation(data);
  }

  /** The conversation with every message, oldest first. */
  async get(user: AuthUser, id: string): Promise<ConversationWithMessages> {
    const db = this.db(user);
    const [conversation, messages] = await Promise.all([
      this.getOwned(user, id),
      db.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at'),
    ]);
    if (messages.error) throw new DatabaseError('list messages', messages.error);
    return { conversation, messages: messages.data.map(toMessage) };
  }

  async rename(user: AuthUser, id: string, body: UpdateConversationBody): Promise<Conversation> {
    const { data, error } = await this.db(user)
      .from('conversations')
      .update({ title: body.title })
      .eq('id', id)
      .select(CONVERSATION_COLUMNS)
      .maybeSingle();
    if (error) throw new DatabaseError('rename conversation', error);
    if (!data) throw NotFoundError.resource('Conversation');
    return toConversation(data);
  }

  /** Its messages go with it (foreign key cascade). */
  async remove(user: AuthUser, id: string): Promise<void> {
    const { data, error } = await this.db(user)
      .from('conversations')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new DatabaseError('delete conversation', error);
    if (data.length === 0) throw NotFoundError.resource('Conversation');
  }

  /** The conversation if the caller owns it; 404 otherwise. */
  async getOwned(user: AuthUser, id: string): Promise<Conversation> {
    const { data, error } = await this.db(user)
      .from('conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DatabaseError('read conversation', error);
    if (!data) throw NotFoundError.resource('Conversation');
    return toConversation(data);
  }

  /** Only while the title is still the default, so a rename by the user always wins. */
  async setTitleIfDefault(user: AuthUser, id: string, title: string): Promise<void> {
    const { error } = await this.db(user)
      .from('conversations')
      .update({ title })
      .eq('id', id)
      .eq('title', DEFAULT_CONVERSATION_TITLE);
    if (error) throw new DatabaseError('name conversation', error);
  }

  /** RLS lets a user insert only `role = 'user'` rows into their own conversations. */
  async addUserMessage(user: AuthUser, conversationId: string, content: string): Promise<Message> {
    const { data, error } = await this.db(user)
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw new DatabaseError('save user message', error);
    return toMessage(data);
  }

  /**
   * The last `limit` finished messages, oldest first. History comes from the database,
   * never the client, so a client cannot put words in the assistant's mouth. Aborted and
   * failed answers are partial and left out.
   */
  async recentHistory(
    user: AuthUser,
    conversationId: string,
    limit: number,
  ): Promise<HistoryTurn[]> {
    const { data, error } = await this.db(user)
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new DatabaseError('load chat history', error);
    return data.reverse().map((row) => ({ role: toRole(row.role), content: row.content }));
  }

  /**
   * Admin client, because users may not write assistant rows. The caller has checked
   * ownership with `getOwned`; the explicit `user_id` and the composite foreign key
   * (conversation_id, user_id) also stop the row from landing in someone else's conversation.
   */
  async saveAssistantMessage(
    user: AuthUser,
    conversationId: string,
    draft: AssistantMessageDraft,
  ): Promise<Message> {
    const { data, error } = await this.supabase
      .admin()
      .from('messages')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'assistant',
        content: draft.content,
        status: draft.status,
        rewritten_query: draft.rewrittenQuery,
        sources: toSourcesSnapshot(draft.sources),
        citations: draft.citations,
        prompt_tokens: draft.usage?.promptTokens ?? null,
        completion_tokens: draft.usage?.completionTokens ?? null,
        model: draft.model,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw new DatabaseError('save assistant message', error);
    return toMessage(data);
  }

  private db(user: AuthUser): Db {
    return this.supabase.forUser(user.accessToken);
  }
}
