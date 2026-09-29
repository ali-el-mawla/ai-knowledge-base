import { Injectable, Logger } from '@nestjs/common';
import { type ChatMessage, type ChatModel, isAbortError } from '@repo/ai';
import {
  buildAnswerMessages,
  buildRewriteMessages,
  type HistoryTurn,
  parseCitations,
  PROMPT_LIMITS,
} from '@repo/rag';
import type { Message, MessageStatus, Source, TokenUsage } from '@repo/shared';
import { InjectChatModel, InjectRewriteModel, type OptionalChatModel } from '../ai/ai.module.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ChatNotConfiguredError } from '../common/errors/app-errors.js';
import { resolveError } from '../common/filters/api-exception.filter.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { RETRIEVAL } from '../retrieval/retrieval.constants.js';
import { RetrievalService } from '../retrieval/retrieval.service.js';
import type { ChatEventSink } from './chat-event-sink.js';
import { normalizeRewrite, sameQuestion, titleFromQuestion } from './chat-text.js';
import { ConversationsService, DEFAULT_CONVERSATION_TITLE } from './conversations.service.js';

/** Chat generation settings; the retrieval ones are in `RETRIEVAL`. */
export const CHAT_SETTINGS = {
  /**
   * No temperature here: newer models (Claude Sonnet 5, OpenAI reasoning models) reject
   * it. Grounding comes from the prompt rules; CHAT_TEMPERATURE sets one if a model needs it.
   */
  answer: { maxTokens: 1024 },
  /** A rewrite is one search query. */
  rewrite: { maxTokens: 120 },
  /** A longer "rewrite" means the model answered instead (same cap as a search query). */
  rewriteMaxChars: 500,
  /** Earlier messages loaded for the prompt; the prompt builder applies the same cap. */
  historyMessages: PROMPT_LIMITS.answer.turns,
  /** SSE comment interval, well under the usual 60 s idle timeout of proxies. */
  keepAliveMs: 15_000,
} as const;

export interface ChatTurnRequest {
  user: AuthUser;
  conversationId: string;
  /** The user's message, already validated. */
  question: string;
  /** Only for log lines, to match them with the client's error report. */
  requestId?: string;
}

interface AnswerContext {
  request: ChatTurnRequest;
  chat: ChatModel;
  history: HistoryTurn[];
  rewrittenQuery: string | null;
  sources: Source[];
}

/** An error's message plus its own fields (PostgREST errors carry code, details and hint). */
function describe(value: unknown): string {
  if (!(value instanceof Error)) return JSON.stringify(value);
  return `${value.name}: ${value.message} ${JSON.stringify(value)}`;
}

interface Generation {
  text: string;
  usage: TokenUsage | null;
  /** `error` carries the failure, to be logged and turned into a safe `error` event. */
  outcome: { status: 'complete' } | { status: 'aborted' } | { status: 'error'; error: unknown };
}

/**
 * One chat turn, end to end: rewrite a follow-up into a standalone query, retrieve
 * sources, save the question, stream the answer, save it with its validated citations.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly retrieval: RetrievalService,
    @InjectChatModel() private readonly chatModel: OptionalChatModel,
    @InjectRewriteModel() private readonly rewriteModel: OptionalChatModel,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /**
   * Error contract: everything that can fail before `sink.open()` (chat not configured,
   * unknown conversation, database or embedding failures) is thrown and becomes a normal
   * JSON error, with nothing saved. Once the sink is open this never throws: a failure is
   * sent as an `error` event and the stream ends. `signal` fires when the client disconnects.
   */
  async reply(request: ChatTurnRequest, sink: ChatEventSink, signal: AbortSignal): Promise<void> {
    const chat = this.chatModel;
    if (!chat) {
      throw new ChatNotConfiguredError(this.config.ai.chatDisabledReason ?? 'no chat model');
    }
    const { user, conversationId, question } = request;

    const conversation = await this.conversations.getOwned(user, conversationId);
    // Read before the new question is saved (below), so the history holds only the earlier turns.
    const history = await this.conversations.recentHistory(
      user,
      conversationId,
      CHAT_SETTINGS.historyMessages,
    );

    // A first question is already standalone; only follow-ups ("and for part-timers?")
    // need the conversation folded in before they can be searched.
    const rewrittenQuery =
      history.length > 0 ? await this.rewriteQuestion(request, history, signal) : null;
    if (signal.aborted) return;

    let sources: Source[];
    try {
      sources = await this.retrieval.search(user, rewrittenQuery ?? question, {
        mode: 'hybrid',
        limit: RETRIEVAL.chatSources,
        signal,
      });
    } catch (error) {
      if (signal.aborted) return; // the client left; nobody is waiting for an error
      throw error;
    }
    if (signal.aborted) return;

    // Saved only now, right before the stream opens: a turn refused earlier (a 503 while
    // embeddings are down) leaves no question behind for a retry to duplicate.
    const userMessage = await this.conversations.addUserMessage(user, conversationId, question);
    if (conversation.title === DEFAULT_CONVERSATION_TITLE) {
      await this.nameConversation(request);
    }

    sink.open();
    sink.send({ type: 'start', conversationId, userMessage, rewrittenQuery, sources });
    await this.streamAnswer({ request, chat, history, rewrittenQuery, sources }, sink, signal);
  }

  private async streamAnswer(
    context: AnswerContext,
    sink: ChatEventSink,
    signal: AbortSignal,
  ): Promise<void> {
    const keepAlive = setInterval(() => sink.comment('keep-alive'), CHAT_SETTINGS.keepAliveMs);
    try {
      // The prompt gets the question as the user typed it; the rewrite is only for retrieval.
      const messages = buildAnswerMessages({
        question: context.request.question,
        sources: context.sources,
        history: context.history,
      });
      const generation = await this.generate(context.chat, messages, sink, signal);
      await this.finish(context, generation, sink);
    } finally {
      clearInterval(keepAlive);
      sink.end();
    }
  }

  /** Streams deltas to the sink while collecting the text. Never throws. */
  private async generate(
    chat: ChatModel,
    messages: ChatMessage[],
    sink: ChatEventSink,
    signal: AbortSignal,
  ): Promise<Generation> {
    let text = '';
    let usage: TokenUsage | null = null;
    try {
      const parts = chat.stream({ messages, ...CHAT_SETTINGS.answer }, { signal });
      for await (const part of parts) {
        if (part.type === 'delta') {
          text += part.text;
          sink.send({ type: 'delta', text: part.text });
        } else if (part.type === 'usage') {
          usage = part.usage;
        }
      }
      return { text, usage, outcome: { status: 'complete' } };
    } catch (error) {
      // Checked on the signal too: a disconnect can surface as a different error.
      if (signal.aborted || isAbortError(error)) {
        return { text, usage, outcome: { status: 'aborted' } };
      }
      return { text, usage, outcome: { status: 'error', error } };
    }
  }

  private async finish(
    context: AnswerContext,
    generation: Generation,
    sink: ChatEventSink,
  ): Promise<void> {
    const { outcome } = generation;
    if (outcome.status === 'complete') {
      const saved = await this.save(context, generation, 'complete');
      if (saved instanceof Error) {
        const { code, message } = resolveError(saved);
        sink.send({ type: 'error', code, message });
        return;
      }
      sink.send({ type: 'done', message: saved });
      return;
    }

    if (outcome.status === 'aborted') {
      // Nobody is listening any more; keep what was generated so a reload shows it.
      if (generation.text) await this.save(context, generation, 'aborted');
      return;
    }

    this.logFailure(context.request, 'Answer generation failed', outcome.error);
    if (generation.text) await this.save(context, generation, 'error');
    // The same code and message a JSON error would carry, never the provider's raw text.
    const { code, message } = resolveError(outcome.error);
    sink.send({ type: 'error', code, message });
  }

  /** Saves the answer; a failure is logged and returned, since the stream must still end cleanly. */
  private async save(
    context: AnswerContext,
    generation: Generation,
    status: MessageStatus,
  ): Promise<Message | Error> {
    const { request, chat, rewrittenQuery, sources } = context;
    try {
      return await this.conversations.saveAssistantMessage(request.user, request.conversationId, {
        content: generation.text,
        status,
        rewrittenQuery,
        sources,
        // Only numbers of sources that exist survive; a hallucinated [9] is dropped.
        citations: parseCitations(generation.text, sources.length),
        usage: generation.usage,
        model: `${chat.info.provider}/${chat.info.model}`,
      });
    } catch (error) {
      this.logFailure(request, `Saving the ${status} answer failed`, error);
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * The follow-up as a standalone search query, or null to search with the question as
   * asked. Any failure falls back to the raw question: a worse search beats no answer.
   */
  private async rewriteQuestion(
    request: ChatTurnRequest,
    history: HistoryTurn[],
    signal: AbortSignal,
  ): Promise<string | null> {
    const model = this.rewriteModel;
    if (!model) return null;
    try {
      const completion = await model.complete(
        {
          messages: buildRewriteMessages({ question: request.question, history }),
          ...CHAT_SETTINGS.rewrite,
        },
        { signal },
      );
      const rewritten = normalizeRewrite(completion.text);
      if (
        !rewritten ||
        rewritten.length > CHAT_SETTINGS.rewriteMaxChars ||
        completion.finishReason === 'length'
      ) {
        this.logger.warn(
          `${this.tag(request)} Unusable query rewrite (${rewritten.length} chars, finish ${completion.finishReason}); searching with the question as asked`,
        );
        return null;
      }
      return sameQuestion(rewritten, request.question) ? null : rewritten;
    } catch (error) {
      if (!isAbortError(error)) {
        this.logFailure(
          request,
          'Query rewrite failed; searching with the question as asked',
          error,
        );
      }
      return null;
    }
  }

  /** Names a new conversation after its first question. Cosmetic, so it never fails the turn. */
  private async nameConversation(request: ChatTurnRequest): Promise<void> {
    try {
      await this.conversations.setTitleIfDefault(
        request.user,
        request.conversationId,
        titleFromQuestion(request.question),
      );
    } catch (error) {
      this.logFailure(request, 'Naming the conversation failed', error);
    }
  }

  /**
   * Upstream failures are warnings with the provider's message; our own failures get the
   * stack and the cause (e.g. the PostgREST error). Never the prompt or the documents.
   */
  private logFailure(request: ChatTurnRequest, what: string, error: unknown): void {
    const summary = `${this.tag(request)} ${what}`;
    if (resolveError(error).logLevel !== 'error') {
      this.logger.warn(`${summary}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    const cause = error instanceof Error ? error.cause : undefined;
    this.logger.error(
      summary,
      cause === undefined ? stack : `${stack}\nCaused by: ${describe(cause)}`,
    );
  }

  private tag(request: ChatTurnRequest): string {
    return `[${request.requestId ?? 'no-request-id'}] conversation ${request.conversationId}:`;
  }
}
