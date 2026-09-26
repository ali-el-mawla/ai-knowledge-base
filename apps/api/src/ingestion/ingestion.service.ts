import { Injectable, Logger } from '@nestjs/common';
import { AiProviderError, type EmbeddingModel } from '@repo/ai';
import { buildEmbeddingText, chunkMarkdown, hashChunk, type TextChunk } from '@repo/rag';
import { InjectEmbeddingModel } from '../ai/ai.module.js';
import { embeddingModelKey } from '../ai/embedding-model-key.js';
import { DatabaseError } from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import { ingestionErrorMessage } from './ingestion-error-message.js';
import {
  type ChunkWrite,
  type IngestionDocument,
  IngestionRepository,
} from './ingestion.repository.js';

/**
 * How many times one job reads a document again after it changed under it. Each
 * user edit also queues the document, so giving up here never loses the latest edit.
 */
export const MAX_ATTEMPTS = 3;

interface OutcomeBase {
  documentId: string;
  durationMs: number;
}

export type IngestionOutcome =
  | (OutcomeBase & {
      status: 'ready';
      version: number;
      chunks: number;
      /** Texts sent to the embedding model (new or changed chunks). */
      embedded: number;
      /** Chunks whose stored vector was reused. */
      reused: number;
    })
  | (OutcomeBase & {
      status: 'skipped';
      /** deleted: gone before or during the job. up_to_date: this version is already indexed.
       *  superseded: kept changing; the job queued by its latest edit takes over. */
      reason: 'deleted' | 'up_to_date' | 'superseded';
    })
  | (OutcomeBase & {
      status: 'failed';
      /** The version marked failed, or null when the document could not even be read. */
      version: number | null;
      /** The user-safe message stored in `ingestion_error`. */
      error: string;
    });

interface PreparedChunk extends TextChunk {
  embeddingText: string;
  contentHash: string;
}

interface GenerationStats {
  chunks: number;
  embedded: number;
  reused: number;
}

/**
 * Chunk, embed and store one document: the RAG indexing pipeline. Only chunks whose
 * hash (model, dimensions, prefix, header, text) is new are embedded; everything else
 * reuses its stored vector, so editing one paragraph costs one embedding.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger('Ingestion');
  private readonly modelKey: string;

  constructor(
    private readonly repository: IngestionRepository,
    @InjectEmbeddingModel() private readonly embeddingModel: EmbeddingModel,
    @InjectConfig() private readonly config: AppConfig,
  ) {
    this.modelKey = embeddingModelKey(config.ai.embedding);
  }

  /**
   * Brings a document's chunks up to date with its latest version. Never throws: a
   * failure is recorded on the document (`failed` plus a short reason) and returned.
   */
  async ingest(documentId: string): Promise<IngestionOutcome> {
    const startedAt = performance.now();
    const elapsed = (): number => Math.round(performance.now() - startedAt);
    let version: number | null = null;

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const document = await this.repository.findDocument(documentId);
        if (!document) {
          return { status: 'skipped', reason: 'deleted', documentId, durationMs: elapsed() };
        }
        // Every title or content change sets the status back to pending (database
        // trigger), so `ready` means this exact version is already indexed.
        if (document.ingestion_status === 'ready') {
          return { status: 'skipped', reason: 'up_to_date', documentId, durationMs: elapsed() };
        }

        version = document.content_version;
        const stats = await this.writeGeneration(document);
        if (stats) {
          const durationMs = elapsed();
          this.logger.log(
            `ingested ${documentId} v${version}: ${stats.chunks} chunks, embedded ${stats.embedded}, ` +
              `reused ${stats.reused} in ${durationMs} ms`,
          );
          return { status: 'ready', documentId, version, ...stats, durationMs };
        }
        // Not applied: the document was edited or deleted while this job embedded it.
      }
      this.logger.warn(`${documentId} kept changing during ingestion; its latest edit is queued`);
      return { status: 'skipped', reason: 'superseded', documentId, durationMs: elapsed() };
    } catch (error) {
      return this.fail(documentId, version, error, elapsed());
    }
  }

  /** Documents a stopped process left `pending` or `processing`; empty if that cannot be read. */
  async findUnfinished(): Promise<string[]> {
    try {
      return await this.repository.findUnfinished();
    } catch (error) {
      this.logger.warn(`Could not look for unfinished documents: ${describeError(error)}`);
      return [];
    }
  }

  /** Writes one chunk generation; null when the document changed first (nothing written). */
  private async writeGeneration(document: IngestionDocument): Promise<GenerationStats | null> {
    const { id, content_version: version } = document;
    await this.repository.markProcessing(id, version);

    const chunks = this.prepareChunks(document);
    const stored = await this.repository.storedHashes(id, this.modelKey);
    // Keyed by hash: identical new chunks (repeated boilerplate) are embedded once.
    const missing = new Map<string, string>();
    for (const chunk of chunks) {
      if (!stored.has(chunk.contentHash)) missing.set(chunk.contentHash, chunk.embeddingText);
    }
    const vectorByHash = await this.embed(missing);

    const writes = chunks.map((chunk): ChunkWrite => ({
      chunk_index: chunk.index,
      heading_path: chunk.headingPath,
      content: chunk.content,
      token_estimate: chunk.tokenEstimate,
      content_hash: chunk.contentHash,
      embedding: vectorByHash.get(chunk.contentHash) ?? null,
    }));
    const result = await this.repository.replaceChunks(id, version, this.modelKey, writes);
    if (!result.applied) return null;
    return { chunks: chunks.length, embedded: missing.size, reused: result.reused };
  }

  private prepareChunks({ title, content }: IngestionDocument): PreparedChunk[] {
    const { dimensions, documentPrefix } = this.config.ai.embedding;
    return chunkMarkdown({ title, content }).map((chunk) => {
      const embeddingText = buildEmbeddingText(title, chunk.headingPath, chunk.content);
      const contentHash = hashChunk({
        embeddingModel: this.modelKey,
        dimensions,
        prefix: documentPrefix,
        embeddingText,
      });
      return { ...chunk, embeddingText, contentHash };
    });
  }

  /** One call for all missing texts; the model splits it into provider-sized batches. */
  private async embed(textByHash: Map<string, string>): Promise<Map<string, number[]>> {
    if (textByHash.size === 0) return new Map();
    const entries = [...textByHash];
    const vectors = await this.embeddingModel.embed(
      entries.map(([, text]) => text),
      'document',
    );
    const vectorByHash = new Map<string, number[]>();
    for (const [index, [hash]] of entries.entries()) {
      const vector = vectors[index];
      if (!vector) {
        throw new AiProviderError(
          'invalid_response',
          `expected ${entries.length} embeddings, got ${vectors.length}`,
          this.embeddingModel.info.provider,
        );
      }
      vectorByHash.set(hash, vector);
    }
    return vectorByHash;
  }

  private async fail(
    documentId: string,
    version: number | null,
    error: unknown,
    durationMs: number,
  ): Promise<IngestionOutcome> {
    const message = ingestionErrorMessage(error, this.config.ai.embedding);
    const expected = error instanceof AiProviderError || error instanceof DatabaseError;
    this.logger.error(
      `ingestion of ${documentId}${version === null ? '' : ` v${version}`} failed: ${describeError(error)}`,
      // Provider and database failures are explained by their message; a stack helps only for bugs.
      expected || !(error instanceof Error) ? undefined : error.stack,
    );
    if (version !== null) {
      try {
        await this.repository.markFailed(documentId, version, message);
      } catch (markError) {
        this.logger.error(
          `could not record the failure of ${documentId}: ${describeError(markError)}`,
        );
      }
    }
    return { status: 'failed', documentId, version, error: message, durationMs };
  }
}

/** The message plus its cause's (PostgREST and provider errors travel as `cause`). */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const { cause } = error;
  const causeMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'object' && cause !== null && 'message' in cause
        ? String(cause.message)
        : '';
  return causeMessage && causeMessage !== error.message
    ? `${error.message}: ${causeMessage}`
    : error.message;
}
