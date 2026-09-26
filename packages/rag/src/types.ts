export interface ChunkInput {
  title: string;
  /** Markdown or plain text (plain text is valid markdown: paragraphs only). */
  content: string;
}

export interface TextChunk {
  /** 0-based position in the document. */
  index: number;
  /** Heading trail, e.g. "Leave policy > Parental leave"; "" before the first heading. */
  headingPath: string;
  content: string;
  /** Rough token count (chars / 4, rounded up); used for display and budgeting only. */
  tokenEstimate: number;
}

export interface ChunkerOptions {
  /** Paragraphs are merged until a chunk reaches about this many characters. */
  targetChars: number;
  /**
   * Hard ceiling for header + content. nomic-embed-text under Ollama reads at most
   * 2,048 tokens and silently truncates the rest; 2,000 characters is roughly 500 tokens, far below it.
   */
  maxChars: number;
  /** Sentence overlap carried into the next chunk, only when one section is split. */
  overlapChars: number;
}

export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  targetChars: 1200,
  maxChars: 2000,
  overlapChars: 200,
};

export type Chunker = (input: ChunkInput, options?: Partial<ChunkerOptions>) => TextChunk[];

/** A retrieved chunk as the prompt builder sees it; `index` is its [n] citation number. */
export interface PromptSource {
  index: number;
  documentTitle: string;
  headingPath: string;
  content: string;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}
