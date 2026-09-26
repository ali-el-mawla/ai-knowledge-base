import { buildEmbeddingText, estimateTokens } from '../header.js';
import { type ChunkerOptions, DEFAULT_CHUNKER_OPTIONS, type TextChunk } from '../types.js';

/** A chunk before it gets its position and token estimate. */
export interface ChunkDraft {
  headingPath: string;
  content: string;
}

export function resolveChunkerOptions(options: Partial<ChunkerOptions> = {}): ChunkerOptions {
  const resolved: ChunkerOptions = {
    targetChars: options.targetChars ?? DEFAULT_CHUNKER_OPTIONS.targetChars,
    maxChars: options.maxChars ?? DEFAULT_CHUNKER_OPTIONS.maxChars,
    overlapChars: options.overlapChars ?? DEFAULT_CHUNKER_OPTIONS.overlapChars,
  };
  requireInteger('targetChars', resolved.targetChars, 1);
  requireInteger('maxChars', resolved.maxChars, 1);
  requireInteger('overlapChars', resolved.overlapChars, 0);
  return resolved;
}

function requireInteger(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer of at least ${min}, got ${value}`);
  }
}

/** Windows (CRLF) and old Mac (CR) line endings become LF, so every rule sees one kind of line. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Characters left for a chunk's content once its header is counted. Keeping content
 * within this budget is what guarantees that
 * buildEmbeddingText(title, headingPath, content).length <= maxChars.
 */
export function contentBudget(title: string, headingPath: string, maxChars: number): number {
  const headerChars = buildEmbeddingText(title, headingPath, '').length;
  const budget = maxChars - headerChars;
  if (budget < 1) {
    throw new RangeError(
      `The chunk header takes ${headerChars} characters and leaves no room for content ` +
        `within maxChars (${maxChars}); the title is too long.`,
    );
  }
  return budget;
}

export function toTextChunks(drafts: readonly ChunkDraft[]): TextChunk[] {
  return drafts
    .filter((draft) => draft.content.length > 0)
    .map((draft, index) => ({
      index,
      headingPath: draft.headingPath,
      content: draft.content,
      tokenEstimate: estimateTokens(draft.content),
    }));
}
