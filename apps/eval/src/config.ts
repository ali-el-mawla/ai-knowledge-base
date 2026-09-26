import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type EmbeddingModelConfig, loadAiConfig } from '@repo/ai';
import {
  type Chunker,
  type ChunkerOptions,
  chunkFixedSize,
  chunkMarkdown,
  DEFAULT_CHUNKER_OPTIONS,
} from '@repo/rag';
import { type RetrievalMode } from '@repo/shared';

// src/ and dist/ sit at the same depth under apps/eval, so this resolves from both.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const PATHS = {
  repoRoot: REPO_ROOT,
  env: path.join(REPO_ROOT, '.env'),
  corpusDir: path.join(REPO_ROOT, 'fixtures', 'corpus'),
  questions: path.join(REPO_ROOT, 'fixtures', 'questions.json'),
  templateQuestions: path.join(REPO_ROOT, 'fixtures', 'questions.template.json'),
  report: path.join(REPO_ROOT, 'docs', 'EVAL.md'),
};

/** The same retrieval call for every combination; only the two weights change per mode. */
export const RETRIEVAL = { matchCount: 10, candidateCount: 30, rrfK: 60 } as const;

/** hit@k is reported for these k; MRR is computed over the full `matchCount` list. */
export const HIT_KS = [1, 3, 5] as const;

export const CHUNKER_OPTIONS: ChunkerOptions = DEFAULT_CHUNKER_OPTIONS;

export type StrategyId = 'structured' | 'naive';

export interface Strategy {
  id: StrategyId;
  label: string;
  /** Column prefix in the per-question table. */
  shortLabel: string;
  chunker: Chunker;
  /** One Supabase user per strategy, so RLS keeps the two indexes apart. */
  email: string;
  /** Local stack only: these users never exist outside `supabase start`. */
  password: string;
}

export const STRATEGIES: readonly Strategy[] = [
  {
    id: 'structured',
    label: 'Structure-aware',
    shortLabel: 'S',
    chunker: chunkMarkdown,
    email: 'eval-structured@quaylark.test',
    password: 'quaylark-eval-structured-local',
  },
  {
    id: 'naive',
    label: 'Naive fixed-size',
    shortLabel: 'N',
    chunker: chunkFixedSize,
    email: 'eval-naive@quaylark.test',
    password: 'quaylark-eval-naive-local',
  },
];

export interface Mode {
  id: RetrievalMode;
  semanticWeight: number;
  fullTextWeight: number;
}

/** hybrid_search with one arm switched off is plain vector or plain keyword retrieval. */
export const MODES: readonly Mode[] = [
  { id: 'vector', semanticWeight: 1, fullTextWeight: 0 },
  { id: 'keyword', semanticWeight: 0, fullTextWeight: 1 },
  { id: 'hybrid', semanticWeight: 1, fullTextWeight: 1 },
];

export interface EvalConfig {
  supabase: { url: string; publishableKey: string; secretKey: string };
  embedding: EmbeddingModelConfig;
}

/** Reads the monorepo's root `.env`; variables already set in the environment win. */
export function loadEvalConfig(): EvalConfig {
  if (existsSync(PATHS.env)) process.loadEnvFile(PATHS.env);
  const env = process.env;
  return {
    supabase: {
      url: required(env, 'SUPABASE_URL'),
      publishableKey: required(env, 'SUPABASE_PUBLISHABLE_KEY'),
      secretKey: required(env, 'SUPABASE_SECRET_KEY'),
    },
    // The evaluation never calls a chat model, so a chat setting cannot fail it.
    embedding: loadAiConfig({ ...env, CHAT_PROVIDER: undefined }).embedding,
  };
}

/**
 * The value stored in document_chunks.embedding_model and passed to hybrid_search. It must
 * match apps/api/src/ai/embedding-model-key.ts (the model name), or retrieval finds nothing.
 */
export function embeddingModelKey(embedding: Pick<EmbeddingModelConfig, 'model'>): string {
  return embedding.model;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Run \`npm run setup\` or fill it in the root .env.`);
  }
  return value;
}
