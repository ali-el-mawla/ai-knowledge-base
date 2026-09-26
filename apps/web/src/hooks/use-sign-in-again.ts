'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Ends the expired local session and sends the user to the login page, which brings them
 * back here afterwards. Signing out first matters: with a stale session cookie the proxy
 * would bounce /login straight back.
 */
export function useSignInAgain() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return async function signInAgain() {
    await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
    queryClient.clear();
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
    router.refresh();
  };
}
