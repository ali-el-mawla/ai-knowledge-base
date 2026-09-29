import { createHash } from 'node:crypto';

/**
 * Contextual chunk header, "{title} > {heading path}", prepended to every chunk before
 * embedding: "Parental leave" alone is ambiguous, "Employee handbook > Leave policy >
 * Parental leave" is not. A free, deterministic form of contextual retrieval.
 */
export function buildChunkHeader(title: string, headingPath: string): string {
  const path = withoutLeadingTitle(title, headingPath);
  return path ? `${title} > ${path}` : title;
}

const SEPARATOR = ' > ';

/** Most documents open with an H1 equal to their title; repeating it wastes embedding space. */
function withoutLeadingTitle(title: string, headingPath: string): string {
  const [first, ...rest] = headingPath.split(SEPARATOR);
  const normalize = (text: string) => text.trim().toLowerCase();
  return first !== undefined && normalize(first) === normalize(title)
    ? rest.join(SEPARATOR)
    : headingPath;
}

/** The exact text sent to the embedding model (the model adds its own task prefix). */
export function buildEmbeddingText(title: string, headingPath: string, content: string): string {
  return `${buildChunkHeader(title, headingPath)}\n\n${content}`;
}

export interface ChunkHashInput {
  embeddingModel: string;
  dimensions: number;
  /** The document task prefix the embedding model applies, e.g. "search_document: ". */
  prefix: string;
  embeddingText: string;
}

/**
 * Identifies one embedding. Any change to the model, dimensions, prefix, header or text
 * changes the hash; an unchanged hash reuses the stored vector without calling the model.
 */
export function hashChunk(input: ChunkHashInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([input.embeddingModel, input.dimensions, input.prefix, input.embeddingText]),
    )
    .digest('hex');
}

/** Rough token estimate (about 4 characters per token for English prose). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
