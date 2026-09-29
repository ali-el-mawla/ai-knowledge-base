import { Injectable } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import type { Database } from '../database.types.js';

export type Db = SupabaseClient<Database>;

// Server-side clients never store or refresh sessions: the token belongs to the caller.
const SERVER_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

@Injectable()
export class SupabaseService {
  private adminClient: Db | null = null;

  constructor(@InjectConfig() private readonly config: AppConfig) {}

  /**
   * The client for user requests. PostgREST receives the user's JWT, so every query runs
   * as role `authenticated` with `auth.uid()` set to the user, and Row Level Security
   * decides which rows are visible. Created per request (no network I/O).
   */
  forUser(accessToken: string): Db {
    return createClient<Database>(this.config.supabase.url, this.config.supabase.publishableKey, {
      auth: SERVER_AUTH,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  /**
   * WARNING: this client uses the secret key and BYPASSES ROW LEVEL SECURITY.
   *
   * Only for work no user request can express: the ingestion worker, the seed and
   * reembed CLIs, system checks (health, schema guard), and writing columns users are
   * not granted (e.g. bumping `content_version` on reindex) after ownership was
   * verified with `forUser`. Always filter by the owner explicitly when using it.
   */
  admin(): Db {
    this.adminClient ??= createClient<Database>(
      this.config.supabase.url,
      this.config.supabase.secretKey,
      { auth: SERVER_AUTH },
    );
    return this.adminClient;
  }
}
