import { Injectable } from '@nestjs/common';
import { DatabaseError } from '../common/errors/app-errors.js';
import type { Tables } from '../database.types.js';
import { SupabaseService } from '../supabase/supabase.service.js';

/** What a job needs from the document row. */
export type IngestionDocument = Pick<
  Tables<'documents'>,
  'id' | 'title' | 'content' | 'content_version' | 'ingestion_status'
>;

/**
 * One chunk of the new generation, as `replace_document_chunks` expects it.
 * `embedding: null` tells the function to reuse the stored vector with the same hash.
 * (A type alias, not an interface: it must be assignable to the generated `Json` type.)
 */
export type ChunkWrite = {
  chunk_index: number;
  heading_path: string;
  content: string;
  token_estimate: number;
  content_hash: string;
  embedding: number[] | null;
};

export interface ReplaceChunksResult {
  /** False when the document was edited or deleted since it was read: nothing was written. */
  applied: boolean;
  inserted: number;
  reused: number;
}

/** A document whose chunks must be rebuilt, with the version it was found at. */
export interface DocumentVersion {
  id: string;
  contentVersion: number;
}

// Postgres not_null_violation: a vector marked for reuse was not found at write time.
const NOT_NULL_VIOLATION = '23502';

const UNFINISHED_STATUSES = ['pending', 'processing'] as const;

/**
 * The ingestion worker's queries. All of them use the admin client: the worker acts for
 * every user, and writes columns and a function no user is granted (ingestion state,
 * `content_version`, `replace_document_chunks`). Nothing here is reachable from a request.
 */
@Injectable()
export class IngestionRepository {
  constructor(private readonly supabase: SupabaseService) {}

  /** The latest row, or null once the document is deleted. */
  async findDocument(id: string): Promise<IngestionDocument | null> {
    const { data, error } = await this.supabase
      .admin()
      .from('documents')
      .select('id, title, content, content_version, ingestion_status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DatabaseError('read document for ingestion', error);
    return data;
  }

  /** Only for the version being processed: a newer edit keeps its own `pending` status. */
  async markProcessing(id: string, version: number): Promise<void> {
    const { error } = await this.supabase
      .admin()
      .from('documents')
      .update({ ingestion_status: 'processing', ingestion_error: null })
      .eq('id', id)
      .eq('content_version', version);
    if (error) throw new DatabaseError('mark document processing', error);
  }

  /** Hashes of the vectors already stored for this document by this embedding model. */
  async storedHashes(documentId: string, embeddingModel: string): Promise<Set<string>> {
    const { data, error } = await this.supabase
      .admin()
      .from('document_chunks')
      .select('content_hash')
      .eq('document_id', documentId)
      .eq('embedding_model', embeddingModel);
    if (error) throw new DatabaseError('read stored chunk hashes', error);
    return new Set(data.map((row) => row.content_hash));
  }

  /** Swaps the document's chunks for this generation in one transaction (latest version wins). */
  async replaceChunks(
    documentId: string,
    version: number,
    embeddingModel: string,
    chunks: ChunkWrite[],
  ): Promise<ReplaceChunksResult> {
    const { data, error } = await this.supabase.admin().rpc('replace_document_chunks', {
      p_document_id: documentId,
      p_content_version: version,
      p_embedding_model: embeddingModel,
      p_chunks: chunks,
    });
    // Another process (the API and a CLI, say) replaced this document's chunks after the
    // hashes were read, so a vector marked for reuse is gone. Nothing was written; the
    // caller reads the document again and embeds what is missing.
    if (error?.code === NOT_NULL_VIOLATION) return { applied: false, inserted: 0, reused: 0 };
    if (error) throw new DatabaseError('replace document chunks', error);
    return data[0] ?? { applied: false, inserted: 0, reused: 0 };
  }

  /** Records a failure for this version only; the message is shown to the user. */
  async markFailed(id: string, version: number, message: string): Promise<void> {
    const { error } = await this.supabase
      .admin()
      .from('documents')
      .update({ ingestion_status: 'failed', ingestion_error: message })
      .eq('id', id)
      .eq('content_version', version);
    if (error) throw new DatabaseError('mark document failed', error);
  }

  /** Documents a stopped process left behind (queued or mid-job), oldest edit first. */
  async findUnfinished(): Promise<string[]> {
    const { data, error } = await this.supabase
      .admin()
      .from('documents')
      .select('id')
      .in('ingestion_status', UNFINISHED_STATUSES)
      .order('updated_at');
    if (error) throw new DatabaseError('find unfinished documents', error);
    return data.map((row) => row.id);
  }

  /**
   * Documents to rebuild after an embedding model change: those with chunks made by
   * another model, plus those whose last ingestion failed.
   */
  async findReembedCandidates(
    embeddingModel: string,
  ): Promise<{ stale: DocumentVersion[]; failed: DocumentVersion[] }> {
    const admin = this.supabase.admin();
    const [staleResult, failedResult] = await Promise.all([
      admin
        .from('documents')
        .select('id, content_version, document_chunks!inner(embedding_model)')
        .neq('document_chunks.embedding_model', embeddingModel),
      admin.from('documents').select('id, content_version').eq('ingestion_status', 'failed'),
    ]);
    if (staleResult.error) throw new DatabaseError('find stale documents', staleResult.error);
    if (failedResult.error) throw new DatabaseError('find failed documents', failedResult.error);
    const toVersion = (row: { id: string; content_version: number }): DocumentVersion => ({
      id: row.id,
      contentVersion: row.content_version,
    });
    return { stale: staleResult.data.map(toVersion), failed: failedResult.data.map(toVersion) };
  }

  /**
   * Forces a rebuild: a new version gets a new chunk generation, even when the text is
   * unchanged (`replace_document_chunks` treats an already written version as done).
   * Returns false when an edit bumped the version first; that edit already needs ingestion.
   */
  async bumpVersion(document: DocumentVersion): Promise<boolean> {
    const { data, error } = await this.supabase
      .admin()
      .from('documents')
      .update({
        content_version: document.contentVersion + 1,
        ingestion_status: 'pending',
        ingestion_error: null,
      })
      .eq('id', document.id)
      .eq('content_version', document.contentVersion)
      .select('id');
    if (error) throw new DatabaseError('bump document version', error);
    return data.length > 0;
  }
}
