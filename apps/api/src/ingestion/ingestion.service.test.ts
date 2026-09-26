import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AiProviderError,
  type EmbeddingDescriptor,
  type EmbeddingModel,
  type EmbeddingPurpose,
} from '@repo/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL } from '../ai/ai.module.js';
import { DatabaseError } from '../common/errors/app-errors.js';
import { loadAppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import {
  type ChunkWrite,
  type IngestionDocument,
  IngestionRepository,
  type ReplaceChunksResult,
} from './ingestion.repository.js';
import { IngestionService, MAX_ATTEMPTS } from './ingestion.service.js';

const config = loadAppConfig({
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  EMBEDDING_PROVIDER: 'ollama',
  EMBEDDING_MODEL: 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: '768',
  EMBEDDING_DOCUMENT_PREFIX: 'search_document: ',
  EMBEDDING_QUERY_PREFIX: 'search_query: ',
});

const DOC_ID = '0b3f6f0e-2a55-4b5e-9d1a-6f2d8c1e7a10';

const HANDBOOK = [
  '# Handbook',
  '',
  '## Leave',
  '',
  'Employees get 25 days of paid leave.',
  '',
  '## Travel',
  '',
  'Book economy for flights under six hours.',
  '',
  '## Equipment',
  '',
  'Every engineer gets a laptop and a monitor.',
].join('\n');

/** Mirrors replace_document_chunks: latest version wins, null embeddings reuse stored vectors. */
class FakeRepository {
  document: IngestionDocument | null = {
    id: DOC_ID,
    title: 'Handbook',
    content: HANDBOOK,
    content_version: 1,
    ingestion_status: 'pending',
  };
  storedHashSet = new Set<string>();
  readonly processing: number[] = [];
  readonly replaced: { version: number; model: string; chunks: ChunkWrite[] }[] = [];
  readonly failed: { version: number; message: string }[] = [];
  failReplaceWith: Error | null = null;
  failFindWith: Error | null = null;
  failMarkFailedWith: Error | null = null;

  unfinished: string[] = [];

  findUnfinished(): Promise<string[]> {
    if (this.failFindWith) return Promise.reject(this.failFindWith);
    return Promise.resolve(this.unfinished);
  }

  findDocument(): Promise<IngestionDocument | null> {
    if (this.failFindWith) return Promise.reject(this.failFindWith);
    return Promise.resolve(this.document && { ...this.document });
  }

  markProcessing(_id: string, version: number): Promise<void> {
    this.processing.push(version);
    if (this.document?.content_version === version) this.document.ingestion_status = 'processing';
    return Promise.resolve();
  }

  storedHashes(): Promise<Set<string>> {
    return Promise.resolve(new Set(this.storedHashSet));
  }

  replaceChunks(
    _id: string,
    version: number,
    model: string,
    chunks: ChunkWrite[],
  ): Promise<ReplaceChunksResult> {
    this.replaced.push({ version, model, chunks });
    if (this.failReplaceWith) return Promise.reject(this.failReplaceWith);
    if (!this.document || this.document.content_version !== version) {
      return Promise.resolve({ applied: false, inserted: 0, reused: 0 });
    }
    this.storedHashSet = new Set(chunks.map((chunk) => chunk.content_hash));
    this.document.ingestion_status = 'ready';
    const reused = chunks.filter((chunk) => chunk.embedding === null).length;
    return Promise.resolve({ applied: true, inserted: chunks.length - reused, reused });
  }

  markFailed(_id: string, version: number, message: string): Promise<void> {
    if (this.failMarkFailedWith) return Promise.reject(this.failMarkFailedWith);
    this.failed.push({ version, message });
    return Promise.resolve();
  }

  /** What an edit through the API does: new text, version bump, back to pending. */
  edit(changes: Partial<Pick<IngestionDocument, 'title' | 'content'>>): void {
    if (!this.document) throw new Error('no document to edit');
    this.document = {
      ...this.document,
      ...changes,
      content_version: this.document.content_version + 1,
      ingestion_status: 'pending',
    };
  }
}

class FakeEmbeddingModel implements EmbeddingModel {
  readonly info: EmbeddingDescriptor = {
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 3,
    documentPrefix: 'search_document: ',
    queryPrefix: 'search_query: ',
  };
  readonly calls: { texts: string[]; purpose: EmbeddingPurpose }[] = [];
  /** Runs during each call, e.g. to simulate an edit made while embedding. */
  duringCall: (() => void) | null = null;
  failWith: Error | null = null;

  embed(texts: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
    this.calls.push({ texts, purpose });
    this.duringCall?.();
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(texts.map((text) => [text.length, 0, 1]));
  }
}

let repository: FakeRepository;
let model: FakeEmbeddingModel;
let service: IngestionService;

beforeEach(async () => {
  repository = new FakeRepository();
  model = new FakeEmbeddingModel();
  const moduleRef = await Test.createTestingModule({
    providers: [
      IngestionService,
      { provide: IngestionRepository, useValue: repository },
      { provide: EMBEDDING_MODEL, useValue: model },
      { provide: APP_CONFIG, useValue: config },
    ],
  }).compile();
  service = moduleRef.get(IngestionService);
  // compile() installs a logger that prints errors; several tests provoke them on purpose.
  Logger.overrideLogger(false);
});

describe('IngestionService: a new document', () => {
  it('chunks by heading, embeds every chunk in one call and stores the generation', async () => {
    const outcome = await service.ingest(DOC_ID);

    expect(outcome).toMatchObject({
      status: 'ready',
      documentId: DOC_ID,
      version: 1,
      chunks: 3,
      embedded: 3,
      reused: 0,
    });
    expect(repository.processing).toEqual([1]);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]?.purpose).toBe('document');
    // The chunk header travels with the text; the document title is not repeated.
    expect(model.calls[0]?.texts[0]).toBe(
      'Handbook > Leave\n\nEmployees get 25 days of paid leave.',
    );

    const [write] = repository.replaced;
    expect(write?.version).toBe(1);
    expect(write?.model).toBe('nomic-embed-text');
    expect(write?.chunks.map((chunk) => [chunk.chunk_index, chunk.heading_path])).toEqual([
      [0, 'Handbook > Leave'],
      [1, 'Handbook > Travel'],
      [2, 'Handbook > Equipment'],
    ]);
    expect(write?.chunks.every((chunk) => /^[0-9a-f]{64}$/.test(chunk.content_hash))).toBe(true);
    expect(write?.chunks.every((chunk) => Array.isArray(chunk.embedding))).toBe(true);
    expect(write?.chunks[0]?.token_estimate).toBeGreaterThan(0);
  });

  it('writes an empty generation for a document with no body text, without calling the model', async () => {
    repository.edit({ content: '# Only a heading' });
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'ready', chunks: 0, embedded: 0 });
    expect(model.calls).toHaveLength(0);
    expect(repository.replaced[0]?.chunks).toEqual([]);
  });

  it('embeds identical chunks once', async () => {
    repository.edit({ content: '## FAQ\n\nAsk in #help.\n\n## FAQ\n\nAsk in #help.' });
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'ready', chunks: 2, embedded: 1 });
    expect(model.calls[0]?.texts).toHaveLength(1);
  });
});

describe('IngestionService: incremental re-embedding', () => {
  beforeEach(async () => {
    await service.ingest(DOC_ID);
    model.calls.length = 0;
  });

  it('embeds only the chunk whose text changed and reuses the others', async () => {
    repository.edit({ content: HANDBOOK.replace('six hours', 'eight hours') });
    const outcome = await service.ingest(DOC_ID);

    expect(outcome).toMatchObject({
      status: 'ready',
      version: 2,
      chunks: 3,
      embedded: 1,
      reused: 2,
    });
    expect(model.calls).toEqual([
      {
        texts: ['Handbook > Travel\n\nBook economy for flights under eight hours.'],
        purpose: 'document',
      },
    ]);
    const embeddings = repository.replaced[1]?.chunks.map((chunk) => chunk.embedding !== null);
    expect(embeddings).toEqual([false, true, false]);
  });

  it('re-embeds everything when the title changes (the header is part of every hash)', async () => {
    repository.edit({ title: 'Staff handbook' });
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'ready', embedded: 3, reused: 0 });
  });

  it('skips a document whose current version is already indexed', async () => {
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'up_to_date' });
    expect(model.calls).toHaveLength(0);
    expect(repository.replaced).toHaveLength(1);
  });
});

describe('IngestionService: concurrent changes', () => {
  it('skips a deleted document quietly', async () => {
    repository.document = null;
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'deleted' });
    expect(model.calls).toHaveLength(0);
    expect(repository.failed).toEqual([]);
  });

  it('reads the document again when it was edited while embedding, and indexes the latest version', async () => {
    model.duringCall = () => {
      model.duringCall = null;
      repository.edit({ content: HANDBOOK.replace('25 days', '30 days') });
    };
    const outcome = await service.ingest(DOC_ID);

    expect(outcome).toMatchObject({ status: 'ready', version: 2 });
    expect(repository.replaced.map((call) => call.version)).toEqual([1, 2]);
    expect(repository.processing).toEqual([1, 2]);
  });

  it('ends as deleted when the document is deleted while embedding', async () => {
    model.duringCall = () => {
      repository.document = null;
    };
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'deleted' });
    expect(repository.failed).toEqual([]);
  });

  it(`gives up after ${MAX_ATTEMPTS} attempts when the document keeps changing`, async () => {
    model.duringCall = () => repository.edit({ content: `${HANDBOOK}\n\nEdit ${Date.now()}.` });
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'superseded' });
    expect(repository.replaced).toHaveLength(MAX_ATTEMPTS);
    expect(repository.failed).toEqual([]);
  });
});

describe('IngestionService: failures', () => {
  it('marks the version failed with a short reason when the provider is unreachable, and does not throw', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error');
    model.failWith = new AiProviderError(
      'unavailable',
      'Could not reach ollama: Connection error.',
      'ollama',
    );

    const outcome = await service.ingest(DOC_ID);

    const message = 'Embedding provider unreachable (ollama at http://127.0.0.1:11434/v1)';
    expect(outcome).toMatchObject({ status: 'failed', version: 1, error: message });
    expect(repository.failed).toEqual([{ version: 1, message }]);
    expect(repository.replaced).toHaveLength(0);
    // The log carries the provider's own words; the user sees the short reason.
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('Could not reach ollama: Connection error.'),
      undefined,
    );
    logError.mockRestore();
  });

  it('reports a database failure without its SQL details', async () => {
    repository.failReplaceWith = new DatabaseError('replace document chunks', {
      message: 'violates check constraint',
    });
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({
      status: 'failed',
      error: 'Could not save the chunks (database error)',
    });
    expect(repository.failed).toHaveLength(1);
  });

  it('still returns an outcome when recording the failure fails too', async () => {
    model.failWith = new AiProviderError('timeout', 'ollama did not respond in time.', 'ollama');
    repository.failMarkFailedWith = new DatabaseError('mark document failed', new Error('down'));
    await expect(service.ingest(DOC_ID)).resolves.toMatchObject({ status: 'failed', version: 1 });
  });

  it('fails without a version, and marks nothing, when the document cannot be read', async () => {
    repository.failFindWith = new DatabaseError('read document for ingestion', new Error('down'));
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({ status: 'failed', version: null });
    expect(repository.failed).toEqual([]);
  });

  it('rejects a model that returns fewer vectors than texts', async () => {
    vi.spyOn(model, 'embed').mockResolvedValue([[1, 2, 3]]);
    const outcome = await service.ingest(DOC_ID);
    expect(outcome).toMatchObject({
      status: 'failed',
      error: 'Embedding provider returned an unexpected response (ollama, nomic-embed-text)',
    });
  });
});

describe('IngestionService.findUnfinished', () => {
  it('lists the documents a stopped process left behind', async () => {
    repository.unfinished = ['a', 'b'];
    await expect(service.findUnfinished()).resolves.toEqual(['a', 'b']);
  });

  it('returns an empty list instead of throwing when the database is unreachable', async () => {
    repository.failFindWith = new DatabaseError('find unfinished documents', new Error('down'));
    await expect(service.findUnfinished()).resolves.toEqual([]);
  });
});
