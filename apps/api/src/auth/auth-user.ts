/** The caller, as proven by a verified Supabase access token. */
export interface AuthUser {
  /** `sub` claim: the auth.users id that RLS compares with `auth.uid()`. */
  id: string;
  email: string | null;
  /** The raw bearer token, forwarded to Supabase so queries run as this user. Never log it. */
  accessToken: string;
}
