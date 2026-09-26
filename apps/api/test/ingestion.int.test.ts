/**
 * The ingestion pipeline end to end: HTTP API, the real worker and IngestionService,
 * the real database function `replace_document_chunks` and RLS on the chunks view.
 * Only the embedding provider is faked (deterministic vectors), so no Ollama is needed.
 */
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AiProviderError, type EmbeddingPurpose } from '@repo/ai';
import type { Document, DocumentChunk, HealthResponse } from '@repo/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EMBEDDING_MODEL } from '../src/ai/ai.module.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { AppConfig } from '../src/config/app-config.js';
import { IngestionQueue } from '../src/ingestion/ingestion-queue.js';
import { IngestionRepository } from '../src/ingestion/ingestion.repository.js';
import type { IngestionOutcome } from '../src/ingestion/ingestion.service.js';
import { IngestionWorker } from '../src/ingestion/ingestion.worker.js';
import { ApiClient } from './support/app.js';
import { FAKE_EMBEDDING_DIMENSIONS, FakeEmbeddingModel } from './support/fake-models.js';
import {
  adminClient,
  config,
  createTestUser,
  deleteTestUsers,
  type TestUser,
} from './support/supabase.js';

/** Other test files share this database: their pending documents are not ours to ingest. */
class TestIngestionWorker extends IngestionWorker {
  override onApplicationBootstrap(): Promise<void> {
    return Promise.resolve();
  }
}

/** A distinct, deterministic unit vector per text (sha256 blocks), like a real model's. */
function hashVector(text: string): number[] {
  const values: number[] = [];
  for (let block = 0; values.length < FAKE_EMBEDDING_DIMENSIONS; block += 1) {
    const digest = createHash('sha256').update(`${block}:${text}`).digest();
    for (let i = 0; i < digest.length && values.length < FAKE_EMBEDDING_DIMENSIONS; i += 1) {
      values.push(digest.readUInt8(i) / 127.5 - 1);
    }
  }
  const norm = Math.hypot(...values);
  return values.map((value) => value / norm);
}

/** Can hold its calls, to stage "edited or deleted while being embedded". */
class GatedEmbeddingModel extends FakeEmbeddingModel {
  private gate: Promise<void> | null = null;
  private readonly callWaiters: (() => void)[] = [];

  /** Holds every call until the returned function is called. */
  hold(): () => void {
    let release: () => void = () => undefined;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }

  /** Resolves when the next call starts. */
  nextCall(): Promise<void> {
    return new Promise((resolve) => this.callWaiters.push(resolve));
  }

  override async embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
    for (const resolve of this.callWaiters.splice(0)) resolve();
    if (this.gate) await this.gate;
    return super.embed(texts, purpose);
  }
}

// Chunks written here are labelled with the fake model, never with the real one.
const FAKE_MODEL = 'integration-fake-embedding';
const testConfig: AppConfig = {
  ...config,
  ai: { ...config.ai, embedding: { ...config.ai.embedding, model: FAKE_MODEL } },
};

const HANDBOOK = [
  '# Employee handbook',
  '',
  '## Leave',
  '',
  'Employees get 25 days of paid leave per year.',
  '',
  '## Travel',
  '',
  'Book economy class for flights under six hours.',
  '',
  '## Equipment',
  '',
  'Every engineer gets a laptop and one external monitor.',
  '',
  '## Security',
  '',
  'Report a lost laptop to the security team within one hour.',
  '',
  '## Expenses',
  '',
  'Submit receipts within 30 days of the purchase.',
].join('\n');

const HEADING_PATHS = ['Leave', 'Travel', 'Equipment', 'Security', 'Expenses'].map(
  (section) => `Employee handbook > ${section}`,
);

let app: NestExpressApplication;
let worker: IngestionWorker;
let model: GatedEmbeddingModel;
let user: TestUser;
let baseUrl: string;
let api: ApiClient;

beforeAll(async () => {
  model = new GatedEmbeddingModel(hashVector, {
    provider: 'fake',
    model: FAKE_MODEL,
    dimensions: FAKE_EMBEDDING_DIMENSIONS,
    documentPrefix: '',
    queryPrefix: '',
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(testConfig)] })
    .overrideProvider(EMBEDDING_MODEL)
    .useValue(model)
    .overrideProvider(IngestionQueue)
    .useClass(TestIngestionWorker)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn'] });
  configureApp(app, testConfig);
  await app.listen(0, '127.0.0.1');
  const queue = app.get(IngestionQueue);
  if (!(queue instanceof IngestionWorker)) throw new Error('the worker is not bound');
  worker = queue;

  user = await createTestUser('ingestion');
  const { port } = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
  api = new ApiClient(baseUrl, user.token);
});

afterAll(async () => {
  await app?.close();
  await deleteTestUsers(user);
});

/** Runs `action`, waits until the worker is idle and returns the outcomes of that time. */
async function outcomesOf(action: () => Promise<unknown>): Promise<IngestionOutcome[]> {
  const outcomes: IngestionOutcome[] = [];
  const unsubscribe = worker.onOutcome((outcome) => outcomes.push(outcome));
  try {
    await action();
    await worker.idle();
  } finally {
    unsubscribe();
  }
  return outcomes;
}

async function createDocument(title: string, content: string): Promise<Document> {
  const response = await api.post<Document>('/documents', { title, content, tags: ['test'] });
  expect(response.status).toBe(201);
  return response.body;
}

async function getDocument(id: string): Promise<Document> {
  const response = await api.get<Document>(`/documents/${id}`);
  expect(response.status).toBe(200);
  return response.body;
}

async function patchDocument(id: string, body: Record<string, unknown>): Promise<Document> {
  const response = await api.patch<Document>(`/documents/${id}`, body);
  expect(response.status).toBe(200);
  return response.body;
}

/** Every stored chunk row of a document, all generations, read past RLS. */
async function storedChunks(documentId: string) {
  const { data, error } = await adminClient()
    .from('document_chunks')
    .select('id, document_version, chunk_index, content, embedding_model')
    .eq('document_id', documentId)
    .order('chunk_index');
  if (error) throw error;
  return data;
}

describe('ingestion: one document through its life', () => {
  let doc: Document;

  beforeAll(async () => {
    const outcomes = await outcomesOf(async () => {
      doc = await createDocument('Employee handbook', HANDBOOK);
    });
    expect(outcomes).toMatchObject([
      { status: 'ready', documentId: doc.id, version: 1, chunks: 5, embedded: 5, reused: 0 },
    ]);
  });

  beforeEach(() => {
    model.calls.length = 0;
  });

  it('is ready, with one chunk per section and their heading paths', async () => {
    expect(doc.ingestion.status).toBe('pending'); // as returned by POST, before the worker ran
    const ready = await getDocument(doc.id);
    expect(ready.ingestion).toMatchObject({
      status: 'ready',
      error: null,
      chunkCount: 5,
      contentVersion: 1,
      ingestedAt: expect.any(String),
    });

    const response = await api.get<{ items: DocumentChunk[] }>(`/documents/${doc.id}/chunks`);
    expect(response.body.items.map((chunk) => [chunk.chunkIndex, chunk.headingPath])).toEqual(
      HEADING_PATHS.map((path, index) => [index, path]),
    );
    expect(response.body.items[0]?.content).toBe('Employees get 25 days of paid leave per year.');

    const rows = await storedChunks(doc.id);
    expect(
      rows.every((row) => row.document_version === 1 && row.embedding_model === FAKE_MODEL),
    ).toBe(true);
  });

  it('re-embeds only the edited paragraph and reuses the other vectors', async () => {
    const edited = HANDBOOK.replace('six hours', 'eight hours');
    const outcomes = await outcomesOf(() => patchDocument(doc.id, { content: edited }));

    expect(outcomes).toMatchObject([
      { status: 'ready', version: 2, chunks: 5, embedded: 1, reused: 4 },
    ]);
    expect(model.calls).toEqual([
      {
        texts: ['Employee handbook > Travel\n\nBook economy class for flights under eight hours.'],
        purpose: 'document',
      },
    ]);
    const rows = await storedChunks(doc.id);
    expect(rows).toHaveLength(5); // the previous generation is gone
    expect(rows.every((row) => row.document_version === 2)).toBe(true);
  });

  it('does nothing for a tags-only edit', async () => {
    const before = await storedChunks(doc.id);
    const outcomes = await outcomesOf(() => patchDocument(doc.id, { tags: ['hr', 'policy'] }));

    expect(outcomes).toEqual([]);
    expect(model.calls).toEqual([]);
    expect(await storedChunks(doc.id)).toEqual(before);
    expect((await getDocument(doc.id)).ingestion).toMatchObject({
      status: 'ready',
      contentVersion: 2,
    });
  });

  it('reindex writes a new generation without calling the model (same model, same text)', async () => {
    const outcomes = await outcomesOf(() => api.post(`/documents/${doc.id}/reindex`));
    expect(outcomes).toMatchObject([{ status: 'ready', version: 3, embedded: 0, reused: 5 }]);
    expect(model.calls).toEqual([]);
  });

  it('keeps only the latest version when two edits arrive while the first is embedding', async () => {
    const release = model.hold();
    const outcomes = await outcomesOf(async () => {
      const embedding = model.nextCall();
      await patchDocument(doc.id, { content: HANDBOOK.replace('25 days', '26 days') });
      await embedding; // the worker is now embedding version 4
      await patchDocument(doc.id, { content: HANDBOOK.replace('25 days', '27 days') });
      release();
    });

    // Version 4 was not applied; the same job read the document again and indexed 5.
    expect(outcomes.filter((outcome) => outcome.status === 'ready')).toMatchObject([
      { version: 5 },
    ]);
    expect(outcomes.some((outcome) => outcome.status === 'failed')).toBe(false);
    const rows = await storedChunks(doc.id);
    expect(rows.map((row) => row.document_version)).toEqual([5, 5, 5, 5, 5]);
    expect(rows[0]?.content).toBe('Employees get 27 days of paid leave per year.');
    expect((await getDocument(doc.id)).ingestion).toMatchObject({
      status: 'ready',
      contentVersion: 5,
    });
  });
});

describe('ingestion: failures and races', () => {
  it('survives a delete while the document is being embedded', async () => {
    const release = model.hold();
    let doc: Document | undefined;
    const outcomes = await outcomesOf(async () => {
      const embedding = model.nextCall();
      doc = await createDocument('Short-lived note', '# Note\n\nThis note is deleted mid-flight.');
      await embedding;
      const deleted = await api.delete(`/documents/${doc.id}`);
      expect(deleted.status).toBe(204);
      release();
    });

    expect(outcomes).toMatchObject([{ status: 'skipped', reason: 'deleted', documentId: doc?.id }]);
    expect(await storedChunks(doc?.id ?? '')).toEqual([]);

    // The worker is still healthy.
    const next = await outcomesOf(() => createDocument('After the delete', 'Still working.'));
    expect(next).toMatchObject([{ status: 'ready', chunks: 1 }]);
  });

  it('marks the document failed with a readable reason, and a reindex recovers it', async () => {
    model.error = new AiProviderError('unavailable', 'Could not reach fake: refused', 'ollama');
    let doc: Document | undefined;
    await outcomesOf(async () => {
      doc = await createDocument('Unlucky document', 'Written while the provider was down.');
    });
    model.error = null;
    const id = doc?.id ?? '';

    expect((await getDocument(id)).ingestion).toMatchObject({
      status: 'failed',
      error: `Embedding provider unreachable (ollama at ${testConfig.ai.embedding.baseUrl})`,
      chunkCount: 0,
    });

    const outcomes = await outcomesOf(() => api.post(`/documents/${id}/reindex`));
    expect(outcomes).toMatchObject([{ status: 'ready', chunks: 1, embedded: 1 }]);
    expect((await getDocument(id)).ingestion).toMatchObject({ status: 'ready', error: null });
  });
});

describe('ingestion: changing the embedding model (the reembed path)', () => {
  it('finds chunks made by another model, rebuilds them and embeds with the configured one', async () => {
    let doc: Document | undefined;
    await outcomesOf(async () => {
      doc = await createDocument('Old vectors', '## One\n\nFirst part.\n\n## Two\n\nSecond part.');
    });
    const id = doc?.id ?? '';
    // As if these vectors were made before EMBEDDING_MODEL changed.
    const { error } = await adminClient()
      .from('document_chunks')
      .update({ embedding_model: 'retired-embedding-model' })
      .eq('document_id', id);
    if (error) throw error;

    const repository = app.get(IngestionRepository);
    const { stale } = await repository.findReembedCandidates(FAKE_MODEL);
    expect(stale).toContainEqual({ id, contentVersion: 1 });

    const outcomes = await outcomesOf(async () => {
      expect(await repository.bumpVersion({ id, contentVersion: 1 })).toBe(true);
      worker.enqueue(id);
    });
    // Vectors of another model are never reused, even for unchanged text.
    expect(outcomes).toMatchObject([{ status: 'ready', version: 2, embedded: 2, reused: 0 }]);
    const rows = await storedChunks(id);
    expect(rows.map((row) => [row.document_version, row.embedding_model])).toEqual([
      [2, FAKE_MODEL],
      [2, FAKE_MODEL],
    ]);
    const after = await repository.findReembedCandidates(FAKE_MODEL);
    expect(after.stale.map((candidate) => candidate.id)).not.toContain(id);

    // A bump against an outdated version is refused (an edit got there first).
    expect(await repository.bumpVersion({ id, contentVersion: 1 })).toBe(false);
  });
});

describe('health', () => {
  it('?deep=1 embeds one query to prove the provider answers', async () => {
    model.calls.length = 0;
    const response = await new ApiClient(baseUrl).get<HealthResponse>('/health?deep=1');
    expect(response.body).toMatchObject({ status: 'ok', embedding: { reachable: true } });
    expect(model.calls).toEqual([{ texts: [expect.any(String)], purpose: 'query' }]);
  });
});
