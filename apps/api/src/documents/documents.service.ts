import { Injectable } from '@nestjs/common';
import type {
  CreateDocumentBody,
  Document,
  DocumentChunk,
  DocumentList,
  ListDocumentsQuery,
  TagCount,
  UpdateDocumentBody,
} from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { DatabaseError, NotFoundError } from '../common/errors/app-errors.js';
import type { TablesUpdate } from '../database.types.js';
import { IngestionQueue } from '../ingestion/ingestion-queue.js';
import { ilikeAnyFilter } from '../supabase/postgrest-filters.js';
import { type Db, SupabaseService } from '../supabase/supabase.service.js';
import {
  CHUNK_COLUMNS,
  DOCUMENT_COLUMNS,
  DOCUMENT_SUMMARY_COLUMNS,
  toDocument,
  toDocumentChunk,
  toDocumentSummary,
  toTagCount,
} from './documents.mapper.js';

// PostgREST answers 416 with this code when `offset` is past the last row.
const RANGE_NOT_SATISFIABLE = 'PGRST103';

const SEARCHABLE_COLUMNS = ['title', 'content'] as const;

/** The query builder methods the list filters need. */
interface Filterable<T> {
  contains(column: 'tags', value: string[]): T;
  or(filters: string): T;
}

/** The `tag` and `q` filters, shared by the page query and the count fallback. */
function applyListFilters<T extends Filterable<T>>(
  request: T,
  { tag, q }: Pick<ListDocumentsQuery, 'tag' | 'q'>,
): T {
  let filtered = request;
  if (tag) filtered = filtered.contains('tags', [tag]);
  if (q) filtered = filtered.or(ilikeAnyFilter(SEARCHABLE_COLUMNS, q));
  return filtered;
}

/**
 * Document use cases. Every read and write a user asks for runs through a client
 * scoped to that user (`forUser`), so Row Level Security, not this code, guarantees
 * ownership: another user's document simply does not exist here and becomes a 404.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ingestion: IngestionQueue,
  ) {}

  async list(user: AuthUser, query: ListDocumentsQuery): Promise<DocumentList> {
    const db = this.supabase.forUser(user.accessToken);
    const { data, count, error } = await applyListFilters(
      db.from('documents').select(DOCUMENT_SUMMARY_COLUMNS, { count: 'exact' }),
      query,
    )
      .order('updated_at', { ascending: false })
      .order('id') // stable pages when timestamps tie
      .range(query.offset, query.offset + query.limit - 1);
    if (error?.code === RANGE_NOT_SATISFIABLE) {
      return { items: [], total: await this.count(db, query) };
    }
    if (error) throw new DatabaseError('list documents', error);
    return { items: data.map(toDocumentSummary), total: count ?? data.length };
  }

  async create(user: AuthUser, body: CreateDocumentBody): Promise<Document> {
    const { data, error } = await this.supabase
      .forUser(user.accessToken)
      .from('documents')
      .insert({ title: body.title, content: body.content, tags: body.tags })
      .select(DOCUMENT_COLUMNS)
      .single();
    if (error) throw new DatabaseError('create document', error);
    this.ingestion.enqueue(data.id);
    return toDocument(data);
  }

  async get(user: AuthUser, id: string): Promise<Document> {
    const { data, error } = await this.supabase
      .forUser(user.accessToken)
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DatabaseError('read document', error);
    if (!data) throw NotFoundError.resource('Document');
    return toDocument(data);
  }

  /**
   * Re-ingests only when the title or content really changed. The database trigger
   * is the judge: it bumps `content_version` on such a change and leaves it alone for
   * tag edits or no-op writes, so comparing versions tells whether to enqueue.
   */
  async update(user: AuthUser, id: string, body: UpdateDocumentBody): Promise<Document> {
    const db = this.supabase.forUser(user.accessToken);
    const touchesText = body.title !== undefined || body.content !== undefined;
    const versionBefore = touchesText ? await this.contentVersion(db, id) : null;

    const changes: TablesUpdate<'documents'> = {};
    if (body.title !== undefined) changes.title = body.title;
    if (body.content !== undefined) changes.content = body.content;
    if (body.tags !== undefined) changes.tags = body.tags;

    const { data, error } = await db
      .from('documents')
      .update(changes)
      .eq('id', id)
      .select(DOCUMENT_COLUMNS)
      .maybeSingle();
    if (error) throw new DatabaseError('update document', error);
    if (!data) throw NotFoundError.resource('Document');

    if (versionBefore !== null && data.content_version !== versionBefore) {
      this.ingestion.enqueue(id);
    }
    return toDocument(data);
  }

  /** Chunks go with it (foreign key cascade). */
  async remove(user: AuthUser, id: string): Promise<void> {
    const { data, error } = await this.supabase
      .forUser(user.accessToken)
      .from('documents')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new DatabaseError('delete document', error);
    if (data.length === 0) throw NotFoundError.resource('Document');
  }

  /**
   * Forces re-embedding (e.g. after changing the embedding model). Users may not write
   * `content_version` or the ingestion state (column grants), so ownership is proven
   * with the user's client first and only then is the admin client used, filtered by
   * owner as a second lock.
   */
  async reindex(user: AuthUser, id: string): Promise<Document> {
    const versionBefore = await this.contentVersion(this.supabase.forUser(user.accessToken), id);

    const { data, error } = await this.supabase
      .admin()
      .from('documents')
      .update({
        content_version: versionBefore + 1,
        ingestion_status: 'pending',
        ingestion_error: null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      // Optimistic lock: if an edit bumped the version meanwhile, that edit already
      // queued ingestion and there is nothing to force.
      .eq('content_version', versionBefore)
      .select(DOCUMENT_COLUMNS)
      .maybeSingle();
    if (error) throw new DatabaseError('reindex document', error);

    this.ingestion.enqueue(id);
    return data ? toDocument(data) : this.get(user, id);
  }

  /** The chunks currently used for retrieval, in document order. */
  async listChunks(user: AuthUser, id: string): Promise<DocumentChunk[]> {
    const db = this.supabase.forUser(user.accessToken);
    await this.contentVersion(db, id); // 404 for a missing or foreign document

    const { data, error } = await db
      .from('document_chunks')
      .select(CHUNK_COLUMNS)
      .eq('document_id', id)
      .order('chunk_index');
    if (error) throw new DatabaseError('list chunks', error);
    return data.map(toDocumentChunk);
  }

  /** Tag facets over the caller's own documents, most used first. */
  async tagCounts(user: AuthUser): Promise<TagCount[]> {
    const { data, error } = await this.supabase
      .forUser(user.accessToken)
      .rpc('document_tag_counts');
    if (error) throw new DatabaseError('count tags', error);
    return data.map(toTagCount);
  }

  /** Current `content_version` of a document the caller can see; 404 otherwise. */
  private async contentVersion(db: Db, id: string): Promise<number> {
    const { data, error } = await db
      .from('documents')
      .select('content_version')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DatabaseError('read document version', error);
    if (!data) throw NotFoundError.resource('Document');
    return data.content_version;
  }

  private async count(db: Db, query: ListDocumentsQuery): Promise<number> {
    const { count, error } = await applyListFilters(
      db.from('documents').select('id', { count: 'exact', head: true }),
      query,
    );
    if (error) throw new DatabaseError('count documents', error);
    return count ?? 0;
  }
}
