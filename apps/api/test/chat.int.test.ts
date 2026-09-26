/**
 * Conversations, the streaming chat and POST /search, end to end: the real Nest app on
 * an ephemeral port, the real local Supabase (RLS included), and fake chat and embedding
 * models in place of the AiModule providers, so the suite is free and deterministic.
 *
 * With the environment variable LIVE_AI=1, only the "live" block runs instead, against
 * the configured providers: 3 chat calls, capped at 300 output tokens each. From apps/api:
 *   npx vitest run --project integration test/chat.int.test.ts --reporter=verbose
 * (the verbose reporter is what prints the answers; the default one hides console output).
 */
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  AiProviderError,
  type ChatModel,
  type ChatRequest,
  createChatModel,
  createEmbeddingModel,
  type EmbeddingModel,
} from '@repo/ai';
import {
  type ApiErrorBody,
  type ChatStreamEvent,
  type Conversation,
  type ConversationList,
  type ConversationWithMessages,
  createSseParser,
  type Document,
  type SearchResponse,
  type Source,
} from '@repo/shared';
import { buildEmbeddingText } from '@repo/rag';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAT_MODEL, EMBEDDING_MODEL, REWRITE_MODEL } from '../src/ai/ai.module.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { IngestionQueue } from '../src/ingestion/ingestion-queue.js';
import { ApiClient, RecordingIngestionQueue } from './support/app.js';
import { FakeChatModel, FakeEmbeddingModel } from './support/fake-models.js';
import {
  adminClient,
  config,
  createTestUser,
  deleteTestUsers,
  type TestUser,
  unitVector,
  writeChunksAsWorker,
} from './support/supabase.js';

const LIVE = process.env.LIVE_AI === '1';
const LIVE_MAX_TOKENS = 300;

interface Models {
  chat: ChatModel;
  rewrite: ChatModel;
  /** Omitted: the configured embedding model is used. */
  embedding?: EmbeddingModel;
}

interface ChatTestApp {
  baseUrl: string;
  close(): Promise<void>;
}

/** The real app, as in startTestApp, with the model providers replaced. */
async function startChatApp(models: Models): Promise<ChatTestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(IngestionQueue)
    .useValue(new RecordingIngestionQueue())
    .overrideProvider(CHAT_MODEL)
    .useValue(models.chat)
    .overrideProvider(REWRITE_MODEL)
    .useValue(models.rewrite);
  if (models.embedding) {
    builder = builder.overrideProvider(EMBEDDING_MODEL).useValue(models.embedding);
  }
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({
    logger: ['error'],
  });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/api`, close: () => app.close() };
}

interface StreamResult {
  status: number;
  contentType: string | null;
  events: ChatStreamEvent[];
  /** Set when the API answered with a JSON error instead of a stream. */
  error: ApiErrorBody | null;
}

/**
 * Sends a message and reads the answer the way the web app does: fetch plus the shared
 * SSE parser. `stopWhen` plays the Stop button: the request is aborted after that event.
 */
async function sendMessage(
  baseUrl: string,
  token: string,
  conversationId: string,
  content: string,
  stopWhen?: (event: ChatStreamEvent) => boolean,
): Promise<StreamResult> {
  const stop = new AbortController();
  const response = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
    signal: stop.signal,
  });
  const result: StreamResult = {
    status: response.status,
    contentType: response.headers.get('content-type'),
    events: [],
    error: null,
  };
  if (!result.contentType?.startsWith('text/event-stream') || !response.body) {
    result.error = (await response.json()) as ApiErrorBody;
    return result;
  }

  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return result;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      result.events.push(event);
      if (stopWhen?.(event)) {
        stop.abort();
        return result;
      }
    }
  }
}

function eventOf<T extends ChatStreamEvent['type']>(
  result: StreamResult,
  type: T,
): Extract<ChatStreamEvent, { type: T }> {
  const found = result.events.find(
    (event): event is Extract<ChatStreamEvent, { type: T }> => event.type === type,
  );
  if (!found) throw new Error(`no "${type}" event in ${JSON.stringify(result.events)}`);
  return found;
}

function deltaText(result: StreamResult): string {
  return result.events.map((event) => (event.type === 'delta' ? event.text : '')).join('');
}

/** Polls until `read` returns a value: for work the server finishes after the client left. */
async function eventually<T>(read: () => Promise<T | undefined>, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for the server');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createDocument(
  client: ApiClient,
  title: string,
  content: string,
): Promise<Document> {
  const response = await client.post<Document>('/documents', { title, content });
  expect(response.status).toBe(201);
  return response.body;
}

async function createConversation(client: ApiClient, title?: string): Promise<Conversation> {
  const response = await client.post<Conversation>('/conversations', title ? { title } : undefined);
  expect(response.status).toBe(201);
  return response.body;
}

describe.skipIf(LIVE)('with fake models', () => {
  const chat = new FakeChatModel();
  const rewrite = new FakeChatModel({}, { provider: 'fake', model: 'fake-rewrite' });
  // Every query embeds to axis 0, the vector of each document's chunk 0 (see unitVector).
  const embedding = new FakeEmbeddingModel(() => unitVector(0));

  let app: ChatTestApp;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let asAlice: ApiClient;
  let asBob: ApiClient;
  let travel: Document;
  let bobsDocument: Document;

  beforeAll(async () => {
    [app, alice, bob, carol] = await Promise.all([
      startChatApp({ chat, rewrite, embedding }),
      createTestUser('chat-alice'),
      createTestUser('chat-bob'),
      createTestUser('chat-carol'),
    ]);
    asAlice = new ApiClient(app.baseUrl, alice.token);
    asBob = new ApiClient(app.baseUrl, bob.token);

    travel = await createDocument(asAlice, 'Travel policy', 'Flights, hotels and expenses.');
    await writeChunksAsWorker(travel.id, travel.ingestion.contentVersion, [
      {
        chunkIndex: 0,
        headingPath: 'Flights',
        content: 'Employees may fly business class on flights longer than six hours.',
      },
      {
        chunkIndex: 1,
        headingPath: 'Hotels',
        content: 'Hotel stays are capped at 180 EUR per night in every city.',
      },
      {
        chunkIndex: 2,
        headingPath: 'Expenses',
        content: 'Expense reports are due within 30 days of the trip.',
      },
    ]);
    // Bob's chunk matches every query perfectly, by vector and by keywords: if RLS let
    // it through, it would rank first everywhere.
    bobsDocument = await createDocument(asBob, 'Bob travel notes', 'Private.');
    await writeChunksAsWorker(bobsDocument.id, bobsDocument.ingestion.contentVersion, [
      {
        chunkIndex: 0,
        content: 'Bob: business class flights, hotel stays and expense reports, all allowed.',
      },
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await deleteTestUsers(alice, bob, carol);
  });

  describe('conversations', () => {
    it('creates one with the default title, even without a body (201)', async () => {
      const conversation = await createConversation(asAlice);
      expect(conversation).toMatchObject({ id: expect.any(String), title: 'New conversation' });
    });

    it('lists the most recently active first, renames and deletes', async () => {
      const older = await createConversation(asAlice, '  Older  ');
      const newer = await createConversation(asAlice, 'Newer');
      expect(older.title).toBe('Older');

      const list = await asAlice.get<ConversationList>('/conversations');
      expect(list.status).toBe(200);
      const ids = list.body.items.map((item) => item.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));

      const renamed = await asAlice.patch<Conversation>(`/conversations/${older.id}`, {
        title: 'Renamed',
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body.title).toBe('Renamed');
      // A rename is activity too: the conversation moves to the top.
      const relisted = await asAlice.get<ConversationList>('/conversations');
      expect(relisted.body.items[0]?.id).toBe(older.id);

      expect((await asAlice.delete(`/conversations/${older.id}`)).status).toBe(204);
      expect((await asAlice.get(`/conversations/${older.id}`)).status).toBe(404);
    });

    it("answers 404 for another user's conversation, whatever the verb", async () => {
      const mine = await createConversation(asAlice, 'Private');
      const read = await asBob.get<ApiErrorBody>(`/conversations/${mine.id}`);
      expect(read.status).toBe(404);
      expect(read.body.error.code).toBe('NOT_FOUND');
      expect((await asBob.patch(`/conversations/${mine.id}`, { title: 'Mine now' })).status).toBe(
        404,
      );
      expect((await asBob.delete(`/conversations/${mine.id}`)).status).toBe(404);
      const bobsList = await asBob.get<ConversationList>('/conversations');
      expect(bobsList.body.items.map((item) => item.id)).not.toContain(mine.id);
      expect((await asAlice.get(`/conversations/${mine.id}`)).status).toBe(200);
    });

    it('validates ids and titles (400)', async () => {
      const badId = await asAlice.get<ApiErrorBody>('/conversations/not-a-uuid');
      expect(badId.status).toBe(400);
      const mine = await createConversation(asAlice);
      const badTitle = await asAlice.patch<ApiErrorBody>(`/conversations/${mine.id}`, {
        title: '   ',
      });
      expect(badTitle.status).toBe(400);
      expect(badTitle.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('chat stream', () => {
    const QUESTION = 'Can I fly business class on long flights?';
    const ANSWER = ['Yes, business class is allowed ', 'on flights over six hours [1].'];

    let conversation: Conversation;
    let first: StreamResult;

    beforeAll(async () => {
      conversation = await createConversation(asAlice);
      chat.script = { deltas: ANSWER, usage: { promptTokens: 321, completionTokens: 12 } };
      first = await sendMessage(app.baseUrl, alice.token, conversation.id, QUESTION);
    });

    it('streams start, deltas and done as text/event-stream', () => {
      expect(first.status).toBe(200);
      expect(first.contentType).toBe('text/event-stream');
      const types = first.events.map((event) => event.type);
      expect(types[0]).toBe('start');
      expect(types.at(-1)).toBe('done');
      expect(types.slice(1, -1).every((type) => type === 'delta')).toBe(true);
      expect(deltaText(first)).toBe(ANSWER.join(''));
    });

    it("retrieves only the caller's chunks, best match first", () => {
      const start = eventOf(first, 'start');
      expect(start.rewrittenQuery).toBeNull();
      expect(start.userMessage).toMatchObject({ role: 'user', content: QUESTION });
      expect(start.sources.length).toBeGreaterThan(0);
      expect(start.sources.map((source) => source.index)).toEqual(
        start.sources.map((_, position) => position + 1),
      );
      expect(start.sources.every((source) => source.documentId === travel.id)).toBe(true);
      expect(start.sources.map((source) => source.documentId)).not.toContain(bobsDocument.id);
      expect(start.sources[0]).toMatchObject({
        documentTitle: 'Travel policy',
        headingPath: 'Flights',
        score: { semanticRank: 1, keywordRank: expect.any(Number) },
      });
    });

    it('saves the answer and returns it in the conversation', async () => {
      const done = eventOf(first, 'done');
      expect(done.message).toMatchObject({
        role: 'assistant',
        content: ANSWER.join(''),
        status: 'complete',
        citations: [1],
        usage: { promptTokens: 321, completionTokens: 12 },
        model: 'fake/fake-chat',
        rewrittenQuery: null,
      });
      expect(done.message.sources).toEqual(eventOf(first, 'start').sources);

      const saved = await asAlice.get<ConversationWithMessages>(
        `/conversations/${conversation.id}`,
      );
      expect(saved.status).toBe(200);
      expect(saved.body.messages).toEqual([eventOf(first, 'start').userMessage, done.message]);
      expect(saved.body.conversation.title).toBe(QUESTION);
    });

    it('rewrites a follow-up with the history from the database', async () => {
      const followUp = 'And for hotels?';
      const standalone = 'What is the hotel cap per night for employees?';
      rewrite.script = { deltas: [standalone] };
      chat.script = { deltas: ['Hotels are capped at 180 EUR per night [1].'] };
      const embeddedBefore = embedding.calls.length;

      const result = await sendMessage(app.baseUrl, alice.token, conversation.id, followUp);

      expect(eventOf(result, 'start').rewrittenQuery).toBe(standalone);
      expect(embedding.calls.slice(embeddedBefore)).toEqual([
        { texts: [standalone], purpose: 'query' },
      ]);
      // The answer prompt: history from the database (citations stripped), then the
      // follow-up exactly as the user wrote it.
      const prompt = chat.lastMessages();
      expect(prompt.slice(1, 3)).toEqual([
        { role: 'user', content: QUESTION },
        { role: 'assistant', content: 'Yes, business class is allowed on flights over six hours.' },
      ]);
      expect(prompt.at(-1)?.content.endsWith(`Question: ${followUp}`)).toBe(true);
      expect(eventOf(result, 'done').message.rewrittenQuery).toBe(standalone);
    });

    it("answers 404 JSON before any stream when posting to another user's conversation", async () => {
      const result = await sendMessage(app.baseUrl, bob.token, conversation.id, 'Hello?');
      expect(result.status).toBe(404);
      expect(result.contentType).toContain('application/json');
      expect(result.error?.error.code).toBe('NOT_FOUND');
      const saved = await asAlice.get<ConversationWithMessages>(
        `/conversations/${conversation.id}`,
      );
      expect(saved.body.messages.map((message) => message.content)).not.toContain('Hello?');
    });

    it('answers 400 JSON for an empty or oversized message', async () => {
      for (const content of ['   ', 'x'.repeat(4001)]) {
        const result = await sendMessage(app.baseUrl, alice.token, conversation.id, content);
        expect(result.status).toBe(400);
        expect(result.error?.error).toMatchObject({
          code: 'VALIDATION_FAILED',
          requestId: expect.any(String),
        });
      }
    });

    it('answers 503 JSON before any stream when embeddings are down', async () => {
      const other = await createConversation(asAlice);
      embedding.error = new AiProviderError('unavailable', 'ollama is down', 'ollama');
      try {
        const result = await sendMessage(app.baseUrl, alice.token, other.id, QUESTION);
        expect(result.status).toBe(503);
        expect(result.error?.error.code).toBe('EMBEDDING_UNAVAILABLE');
      } finally {
        embedding.error = null;
      }
    });
  });

  describe('chat stream: stopping and failures', () => {
    it('aborts the model call when the client disconnects and saves the partial answer', async () => {
      const conversation = await createConversation(asAlice);
      chat.script = { deltas: ['Business class ', 'is allowed'], hangUntilAborted: true };

      const result = await sendMessage(
        app.baseUrl,
        alice.token,
        conversation.id,
        'Can I fly business class?',
        (event) => event.type === 'delta' && event.text === 'is allowed',
      );
      expect(result.events.map((event) => event.type)).toEqual(['start', 'delta', 'delta']);

      // The server only learns about the disconnect after the client left: poll.
      const partial = await eventually(async () => {
        const { body } = await asAlice.get<ConversationWithMessages>(
          `/conversations/${conversation.id}`,
        );
        return body.messages.find((message) => message.role === 'assistant');
      });
      expect(partial).toMatchObject({ content: 'Business class is allowed', status: 'aborted' });
    });

    it('sends an error event and saves the partial answer when the provider fails mid-stream', async () => {
      const conversation = await createConversation(asAlice);
      chat.script = {
        deltas: ['Business class '],
        error: new AiProviderError('rate_limit', 'fake: 429', 'fake', 429),
      };

      const result = await sendMessage(app.baseUrl, alice.token, conversation.id, 'Business?');
      expect(result.status).toBe(200);
      expect(result.events.map((event) => event.type)).toEqual(['start', 'delta', 'error']);
      expect(eventOf(result, 'error')).toEqual({
        type: 'error',
        code: 'AI_PROVIDER_ERROR',
        message: 'The AI provider is rate limiting requests. Try again shortly.',
      });
      const { body } = await asAlice.get<ConversationWithMessages>(
        `/conversations/${conversation.id}`,
      );
      expect(body.messages.at(-1)).toMatchObject({
        role: 'assistant',
        content: 'Business class ',
        status: 'error',
      });
    });

    it('sends only the last 6 finished messages of the conversation as history', async () => {
      const conversation = await createConversation(asAlice, 'Long conversation');
      const turns: [role: 'user' | 'assistant', content: string, status: string][] = [
        ['user', 'Q1', 'complete'],
        ['assistant', 'A1', 'complete'],
        ['user', 'Q2', 'complete'],
        ['assistant', 'A2', 'complete'],
        ['user', 'Q3', 'complete'],
        ['assistant', 'A3 was stopped', 'aborted'],
        ['user', 'Q4', 'complete'],
        ['assistant', 'A4', 'complete'],
      ];
      const { error } = await adminClient()
        .from('messages')
        .insert(
          turns.map(([role, content, status], position) => ({
            conversation_id: conversation.id,
            user_id: alice.id,
            role,
            content,
            status,
            created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, position)).toISOString(),
          })),
        );
      if (error) throw error;
      rewrite.script = { deltas: ['Standalone Q5?'] };
      chat.script = { deltas: ['A5'] };

      await sendMessage(app.baseUrl, alice.token, conversation.id, 'Q5');

      // Last 6 finished: A1 Q2 A2 Q3 Q4 A4; the prompt then starts at a user turn.
      const history = chat.lastMessages().slice(1, -1);
      expect(history.map((message) => message.content)).toEqual(['Q2', 'A2', 'Q3', 'Q4', 'A4']);
    });

    it('limits each user to 20 messages a minute, checked before anything else (429)', async () => {
      const asCarol = new ApiClient(app.baseUrl, carol.token);
      const path = `/conversations/${randomUUID()}/messages`;
      // Invalid bodies are rejected cheaply, but still count: the limit runs first.
      for (let request = 1; request <= 20; request += 1) {
        expect((await asCarol.post(path, { content: '' })).status).toBe(400);
      }
      const limited = await asCarol.post<ApiErrorBody>(path, { content: 'One more?' });
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(limited.headers.get('retry-after')).toEqual(expect.any(String));
      // Other routes keep the generous default limit.
      expect((await asCarol.get('/conversations')).status).toBe(200);
    });
  });

  describe('POST /search', () => {
    async function search(client: ApiClient, body: object): Promise<SearchResponse> {
      const response = await client.post<SearchResponse>('/search', body);
      expect(response.status).toBe(200);
      return response.body;
    }

    it('hybrid: fuses both arms over the caller’s chunks only', async () => {
      const { items } = await search(asAlice, { query: 'business class flights' });
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.documentId === travel.id)).toBe(true);
      expect(items[0]).toMatchObject({
        index: 1,
        headingPath: 'Flights',
        score: { semanticRank: 1, keywordRank: 1 },
      });
      expect(items[0]?.score.fused).toBeCloseTo(1 / 61 + 1 / 61, 10);
    });

    it('vector: every row comes from the vector arm only (keywordRank null)', async () => {
      const { items } = await search(asAlice, { query: 'zyxwv', mode: 'vector' });
      expect(items).toHaveLength(3);
      expect(items.map((item) => item.score.keywordRank)).toEqual([null, null, null]);
      expect(items.map((item) => item.score.semanticRank)).toEqual([1, 2, 3]);
      expect(items[0]?.headingPath).toBe('Flights');
    });

    it('keyword: every row comes from the keyword arm only, with no embedding call', async () => {
      const embeddedBefore = embedding.calls.length;
      const { items } = await search(asAlice, { query: 'hotel', mode: 'keyword' });
      expect(items.map((item) => item.headingPath)).toEqual(['Hotels']);
      expect(items[0]?.score).toMatchObject({ semanticRank: null, keywordRank: 1 });
      expect(embedding.calls.length).toBe(embeddedBefore);
    });

    it("never returns another user's chunks", async () => {
      const { items } = await search(asBob, { query: 'business class flights', limit: 20 });
      expect(items.map((item) => item.documentId)).toEqual([bobsDocument.id]);
    });

    it('validates the request (400)', async () => {
      const response = await asAlice.post<ApiErrorBody>('/search', { query: 'x', mode: 'magic' });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});

/** One line per source: its number, section and the rank each arm gave it. */
function summarize(sources: readonly Source[]): string[] {
  return sources.map(
    ({ index, headingPath, score }) =>
      `[${index}] ${headingPath} (vector ${score.semanticRank ?? '-'}, keyword ${score.keywordRank ?? '-'})`,
  );
}

/** Caps every request's output, so a live run costs next to nothing. */
function withMaxTokens(model: ChatModel, cap: number): ChatModel {
  const capped = (request: ChatRequest): ChatRequest => ({
    ...request,
    maxTokens: Math.min(request.maxTokens, cap),
  });
  return {
    info: model.info,
    complete: (request, options) => model.complete(capped(request), options),
    stream: (request, options) => model.stream(capped(request), options),
  };
}

describe.runIf(LIVE)('live AI (LIVE_AI=1): configured chat and embedding providers', () => {
  const chatConfig = config.ai.chat;
  const rewriteConfig = config.ai.rewrite;
  let app: ChatTestApp;
  let user: TestUser;

  beforeAll(async () => {
    if (!chatConfig || !rewriteConfig)
      throw new Error('LIVE_AI=1 needs a configured chat provider');
    [app, user] = await Promise.all([
      startChatApp({
        chat: withMaxTokens(createChatModel(chatConfig), LIVE_MAX_TOKENS),
        rewrite: withMaxTokens(createChatModel(rewriteConfig), LIVE_MAX_TOKENS),
      }),
      createTestUser('chat-live'),
    ]);

    // Chunks embedded for real (Ollama is free), written as the worker writes them.
    const client = new ApiClient(app.baseUrl, user.token);
    const doc = await createDocument(client, 'Quaylark travel policy', 'Travel rules.');
    const chunks = [
      ['Hotels > Lisbon', 'Hotel stays in Lisbon are capped at 145 EUR per night.'],
      ['Hotels > Berlin', 'Hotel stays in Berlin are capped at 160 EUR per night.'],
      ['Flights', 'Business class is allowed only on flights longer than six hours.'],
    ] as const;
    const vectors = await createEmbeddingModel(config.ai.embedding).embed(
      chunks.map(([heading, content]) => buildEmbeddingText(doc.title, heading, content)),
      'document',
    );
    const { error } = await adminClient().rpc('replace_document_chunks', {
      p_document_id: doc.id,
      p_content_version: doc.ingestion.contentVersion,
      p_embedding_model: config.ai.embedding.model,
      p_chunks: chunks.map(([heading, content], index) => ({
        chunk_index: index,
        heading_path: heading,
        content,
        token_estimate: Math.ceil(content.length / 4),
        content_hash: `live-${index}-${doc.id}`,
        embedding: vectors[index] ?? null,
      })),
    });
    if (error) throw error;
  });

  afterAll(async () => {
    await app?.close();
    await deleteTestUsers(user);
  });

  it('answers with a citation, then rewrites and answers a follow-up (3 model calls)', async () => {
    const client = new ApiClient(app.baseUrl, user.token);
    const conversation = await createConversation(client);

    const first = await sendMessage(
      app.baseUrl,
      user.token,
      conversation.id,
      'What is the hotel limit per night in Lisbon?',
    );
    console.log('[live] sources 1:', summarize(eventOf(first, 'start').sources));
    const firstDone = eventOf(first, 'done').message;
    console.log('[live] answer 1:', JSON.stringify(firstDone.content));
    console.log('[live] citations 1:', firstDone.citations, 'usage:', firstDone.usage);
    expect(firstDone.content).toContain('145');
    expect(firstDone.citations.length).toBeGreaterThan(0);

    const second = await sendMessage(app.baseUrl, user.token, conversation.id, 'And in Berlin?');
    const start = eventOf(second, 'start');
    console.log('[live] sources 2:', summarize(start.sources));
    const secondDone = eventOf(second, 'done').message;
    console.log('[live] rewritten query:', JSON.stringify(start.rewrittenQuery));
    console.log('[live] answer 2:', JSON.stringify(secondDone.content));
    console.log('[live] citations 2:', secondDone.citations, 'usage:', secondDone.usage);
    expect(start.rewrittenQuery).toMatch(/berlin/i);
    expect(secondDone.content).toContain('160');
    expect(secondDone.citations.length).toBeGreaterThan(0);
  });
});
