import type {
  Document,
  DocumentChunk,
  DocumentIngestion,
  DocumentSummary,
  TagCount,
} from '@repo/shared';
import type { Tables } from '../database.types.js';

/**
 * Row shapes and their mapping to the shared DTOs (snake_case rows in, camelCase
 * contracts out). The select lists live next to the row types they produce, so the
 * two cannot drift apart. `user_id` is never selected: ownership is implied by RLS.
 */
const METADATA_COLUMNS =
  'id, title, tags, content_version, ingestion_status, ingestion_error, chunk_count, ingested_at, created_at, updated_at';
type MetadataRow = Omit<Tables<'documents'>, 'user_id' | 'content' | 'excerpt'>;

/** One document, full content included. */
export const DOCUMENT_COLUMNS = `${METADATA_COLUMNS}, content` as const;
export type DocumentRow = MetadataRow & Pick<Tables<'documents'>, 'content'>;

/**
 * List rows carry the stored `excerpt` (the first 400 characters, a generated column)
 * instead of the content, which can be 200k characters per row.
 */
export const DOCUMENT_SUMMARY_COLUMNS = `${METADATA_COLUMNS}, excerpt` as const;
export type DocumentSummaryRow = MetadataRow & Pick<Tables<'documents'>, 'excerpt'>;

export const CHUNK_COLUMNS = 'id, chunk_index, heading_path, content, token_estimate';
export type ChunkRow = Pick<
  Tables<'document_chunks'>,
  'id' | 'chunk_index' | 'heading_path' | 'content' | 'token_estimate'
>;

export interface TagCountRow {
  tag: string;
  count: number;
}

export const EXCERPT_LENGTH = 180;
// Only the start of a (possibly 200k character) document can end up in the excerpt.
const EXCERPT_SCAN_LENGTH = 2_000;

export function toIngestion(row: MetadataRow): DocumentIngestion {
  return {
    status: row.ingestion_status,
    error: row.ingestion_error,
    chunkCount: row.chunk_count,
    contentVersion: row.content_version,
    ingestedAt: row.ingested_at,
  };
}

export function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingestion: toIngestion(row),
  };
}

export function toDocumentSummary(row: DocumentSummaryRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    tags: row.tags,
    // Postgres types every generated column as nullable; content is never null, so neither is this.
    excerpt: toExcerpt(withoutTitleHeading(row.excerpt ?? '', row.title)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingestion: toIngestion(row),
  };
}

export function toDocumentChunk(row: ChunkRow): DocumentChunk {
  return {
    id: row.id,
    chunkIndex: row.chunk_index,
    headingPath: row.heading_path,
    content: row.content,
    tokenEstimate: row.token_estimate,
  };
}

export function toTagCount(row: TagCountRow): TagCount {
  return { tag: row.tag, count: Number(row.count) };
}

/** An ATX heading line, `## Text` or `## Text ##`; group 1 is the text. */
const HEADING = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HEADING_LINES = new RegExp(HEADING.source, 'gm');

function normaliseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Drops the first line when it is a heading that repeats the title (most documents open
 * with one), so a list that already shows the title does not show it twice. Any other
 * opening heading is kept.
 */
export function withoutTitleHeading(content: string, title: string): string {
  const body = content.replace(/^\s*\n/, ''); // leading blank lines
  const lineEnd = body.search(/\r?\n|$/);
  const heading = HEADING.exec(body.slice(0, lineEnd));
  if (!heading || normaliseText(heading[1] ?? '') !== normaliseText(title)) return content;
  return body.slice(lineEnd);
}

/** A heading ends with a period, so it does not run into the paragraph after it. */
function headingToSentence(_line: string, text: string): string {
  return !text || /[.!?:;]$/.test(text) ? text : `${text}.`;
}

/**
 * Plain-text preview of markdown for list views: markup roughly removed, whitespace
 * collapsed, cut on a word boundary. Not a markdown parser, and does not need to be.
 */
export function toExcerpt(content: string, maxLength = EXCERPT_LENGTH): string {
  const text = content
    .slice(0, EXCERPT_SCAN_LENGTH)
    .replace(/^\s*(?:`{3,}|~{3,}).*$/gm, ' ') // code fence lines (the code itself stays)
    .replace(/^[\s|:*_-]{3,}$/gm, ' ') // horizontal rules and table separator rows
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(HEADING_LINES, headingToSentence) // "## Scope" -> "Scope."
    .replace(/^\s{0,3}(?:>+|[-*+]|\d+[.)])\s+/gm, '') // quotes, list markers
    .replace(/<\/?[a-z][^>]*>/gi, ' ') // inline html tags
    .replace(/[*~`]+|(?<!\w)_+|_+(?!\w)/g, '') // emphasis and code marks, not snake_case
    .replace(/\|/g, ' ') // table cell borders
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  const lastSpace = text.lastIndexOf(' ', maxLength);
  // Cut at a word boundary unless that would lose too much of the preview.
  const end = lastSpace > maxLength * 0.6 ? lastSpace : maxLength;
  return `${text.slice(0, end).trimEnd()}…`;
}
