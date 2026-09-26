import { type RetrievalMode } from '@repo/shared';
import { type Mode, RETRIEVAL, type StrategyId } from './config.js';
import { containsAnswer } from './match.js';
import { firstHitRank, type Rank } from './metrics.js';
import { type Question } from './questions.js';
import { type Db } from './users.js';

export interface RetrievedChunk {
  documentFile: string;
  headingPath: string;
  content: string;
}

export interface RetrievalResult {
  questionId: string;
  strategy: StrategyId;
  mode: RetrievalMode;
  rank: Rank;
  /** The first result, to show what outranked the answer when it was not first. */
  top: RetrievedChunk | null;
}

export interface StrategyRun {
  strategy: StrategyId;
  /** Signed in as this strategy's eval user: RLS limits every search to its own chunks. */
  client: Db;
  fileByDocumentId: ReadonlyMap<string, string>;
}

export interface RetrievalInput {
  questions: readonly Question[];
  /** One query vector per question, same order (purpose 'query'). */
  queryEmbeddings: readonly number[][];
  modes: readonly Mode[];
  modelKey: string;
}

/** Every question against every mode for one strategy. */
export async function retrieveAll(
  run: StrategyRun,
  input: RetrievalInput,
): Promise<RetrievalResult[]> {
  const results: RetrievalResult[] = [];
  for (const mode of input.modes) {
    for (const [index, question] of input.questions.entries()) {
      const embedding = input.queryEmbeddings[index];
      if (!embedding) throw new Error(`No query embedding for ${question.id}.`);
      const chunks = await search(run, question.question, embedding, input.modelKey, mode);
      results.push({
        questionId: question.id,
        strategy: run.strategy,
        mode: mode.id,
        rank: firstHitRank(chunks, (chunk) => isHit(chunk, question)),
        top: chunks[0] ?? null,
      });
    }
  }
  return results;
}

/** A retrieved chunk answers the question when it is from the gold document and holds the span. */
export function isHit(chunk: RetrievedChunk, question: Question): boolean {
  return chunk.documentFile === question.document && containsAnswer(chunk.content, question.answer);
}

async function search(
  run: StrategyRun,
  queryText: string,
  queryEmbedding: readonly number[],
  modelKey: string,
  mode: Mode,
): Promise<RetrievedChunk[]> {
  const { data, error } = await run.client.rpc('hybrid_search', {
    query_text: queryText,
    query_embedding: JSON.stringify(queryEmbedding),
    query_embedding_model: modelKey,
    match_count: RETRIEVAL.matchCount,
    full_text_weight: mode.fullTextWeight,
    semantic_weight: mode.semanticWeight,
    rrf_k: RETRIEVAL.rrfK,
    candidate_count: RETRIEVAL.candidateCount,
  });
  if (error) {
    throw new Error(`hybrid_search failed (${run.strategy}, ${mode.id}): ${error.message}`);
  }

  return data.map((row) => {
    const documentFile = run.fileByDocumentId.get(row.document_id);
    // RLS makes this impossible; if it ever happens, stop rather than score a foreign chunk.
    if (!documentFile) {
      throw new Error(
        `hybrid_search returned a chunk from document ${row.document_id}, which is not in the ${run.strategy} eval user's corpus.`,
      );
    }
    return { documentFile, headingPath: row.heading_path, content: row.content };
  });
}
