import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createEmbeddingModel } from '@repo/ai';
import {
  CHUNKER_OPTIONS,
  embeddingModelKey,
  loadEvalConfig,
  MODES,
  PATHS,
  STRATEGIES,
} from './config.js';
import { loadCorpus } from './corpus.js';
import { readCommit } from './git.js';
import { indexCorpus } from './index-corpus.js';
import { elapsed, log, warn } from './output.js';
import { loadQuestions } from './questions.js';
import {
  buildConsoleTable,
  buildMarkdown,
  type IndexedStrategy,
  type ReportInput,
} from './report.js';
import { type RetrievalResult, retrieveAll } from './retrieve.js';
import { createAdminClient, createUserClient, ensureEvalUser } from './users.js';

/**
 * `npm run eval`: indexes the corpus once per chunking strategy (each under its own user),
 * runs every question through every retrieval mode as that user, and writes docs/EVAL.md.
 */
async function main(): Promise<void> {
  const started = performance.now();
  const config = loadEvalConfig();
  const corpus = loadCorpus(PATHS.corpusDir);
  const questionSet = loadQuestions(PATHS, corpus);
  const { questions } = questionSet;
  const questionFile = fromRepoRoot(questionSet.file);

  if (!questionSet.isRealSet) {
    warn(
      `WARNING: fixtures/questions.json does not exist yet. Running the ${questions.length} template ` +
        `questions from ${questionFile}, which only show the format. Write the real set in ` +
        'fixtures/questions.json and run again; nothing else needs to change.',
    );
  }
  for (const line of questionSet.warnings) warn(`Question warning: ${line}`);
  log(`Corpus: ${corpus.length} documents. Questions: ${questions.length} from ${questionFile}.`);

  const embedder = createEmbeddingModel(config.embedding);
  const modelKey = embeddingModelKey(config.embedding);
  const admin = createAdminClient(config.supabase);

  // The query vectors do not depend on the chunking, so both strategies share them.
  let phase = performance.now();
  const queryEmbeddings = await embedder.embed(
    questions.map((q) => q.question),
    'query',
  );
  log(`Embedded ${questions.length} questions with ${embedder.info.model} (${elapsed(phase)}).`);

  const results: RetrievalResult[] = [];
  const indexed: IndexedStrategy[] = [];
  for (const strategy of STRATEGIES) {
    phase = performance.now();
    const user = await ensureEvalUser(config.supabase, admin, strategy.email, strategy.password);
    const { fileByDocumentId, stats } = await indexCorpus({
      admin,
      userId: user.id,
      corpus,
      chunker: strategy.chunker,
      chunkerOptions: CHUNKER_OPTIONS,
      embedder,
      modelKey,
    });
    log(
      `${strategy.label}: ${stats.chunks} chunks in ${stats.documents} documents, ` +
        `${stats.embedded} embedded, ${stats.reused} reused, ${stats.rewritten} document(s) rewritten ` +
        `(${elapsed(phase)}).`,
    );

    phase = performance.now();
    const client = createUserClient(config.supabase, user.accessToken);
    results.push(
      ...(await retrieveAll(
        { strategy: strategy.id, client, fileByDocumentId },
        { questions, queryEmbeddings, modes: MODES, modelKey },
      )),
    );
    const searches = questions.length * MODES.length;
    log(`${strategy.label}: ${searches} searches as ${strategy.email} (${elapsed(phase)}).`);
    indexed.push({ strategy, chunks: stats.chunks });
  }

  const report: ReportInput = {
    generatedAt: new Date(),
    commit: readCommit(PATHS.repoRoot),
    questionFile,
    isRealSet: questionSet.isRealSet,
    questions,
    corpus,
    embedding: embedder.info,
    chunkerOptions: CHUNKER_OPTIONS,
    strategies: indexed,
    modes: MODES,
    results,
  };
  mkdirSync(path.dirname(PATHS.report), { recursive: true });
  writeFileSync(PATHS.report, buildMarkdown(report));

  log();
  log(buildConsoleTable(report));
  log();
  log(`Wrote ${fromRepoRoot(PATHS.report)} (total ${elapsed(started)}).`);
}

function fromRepoRoot(file: string): string {
  return path.relative(PATHS.repoRoot, file).split(path.sep).join('/');
}

main().catch((error: unknown) => {
  warn(`Evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
