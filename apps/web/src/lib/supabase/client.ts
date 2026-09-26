import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/env';

/**
 * Supabase client for the browser. It is used for auth only: all data goes through the API.
 * `createBrowserClient` keeps one shared instance per page, so calling this repeatedly is cheap.
 */
export function getSupabaseBrowserClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

/** The current access token, refreshed by supabase-js when it is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}
