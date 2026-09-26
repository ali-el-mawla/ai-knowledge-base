import { createHash } from 'node:crypto';

/**
 * Contextual chunk header: "{title} > {heading path}". Prepended to every chunk
 * before embedding, so a chunk from the middle of a document still carries what
 * it is about ("Parental leave" alone is ambiguous; "Employee handbook > Leave
 * policy > Parental leave" is not). A free, deterministic version of contextual retrieval.
 */
export function buildChunkHeader(title: string, headingPath: string): string {
  return headingPath ? `${title} > ${headingPath}` : title;
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
 * Identifies one embedding. If any input changes (the model, its dimensions, the
 * prefix, the header or the text), the stored vector no longer matches and the
 * hash changes with it; otherwise the vector is reused and the model is not called.
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
