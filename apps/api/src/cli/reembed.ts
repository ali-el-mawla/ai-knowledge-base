// Must stay the first import: it loads the root .env before any other module runs.
import '../load-env.js';
import 'reflect-metadata';
import { embeddingModelKey } from '../ai/embedding-model-key.js';
import type { IngestionOutcome } from '../ingestion/ingestion.service.js';
import { type DocumentVersion, IngestionRepository } from '../ingestion/ingestion.repository.js';
import { describeOutcome, ingestionWorker, runCli, seconds, sumOutcomes } from './run-cli.js';

/**
 * `npm run reembed`: the fix after changing the embedding model (EMBEDDING_PROVIDER /
 * EMBEDDING_MODEL). Retrieval only searches chunks made by the configured model, so
 * documents indexed with another one are invisible until rebuilt. This finds them (and
 * documents whose last ingestion failed) for every user, bumps their version so a new
 * chunk generation is written, and indexes them with the configured model.
 */
void runCli(async (app, config) => {
  const startedAt = performance.now();
  const repository = app.get(IngestionRepository);
  const worker = ingestionWorker(app);
  const model = embeddingModelKey(config.ai.embedding);

  const { stale, failed } = await repository.findReembedCandidates(model);
  const targets = new Map<string, DocumentVersion>();
  for (const document of [...stale, ...failed]) targets.set(document.id, document);

  if (targets.size === 0) {
    await worker.idle(); // anything requeued at start-up still finishes before exit
    console.log(
      `Nothing to re-embed: every chunk was embedded with ${model} and no document has failed.`,
    );
    return true;
  }

  console.log(
    `Re-embedding ${targets.size} document(s) with ${model}: ` +
      `${stale.length} with chunks from another model, ${failed.length} failed.`,
  );
  const outcomes = new Map<string, IngestionOutcome>();
  const unsubscribe = worker.onOutcome((outcome) => {
    if (!targets.has(outcome.documentId)) return;
    outcomes.set(outcome.documentId, outcome);
    console.log(describeOutcome(outcome, outcome.documentId));
  });

  for (const document of targets.values()) {
    // False means an edit bumped the version first; that version still needs indexing.
    await repository.bumpVersion(document);
    worker.enqueue(document.id);
  }
  await worker.idle();
  unsubscribe();

  const totals = sumOutcomes(outcomes.values());
  console.log('');
  console.log(
    `Re-embedded ${totals.ready} of ${targets.size}: ${totals.chunks} chunks, ` +
      `embedded ${totals.embedded}, reused ${totals.reused}, failed ${totals.failed}. ` +
      `Took ${seconds(startedAt)}.`,
  );
  return totals.failed === 0;
});
