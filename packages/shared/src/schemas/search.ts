import { z } from 'zod';

export const retrievalModeSchema = z.enum(['hybrid', 'vector', 'keyword']);
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  mode: retrievalModeSchema.default('hybrid'),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});
export type SearchRequest = z.output<typeof searchRequestSchema>;

/** One retrieved chunk as shown to the user and given to the model. `index` is the [n] citation number. */
export interface Source {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string;
  content: string;
  score: {
    /** Reciprocal Rank Fusion score; only comparable within one query. */
    fused: number;
    /** 1-based rank in the vector search arm, or null if the chunk was not in it. */
    semanticRank: number | null;
    /** 1-based rank in the keyword (full-text) arm, or null if the chunk was not in it. */
    keywordRank: number | null;
  };
}

export interface SearchResponse {
  items: Source[];
}
