import { type EmbeddingModel } from '@repo/ai';
import {
  buildEmbeddingText,
  type Chunker,
  type ChunkerOptions,
  hashChunk,
  type TextChunk,
} from '@repo/rag';
import { type CorpusDocument } from './corpus.js';
import { type Json } from './database.js';
import { type Db } from './users.js';

export interface IndexOptions {
  /** Secret-key client: writes the eval user's documents and chunks like the ingestion worker. */
  admin: Db;
  userId: string;
  corpus: readonly CorpusDocument[];
  chunker: Chunker;
  chunkerOptions: ChunkerOptions;
  embedder: EmbeddingModel;
  /** Value of document_chunks.embedding_model (see embeddingModelKey). */
  modelKey: string;
}

export interface IndexStats {
  documents: number;
  chunks: number;
  /** Vectors computed by the embedding model in this run (0 when everything was reused). */
  embedded: number;
  /** Chunks whose vector was already stored under the same hash. */
  reused: number;
  /** Documents whose chunks were rewritten (new content, chunker, or embedding settings). */
  rewritten: number;
}

export interface IndexedCorpus {
  /** This user's stored document ids, mapped to corpus file names. */
  fileByDocumentId: Map<string, string>;
  stats: IndexStats;
}

interface StoredDocument {
  id: string;
  contentVersion: number;
}

interface PlannedChunk extends TextChunk {
  hash: string;
  embeddingText: string;
}

interface StoredChunk {
  chunk_index: number;
  content_hash: string;
  document_version: number;
}

/**
 * Makes the user's copy of the corpus match the files and the chunker, doing only the
 * work that changed: an unchanged document is skipped, and a chunk whose hash is already
 * stored keeps its vector, so a second run calls the embedding model zero times.
 */
export async function indexCorpus(options: IndexOptions): Promise<IndexedCorpus> {
  const stored = await syncDocuments(options.admin, options.userId, options.corpus);
  const stats: IndexStats = { documents: 0, chunks: 0, embedded: 0, reused: 0, rewritten: 0 };
  const fileByDocumentId = new Map<string, string>();

  for (const doc of options.corpus) {
    const target = stored.get(doc.file);
    if (!target) throw new Error(`${doc.file} was not stored for the eval user.`);
    const result = await syncChunks(options, doc, target);
    fileByDocumentId.set(target.id, doc.file);
    stats.documents += 1;
    stats.chunks += result.chunks;
    stats.embedded += result.embedded;
    stats.reused += result.reused;
    if (result.rewritten) stats.rewritten += 1;
  }
  return { fileByDocumentId, stats };
}

/**
 * One stored document per corpus file, matched by title: missing ones are inserted,
 * changed ones updated (the documents trigger bumps content_version), and documents
 * that are no longer in the corpus, or duplicates, are deleted.
 */
async function syncDocuments(
  admin: Db,
  userId: string,
  corpus: readonly CorpusDocument[],
): Promise<Map<string, StoredDocument>> {
  const { data: rows, error } = await admin
    .from('documents')
    .select('id, title, content, content_version')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw failure('read the eval documents', error);

  const byTitle = new Map(corpus.map((doc) => [doc.title, doc]));
  const stored = new Map<string, StoredDocument>();
  const stale: string[] = [];

  for (const row of rows) {
    const doc = byTitle.get(row.title);
    if (!doc || stored.has(doc.file)) {
      stale.push(row.id);
      continue;
    }
    if (row.content === doc.content) {
      stored.set(doc.file, { id: row.id, contentVersion: row.content_version });
      continue;
    }
    const { data, error: updateError } = await admin
      .from('documents')
      .update({ content: doc.content })
      .eq('id', row.id)
      .select('content_version')
      .single();
    if (updateError) throw failure(`update ${doc.file}`, updateError);
    stored.set(doc.file, { id: row.id, contentVersion: data.content_version });
  }

  if (stale.length > 0) {
    const { error: deleteError } = await admin.from('documents').delete().in('id', stale);
    if (deleteError) throw failure('delete stale eval documents', deleteError);
  }

  for (const doc of corpus) {
    if (stored.has(doc.file)) continue;
    const { data, error: insertError } = await admin
      .from('documents')
      .insert({ user_id: userId, title: doc.title, content: doc.content, tags: ['eval'] })
      .select('id, content_version')
      .single();
    if (insertError) throw failure(`insert ${doc.file}`, insertError);
    stored.set(doc.file, { id: data.id, contentVersion: data.content_version });
  }
  return stored;
}

async function syncChunks(
  options: IndexOptions,
  doc: CorpusDocument,
  target: StoredDocument,
): Promise<{ chunks: number; embedded: number; reused: number; rewritten: boolean }> {
  const { admin, embedder, modelKey } = options;
  const planned = planChunks(doc, options);

  const { data: storedChunks, error } = await admin
    .from('document_chunks')
    .select('chunk_index, content_hash, document_version')
    .eq('document_id', target.id)
    .order('chunk_index');
  if (error) throw failure(`read the chunks of ${doc.file}`, error);

  if (isUpToDate(planned, storedChunks, target.contentVersion)) {
    return { chunks: planned.length, embedded: 0, reused: planned.length, rewritten: false };
  }

  // Embed each new hash once; chunks whose hash is stored reuse that vector in the database.
  const storedHashes = new Set(storedChunks.map((chunk) => chunk.content_hash));
  const missing = new Map<string, string>();
  for (const chunk of planned) {
    if (!storedHashes.has(chunk.hash)) missing.set(chunk.hash, chunk.embeddingText);
  }
  const vectors = missing.size > 0 ? await embedder.embed([...missing.values()], 'document') : [];
  const vectorByHash = new Map([...missing.keys()].map((hash, index) => [hash, vectors[index]]));

  // replace_document_chunks writes only the document's current content_version and treats
  // a version that already has chunks as done, so re-chunking unchanged content (a new
  // chunker or embedding model) needs a new version number first.
  const hasChunksAtCurrentVersion = storedChunks.some(
    (chunk) => chunk.document_version === target.contentVersion,
  );
  const version = hasChunksAtCurrentVersion
    ? await bumpContentVersion(admin, target, doc.file)
    : target.contentVersion;

  const payload: Json = planned.map((chunk) => ({
    chunk_index: chunk.index,
    heading_path: chunk.headingPath,
    content: chunk.content,
    token_estimate: chunk.tokenEstimate,
    content_hash: chunk.hash,
    // null tells the function to reuse the stored vector with the same hash.
    embedding: vectorByHash.get(chunk.hash) ?? null,
  }));
  const { data, error: writeError } = await admin.rpc('replace_document_chunks', {
    p_document_id: target.id,
    p_content_version: version,
    p_embedding_model: modelKey,
    p_chunks: payload,
  });
  if (writeError) throw failure(`write the chunks of ${doc.file}`, writeError);
  if (!data[0]?.applied) {
    throw new Error(
      `The chunks of ${doc.file} were not applied: the document changed during the run.`,
    );
  }
  const reused = planned.filter((chunk) => storedHashes.has(chunk.hash)).length;
  return { chunks: planned.length, embedded: missing.size, reused, rewritten: true };
}

/** Chunks and hashes exactly as ingestion computes them, so the two share one hash space. */
function planChunks(doc: CorpusDocument, options: IndexOptions): PlannedChunk[] {
  const { info } = options.embedder;
  return options.chunker(doc, options.chunkerOptions).map((chunk) => {
    const embeddingText = buildEmbeddingText(doc.title, chunk.headingPath, chunk.content);
    const hash = hashChunk({
      embeddingModel: options.modelKey,
      dimensions: info.dimensions,
      prefix: info.documentPrefix,
      embeddingText,
    });
    return { ...chunk, hash, embeddingText };
  });
}

function isUpToDate(
  planned: readonly PlannedChunk[],
  stored: readonly StoredChunk[],
  contentVersion: number,
): boolean {
  return (
    stored.length === planned.length &&
    stored.every(
      (chunk, index) =>
        chunk.document_version === contentVersion &&
        chunk.chunk_index === planned[index]?.index &&
        chunk.content_hash === planned[index]?.hash,
    )
  );
}

async function bumpContentVersion(
  admin: Db,
  target: StoredDocument,
  file: string,
): Promise<number> {
  const { data, error } = await admin
    .from('documents')
    .update({ content_version: target.contentVersion + 1 })
    .eq('id', target.id)
    .eq('content_version', target.contentVersion)
    .select('content_version')
    .single();
  if (error) throw failure(`move ${file} to a new content version`, error);
  return data.content_version;
}

function failure(action: string, error: { message: string }): Error {
  return new Error(`Cannot ${action}: ${error.message}`);
}
