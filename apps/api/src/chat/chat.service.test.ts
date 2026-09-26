import { Logger } from '@nestjs/common';
import { AiProviderError } from '@repo/ai';
import type { HistoryTurn } from '@repo/rag';
import type { ChatStreamEvent, Conversation, Message, Source } from '@repo/shared';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { FakeChatModel, type FakeChatScript } from '../../test/support/fake-models.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  ChatNotConfiguredError,
  DatabaseError,
  EmbeddingUnavailableError,
  NotFoundError,
} from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import type { RetrievalService, SearchOptions } from '../retrieval/retrieval.service.js';
import type { ChatEventSink } from './chat-event-sink.js';
import { titleFromQuestion } from './chat-text.js';
import { CHAT_SETTINGS, ChatService } from './chat.service.js';
import {
  type AssistantMessageDraft,
  type ConversationsService,
  DEFAULT_CONVERSATION_TITLE,
} from './conversations.service.js';

const user: AuthUser = { id: 'user-1', email: 'a@example.test', accessToken: 'token-abc' };
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION = 'How many vacation days do I get?';

function source(index: number, content: string): Source {
  return {
    index,
    chunkId: `chunk-${index}`,
    documentId: 'doc-1',
    documentTitle: 'Handbook',
    headingPath: 'Leave',
    content,
    score: { fused: 1 / (60 + index), semanticRank: index, keywordRank: null },
  };
}

const SOURCES = [source(1, 'Full-time staff get 25 days.'), source(2, 'Part-time: pro rata.')];

/** The conversations store in memory, with the same contract as ConversationsService. */
class InMemoryConversations {
  conversation: Conversation = {
    id: CONVERSATION_ID,
    title: DEFAULT_CONVERSATION_TITLE,
    createdAt: '2026-09-26T10:00:00Z',
    updatedAt: '2026-09-26T10:00:00Z',
  };
  readonly messages: Message[] = [];
  requestedHistory: number | null = null;
  saveError: Error | null = null;

  getOwned(_user: AuthUser, id: string): Promise<Conversation> {
    if (id !== this.conversation.id) return Promise.reject(NotFoundError.resource('Conversation'));
    return Promise.resolve(this.conversation);
  }

  recentHistory(_user: AuthUser, _id: string, limit: number): Promise<HistoryTurn[]> {
    this.requestedHistory = limit;
    const turns = this.messages
      .filter((message) => message.status === 'complete')
      .slice(-limit)
      .map(({ role, content }) => ({ role, content }));
    return Promise.resolve(turns);
  }

  addUserMessage(_user: AuthUser, conversationId: string, content: string): Promise<Message> {
    return Promise.resolve(this.push({ conversationId, role: 'user', content }));
  }

  setTitleIfDefault(_user: AuthUser, _id: string, title: string): Promise<void> {
    if (this.conversation.title === DEFAULT_CONVERSATION_TITLE) {
      this.conversation = { ...this.conversation, title };
    }
    return Promise.resolve();
  }

  saveAssistantMessage(
    _user: AuthUser,
    conversationId: string,
    draft: AssistantMessageDraft,
  ): Promise<Message> {
    if (this.saveError) return Promise.reject(this.saveError);
    return Promise.resolve(
      this.push({
        conversationId,
        role: 'assistant',
        content: draft.content,
        status: draft.status,
        rewrittenQuery: draft.rewrittenQuery,
        sources: [...draft.sources],
        citations: draft.citations,
        usage: draft.usage,
        model: draft.model,
      }),
    );
  }

  /** Seeds earlier turns, as if they had been sent before. */
  seed(...turns: [role: Message['role'], content: string, status?: Message['status']][]): void {
    for (const [role, content, status = 'complete'] of turns) {
      this.push({ conversationId: CONVERSATION_ID, role, content, status });
    }
  }

  assistantMessages(): Message[] {
    return this.messages.filter((message) => message.role === 'assistant');
  }

  private push(fields: Partial<Message> & Pick<Message, 'role' | 'content'>): Message {
    const message: Message = {
      id: `message-${this.messages.length + 1}`,
      conversationId: CONVERSATION_ID,
      status: 'complete',
      rewrittenQuery: null,
      sources: [],
      citations: [],
      usage: null,
      model: null,
      createdAt: new Date(Date.UTC(2026, 8, 26, 10, this.messages.length)).toISOString(),
      ...fields,
    };
    this.messages.push(message);
    return message;
  }
}

/** Records what the service writes, in order, and fails loudly on protocol violations. */
class RecordingSink implements ChatEventSink {
  readonly calls: string[] = [];
  readonly events: ChatStreamEvent[] = [];
  readonly comments: string[] = [];
  onEvent: ((event: ChatStreamEvent) => void) | null = null;

  open(): void {
    this.calls.push('open');
  }

  send(event: ChatStreamEvent): void {
    if (!this.calls.includes('open')) throw new Error(`"${event.type}" sent before open()`);
    if (this.calls.includes('end')) throw new Error(`"${event.type}" sent after end()`);
    this.calls.push(event.type);
    this.events.push(event);
    this.onEvent?.(event);
  }

  comment(text: string): void {
    this.comments.push(text);
  }

  end(): void {
    this.calls.push('end');
  }

  event<T extends ChatStreamEvent['type']>(type: T): Extract<ChatStreamEvent, { type: T }> {
    const found = this.events.find(
      (event): event is Extract<ChatStreamEvent, { type: T }> => event.type === type,
    );
    if (!found) throw new Error(`no "${type}" event was sent`);
    return found;
  }

  deltaText(): string {
    return this.events.map((event) => (event.type === 'delta' ? event.text : '')).join('');
  }
}

interface SetupOptions {
  answer?: FakeChatScript;
  rewrite?: FakeChatScript;
  /** null: chat is not configured. */
  chatConfigured?: boolean;
}

function setup(options: SetupOptions = {}) {
  const conversations = new InMemoryConversations();
  const search = vi
    .fn<(user: AuthUser, query: string, options: SearchOptions) => Promise<Source[]>>()
    .mockResolvedValue(SOURCES);
  const chat = new FakeChatModel(
    options.answer ?? {
      deltas: ['Full-time staff get ', '25 days [1].'],
      usage: { promptTokens: 120, completionTokens: 30 },
    },
  );
  const rewrite = new FakeChatModel(options.rewrite ?? { deltas: ['Rewritten question?'] }, {
    provider: 'fake',
    model: 'fake-rewrite',
  });
  const configured = options.chatConfigured ?? true;
  const config = {
    ai: { chatDisabledReason: configured ? null : 'CHAT_PROVIDER is not set' },
  } as unknown as AppConfig;
  const service = new ChatService(
    conversations as unknown as ConversationsService,
    { search } as unknown as RetrievalService,
    configured ? chat : null,
    configured ? rewrite : null,
    config,
  );
  const sink = new RecordingSink();
  const disconnect = new AbortController();
  const run = (question = QUESTION, conversationId = CONVERSATION_ID): Promise<void> =>
    service.reply({ user, conversationId, question, requestId: 'req-1' }, sink, disconnect.signal);
  return { conversations, search, chat, rewrite, sink, disconnect, run };
}

let warn: MockInstance<Logger['warn']>;
let error: MockInstance<Logger['error']>;

beforeEach(() => {
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ChatService: a complete answer', () => {
  it('opens the stream, then sends start, the deltas and done, then ends', async () => {
    const { sink, run } = setup();
    await run();
    expect(sink.calls).toEqual(['open', 'start', 'delta', 'delta', 'done', 'end']);
    expect(sink.deltaText()).toBe('Full-time staff get 25 days [1].');
  });

  it('starts with the saved question and the sources', async () => {
    const { sink, run, conversations } = setup();
    await run();
    const start = sink.event('start');
    expect(start).toEqual({
      type: 'start',
      conversationId: CONVERSATION_ID,
      userMessage: conversations.messages[0],
      rewrittenQuery: null,
      sources: SOURCES,
    });
    expect(start.userMessage).toMatchObject({ role: 'user', content: QUESTION });
  });

  it('saves the answer with its sources, citations, usage and model, and sends it as done', async () => {
    const { sink, run, conversations } = setup();
    await run();
    const [saved] = conversations.assistantMessages();
    expect(saved).toMatchObject({
      role: 'assistant',
      content: 'Full-time staff get 25 days [1].',
      status: 'complete',
      rewrittenQuery: null,
      sources: SOURCES,
      citations: [1],
      usage: { promptTokens: 120, completionTokens: 30 },
      model: 'fake/fake-chat',
    });
    expect(sink.event('done').message).toEqual(saved);
  });

  it('retrieves 6 hybrid sources and answers with the configured limits', async () => {
    const { search, chat, run } = setup();
    await run();
    expect(search).toHaveBeenCalledWith(user, QUESTION, {
      mode: 'hybrid',
      limit: 6,
      signal: expect.any(AbortSignal),
    });
    expect(chat.requests[0]).toMatchObject({ maxTokens: 1024, temperature: 0.2 });
  });

  it('puts the sources first and the question last in the prompt', async () => {
    const { chat, run } = setup();
    await run();
    const messages = chat.lastMessages();
    expect(messages[0]?.role).toBe('system');
    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('<source index="1" document="Handbook" section="Leave">');
    expect(prompt.endsWith(`Question: ${QUESTION}`)).toBe(true);
  });

  it('keeps only citations of sources that exist', async () => {
    const { sink, run, conversations } = setup({
      answer: { deltas: ['25 days [1]', ', pro rata [2][9] and [0].'] },
    });
    await run();
    expect(conversations.assistantMessages()[0]?.citations).toEqual([1, 2]);
    expect(sink.event('done').message.citations).toEqual([1, 2]);
  });

  it('names a new conversation after its first question', async () => {
    const { run, conversations } = setup();
    const question = 'What is the parental leave policy for employees who joined this year?';
    await run(question);
    expect(conversations.conversation.title).toBe(titleFromQuestion(question));
  });

  it('keeps a title the user chose', async () => {
    const { run, conversations } = setup();
    conversations.conversation = { ...conversations.conversation, title: 'Leave questions' };
    await run();
    expect(conversations.conversation.title).toBe('Leave questions');
  });
});

describe('ChatService: query rewriting', () => {
  const FOLLOW_UP = 'And part-timers?';
  const REWRITTEN = 'How many vacation days do part-time employees get?';

  function followUp(rewrite: FakeChatScript = { deltas: [REWRITTEN] }) {
    const context = setup({ rewrite });
    context.conversations.seed(['user', QUESTION], ['assistant', 'You get 25 days [1].']);
    return context;
  }

  it('does not rewrite the first question', async () => {
    const { rewrite, search, sink, run } = setup();
    await run();
    expect(rewrite.requests).toHaveLength(0);
    expect(search.mock.calls[0]?.[1]).toBe(QUESTION);
    expect(sink.event('start').rewrittenQuery).toBeNull();
  });

  it('rewrites a follow-up into a standalone query and searches with it', async () => {
    const { rewrite, search, sink, run, conversations } = followUp();
    await run(FOLLOW_UP);

    expect(rewrite.requests[0]).toMatchObject({ maxTokens: 120, temperature: 0 });
    const rewritePrompt = rewrite.lastMessages().at(-1)?.content ?? '';
    // Earlier answers go in without their [n] markers, which pointed at other sources.
    expect(rewritePrompt).toContain('Assistant: You get 25 days.');
    expect(rewritePrompt).toContain(`Latest message: ${FOLLOW_UP}`);

    expect(search.mock.calls[0]?.[1]).toBe(REWRITTEN);
    expect(sink.event('start').rewrittenQuery).toBe(REWRITTEN);
    expect(conversations.assistantMessages().at(-1)?.rewrittenQuery).toBe(REWRITTEN);
  });

  it('answers the question as the user asked it, with the earlier turns as history', async () => {
    const { chat, run } = followUp();
    await run(FOLLOW_UP);
    const messages = chat.lastMessages();
    expect(messages.slice(1, 3)).toEqual([
      { role: 'user', content: QUESTION },
      { role: 'assistant', content: 'You get 25 days.' },
    ]);
    expect(messages.at(-1)?.content.endsWith(`Question: ${FOLLOW_UP}`)).toBe(true);
  });

  it.each<[string, FakeChatScript]>([
    [
      'the rewrite call fails',
      { error: new AiProviderError('unavailable', 'fake: down', 'fake', 503) },
    ],
    ['the rewrite is empty', { deltas: ['   '] }],
    ['the rewrite is too long to be a query', { deltas: ['x'.repeat(501)] }],
    ['the rewrite was cut off', { deltas: ['How many vacation'], finishReason: 'length' }],
  ])('falls back to the question as asked when %s', async (_case, script) => {
    const { search, sink, run } = followUp(script);
    await run(FOLLOW_UP);
    expect(search.mock.calls[0]?.[1]).toBe(FOLLOW_UP);
    expect(sink.event('start').rewrittenQuery).toBeNull();
    expect(sink.calls.at(-2)).toBe('done');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports no rewrite when the model returns the question unchanged', async () => {
    const { sink, run } = followUp({ deltas: ['"and part-timers?"'] });
    await run(FOLLOW_UP);
    expect(sink.event('start').rewrittenQuery).toBeNull();
  });
});

describe('ChatService: history', () => {
  it('loads the earlier finished turns from the store, capped at 6 messages', async () => {
    const { chat, run, conversations } = setup();
    for (let turn = 1; turn <= 5; turn += 1) {
      conversations.seed(['user', `Question ${turn}`], ['assistant', `Answer ${turn}`]);
    }
    conversations.seed(['user', 'Unanswered'], ['assistant', 'Stopped half', 'aborted']);
    await run();

    expect(conversations.requestedHistory).toBe(CHAT_SETTINGS.historyMessages);
    expect(CHAT_SETTINGS.historyMessages).toBe(6);
    const history = chat.lastMessages().slice(1, -1);
    // The partial answer is left out; the prompt starts with a user turn.
    expect(history.map((message) => message.content)).toEqual([
      'Question 4',
      'Answer 4',
      'Question 5',
      'Answer 5',
      'Unanswered',
    ]);
  });
});

describe('ChatService: stopping', () => {
  it('saves the partial answer as aborted and sends nothing more when the client leaves', async () => {
    const { sink, run, disconnect, conversations } = setup({
      answer: { deltas: ['Full-time staff ', 'get'], hangUntilAborted: true },
    });
    sink.onEvent = (event) => {
      if (event.type === 'delta' && event.text === 'get') disconnect.abort();
    };
    await run();

    expect(sink.calls).toEqual(['open', 'start', 'delta', 'delta', 'end']);
    expect(conversations.assistantMessages()).toEqual([
      expect.objectContaining({ content: 'Full-time staff get', status: 'aborted' }),
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it('saves nothing when the client leaves before the first word', async () => {
    const { sink, run, disconnect, conversations } = setup({ answer: { hangUntilAborted: true } });
    sink.onEvent = (event) => {
      if (event.type === 'start') disconnect.abort();
    };
    await run();
    expect(sink.calls).toEqual(['open', 'start', 'end']);
    expect(conversations.assistantMessages()).toEqual([]);
  });

  it('does not retrieve or open the stream when the client leaves during the rewrite', async () => {
    const { sink, run, disconnect, search, conversations } = setup({
      rewrite: { hangUntilAborted: true },
    });
    conversations.seed(['user', QUESTION], ['assistant', 'You get 25 days.']);
    setImmediate(() => disconnect.abort());
    await run('And part-timers?');
    expect(search).not.toHaveBeenCalled();
    expect(sink.calls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('ChatService: failures after the stream started', () => {
  it('sends a safe error event and saves the partial answer as error', async () => {
    const { sink, run, conversations } = setup({
      answer: {
        deltas: ['Full-time staff '],
        error: new AiProviderError(
          'rate_limit',
          'anthropic: 429 Too Many Requests',
          'anthropic',
          429,
        ),
      },
    });
    await run();

    expect(sink.calls).toEqual(['open', 'start', 'delta', 'error', 'end']);
    expect(sink.event('error')).toEqual({
      type: 'error',
      code: 'AI_PROVIDER_ERROR',
      message: 'The AI provider is rate limiting requests. Try again shortly.',
    });
    expect(conversations.assistantMessages()).toEqual([
      expect.objectContaining({ content: 'Full-time staff ', status: 'error' }),
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('anthropic: 429'));
  });

  it('maps a rejected API key to its own message and saves nothing without text', async () => {
    const { sink, run, conversations } = setup({
      answer: { error: new AiProviderError('auth', 'anthropic: 401', 'anthropic', 401) },
    });
    await run();
    expect(sink.event('error').message).toBe('The AI provider rejected the API key.');
    expect(conversations.assistantMessages()).toEqual([]);
  });

  it('hides unexpected errors behind the generic internal message', async () => {
    const { sink, run } = setup({ answer: { error: new TypeError('x is undefined') } });
    await run();
    expect(sink.event('error')).toMatchObject({ code: 'INTERNAL' });
    expect(sink.event('error').message).not.toContain('undefined');
    expect(error).toHaveBeenCalledOnce();
  });

  it('reports an answer that could not be saved as an error instead of done', async () => {
    const { sink, run, conversations } = setup();
    conversations.saveError = new DatabaseError('save assistant message', { code: '23503' });
    await run();
    expect(sink.calls).toEqual(['open', 'start', 'delta', 'delta', 'error', 'end']);
    expect(sink.event('error').code).toBe('INTERNAL');
  });

  it('sends a keep-alive comment every 15 s while the model is slow, and stops after the end', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { sink, run, disconnect } = setup({
      answer: { deltas: ['Thinking'], hangUntilAborted: true },
    });
    const streaming = new Promise<void>((resolve) => {
      sink.onEvent = (event) => {
        if (event.type === 'delta') resolve();
      };
    });
    const finished = run();
    await streaming;

    await vi.advanceTimersByTimeAsync(15_000);
    expect(sink.comments).toEqual(['keep-alive']);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sink.comments).toHaveLength(2);

    disconnect.abort();
    await finished;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sink.comments).toHaveLength(2);
  });
});

describe('ChatService: failures before the stream started (JSON errors)', () => {
  it('refuses with 503 when chat is not configured, before saving anything', async () => {
    const { sink, run, conversations } = setup({ chatConfigured: false });
    const failure = run();
    await expect(failure).rejects.toBeInstanceOf(ChatNotConfiguredError);
    await expect(failure).rejects.toMatchObject({
      status: 503,
      details: { reason: 'CHAT_PROVIDER is not set' },
    });
    expect(sink.calls).toEqual([]);
    expect(conversations.messages).toEqual([]);
  });

  it('answers 404 for a conversation the caller does not own', async () => {
    const { sink, run, search, conversations } = setup();
    await expect(run(QUESTION, '22222222-2222-4222-8222-222222222222')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(search).not.toHaveBeenCalled();
    expect(sink.calls).toEqual([]);
    expect(conversations.messages).toEqual([]);
  });

  it('lets a retrieval failure through as an error, without opening the stream', async () => {
    const { sink, run, search } = setup();
    search.mockRejectedValue(
      EmbeddingUnavailableError.from(new AiProviderError('unavailable', 'down', 'ollama')),
    );
    await expect(run()).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(sink.calls).toEqual([]);
  });
});
