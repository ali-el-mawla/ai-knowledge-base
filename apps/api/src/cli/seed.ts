// Must stay the first import: it loads the root .env before any other module runs.
import '../load-env.js';
import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { createDocumentSchema } from '@repo/shared';
import { createClient } from '@supabase/supabase-js';
import type { AuthUser } from '../auth/auth-user.js';
import type { AppConfig } from '../config/app-config.js';
import type { Database } from '../database.types.js';
import { DocumentsService } from '../documents/documents.service.js';
import type { IngestionOutcome } from '../ingestion/ingestion.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { readCorpus } from './corpus.js';
import {
  CliError,
  describeOutcome,
  ingestionWorker,
  runCli,
  seconds,
  sumOutcomes,
} from './run-cli.js';

/**
 * `npm run seed`: the demo user and the fixture corpus, indexed and ready to chat with.
 * Idempotent: the user is created once, a document is created only if the user has
 * none with the same title, and a second run changes nothing.
 */

const DEMO_EMAIL = 'demo@quaylark.test';
const DEMO_PASSWORD = 'demo-password-2026';
// src/cli and dist/cli sit at the same depth, so this resolves in both.
const CORPUS_DIR = fileURLToPath(new URL('../../../../fixtures/corpus/', import.meta.url));

/**
 * The admin API is used only for what no user can do: creating an account that is
 * already confirmed. Everything else runs as the demo user (see `seedCorpus`).
 */
async function signInDemoUser(supabase: SupabaseService, config: AppConfig): Promise<AuthUser> {
  const { error: createError } = await supabase.admin().auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (createError && createError.code !== 'email_exists') {
    throw new CliError(`Could not create the demo user: ${createError.message}`);
  }

  // A client of its own: signing in on the shared admin client would make it send the
  // user's token instead of the secret key.
  const client = createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) {
    throw new CliError(
      `Could not sign in as ${DEMO_EMAIL}: ${error.message}. If its password was changed, ` +
        'delete the user in Supabase Studio (http://127.0.0.1:54323) and run the seed again.',
    );
  }
  return { id: data.user.id, email: DEMO_EMAIL, accessToken: data.session.access_token };
}

void runCli(async (app, config) => {
  const startedAt = performance.now();
  const supabase = app.get(SupabaseService);
  const documents = app.get(DocumentsService);
  const worker = ingestionWorker(app);

  const user = await signInDemoUser(supabase, config);
  const corpus = await readCorpus(CORPUS_DIR);
  if (corpus.length === 0) throw new CliError(`No markdown files found in ${CORPUS_DIR}`);

  // Documents are created as the demo user, through the same DocumentsService and
  // user-scoped client as POST /documents: RLS, column grants and the auth.uid() owner
  // default apply exactly as for a real user, and ingestion is queued the same way.
  // Inserting with the admin client and an explicit user_id would skip all of that.
  const asUser = supabase.forUser(user.accessToken);
  const { data: existingRows, error } = await asUser
    .from('documents')
    .select('id, title, ingestion_status')
    .in(
      'title',
      corpus.map((file) => file.title),
    );
  if (error) throw new CliError(`Could not read the demo user's documents: ${error.message}`);
  const existing = new Map(existingRows.map((row) => [row.title, row]));

  const titleById = new Map<string, string>();
  const outcomes = new Map<string, IngestionOutcome>();
  const unsubscribe = worker.onOutcome((outcome) => {
    const title = titleById.get(outcome.documentId);
    if (!title) return; // a document another user left unfinished (requeued at start)
    outcomes.set(outcome.documentId, outcome);
    console.log(describeOutcome(outcome, title));
  });

  let created = 0;
  let skipped = 0;
  console.log(`Seeding ${corpus.length} documents for ${DEMO_EMAIL}`);
  for (const file of corpus) {
    const found = existing.get(file.title);
    if (found) {
      skipped += 1;
      // Created by an earlier run that stopped or failed before indexing: finish it now.
      if (found.ingestion_status !== 'ready') {
        titleById.set(found.id, file.title);
        worker.enqueue(found.id);
      }
      continue;
    }
    const body = createDocumentSchema.parse({
      title: file.title,
      content: file.content,
      tags: file.tags,
    });
    const document = await documents.create(user, body);
    titleById.set(document.id, file.title);
    created += 1;
    console.log(`  created  ${file.title} [${body.tags.join(', ')}]`);
  }

  await worker.idle();
  unsubscribe();

  const { data: finalRows, error: finalError } = await asUser
    .from('documents')
    .select('title, ingestion_status, chunk_count')
    .in(
      'title',
      corpus.map((file) => file.title),
    );
  if (finalError) throw new CliError(`Could not read the final state: ${finalError.message}`);
  const ready = finalRows.filter((row) => row.ingestion_status === 'ready');
  const totals = sumOutcomes(outcomes.values());

  console.log('');
  console.log(`Created ${created}, skipped ${skipped} (already present).`);
  if (outcomes.size > 0) {
    console.log(
      `Ingested ${totals.ready} of ${outcomes.size}: ${totals.chunks} chunks, ` +
        `embedded ${totals.embedded}, reused ${totals.reused}, failed ${totals.failed}.`,
    );
  }
  console.log(
    `Corpus: ${ready.length} of ${corpus.length} documents ready, ` +
      `${ready.reduce((sum, row) => sum + row.chunk_count, 0)} chunks. Took ${seconds(startedAt)}.`,
  );
  console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  if (ready.length < corpus.length) {
    console.error(
      '\nSome documents are not indexed. Check the embedding provider (GET /api/health?deep=1), ' +
        'then run npm run seed again.',
    );
    return false;
  }
  return true;
});
