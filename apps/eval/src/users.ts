import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type EvalConfig } from './config.js';
import { type Database } from './database.js';

export type Db = SupabaseClient<Database>;

type SupabaseSettings = EvalConfig['supabase'];

const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Secret-key client: bypasses RLS. Used only to set up users, documents and chunks. */
export function createAdminClient(supabase: SupabaseSettings): Db {
  return createClient<Database>(supabase.url, supabase.secretKey, { auth: SERVER_AUTH });
}

/** Acts as one signed-in user, like the API's per-request client: RLS applies to every call. */
export function createUserClient(supabase: SupabaseSettings, accessToken: string): Db {
  return createClient<Database>(supabase.url, supabase.publishableKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export interface EvalUser {
  id: string;
  email: string;
  accessToken: string;
}

/**
 * Signs the eval user in, creating it (or resetting its password) first when needed,
 * so any number of runs converge on the same user.
 */
export async function ensureEvalUser(
  supabase: SupabaseSettings,
  admin: Db,
  email: string,
  password: string,
): Promise<EvalUser> {
  const existing = await signIn(supabase, email, password);
  if (existing) return existing;

  const found = await findUserByEmail(admin, email);
  const { error } = found
    ? await admin.auth.admin.updateUserById(found, { password, email_confirm: true })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`Cannot prepare eval user ${email}: ${error.message}`);

  const user = await signIn(supabase, email, password);
  if (!user) throw new Error(`Eval user ${email} exists but cannot sign in.`);
  return user;
}

async function signIn(
  supabase: SupabaseSettings,
  email: string,
  password: string,
): Promise<EvalUser | null> {
  const client = createClient<Database>(supabase.url, supabase.publishableKey, {
    auth: SERVER_AUTH,
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return { id: data.user.id, email, accessToken: data.session.access_token };
}

async function findUserByEmail(admin: Db, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Cannot list users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}
