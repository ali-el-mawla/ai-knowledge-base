import '../../src/load-env.js';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type AppConfig, loadAppConfig } from '../../src/config/app-config.js';
import type { Database, Json } from '../../src/database.types.js';

/** The same validated configuration the API uses, read from the root .env. */
export const config: AppConfig = loadAppConfig(process.env);

type Db = SupabaseClient<Database>;

const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Secret-key client: bypasses RLS. Tests use it to play the ingestion worker and to clean up. */
export function adminClient(): Db {
  return createClient<Database>(config.supabase.url, config.supabase.secretKey, {
    auth: SERVER_AUTH,
  });
}

/** Acts as one signed-in user, exactly like the API's `forUser` client. */
export function userClient(accessToken: string): Db {
  return createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** A fresh, confirmed user with a random email, signed in with a real access token. */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `it-${label}-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data: created, error: createError } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;

  const anon = createClient<Database>(config.supabase.url, config.supabase.publishableKey, {
    auth: SERVER_AUTH,
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: created.user.id, email, token: data.session.access_token };
}

/**
 * Deletes only the given test users. Their documents, chunks, conversations and
 * messages go with them through ON DELETE CASCADE; no other data is touched.
 */
export async function deleteTestUsers(...users: (TestUser | undefined)[]): Promise<void> {
  const admin = adminClient();
  for (const user of users) {
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
}

export const TEST_EMBEDDING_DIMENSIONS = 768;

/** A unit vector along one axis: cheap, valid and distinct per axis. */
export function unitVector(axis = 0): number[] {
  const vector = new Array<number>(TEST_EMBEDDING_DIMENSIONS).fill(0);
  vector[axis] = 1;
  return vector;
}

export interface TestChunk {
  chunkIndex: number;
  content: string;
  headingPath?: string;
}

/** Writes a chunk generation exactly as the ingestion worker does (secret key, RPC). */
export async function writeChunksAsWorker(
  documentId: string,
  contentVersion: number,
  chunks: TestChunk[],
  embeddingModel = config.ai.embedding.model,
): Promise<void> {
  const payload: Json = chunks.map((chunk) => ({
    chunk_index: chunk.chunkIndex,
    heading_path: chunk.headingPath ?? '',
    content: chunk.content,
    token_estimate: Math.max(1, Math.ceil(chunk.content.length / 4)),
    content_hash: `test-${randomUUID()}`,
    embedding: unitVector(chunk.chunkIndex),
  }));
  const { data, error } = await adminClient().rpc('replace_document_chunks', {
    p_document_id: documentId,
    p_content_version: contentVersion,
    p_embedding_model: embeddingModel,
    p_chunks: payload,
  });
  if (error) throw error;
  if (!data[0]?.applied) throw new Error(`chunks for ${documentId} v${contentVersion} not applied`);
}
