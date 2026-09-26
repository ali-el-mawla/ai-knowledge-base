'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CloudOffIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { getErrorMessage, isApiError } from '@/lib/api-client';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface ErrorStateProps {
  error: unknown;
  /** What failed, e.g. "Could not load your documents". */
  title: string;
  onRetry?: () => void;
  className?: string;
}

/** Full-width error for a failed query, with the right way out for each kind of failure. */
export function ErrorState({ error, title, onRetry, className }: ErrorStateProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  if (isApiError(error) && error.status === 401) {
    async function signInAgain() {
      await getSupabaseBrowserClient().auth.signOut({ scope: 'local' });
      queryClient.clear();
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      router.refresh();
    }
    return (
      <EmptyState
        className={className}
        icon={LockIcon}
        title="Your session has expired"
        description="Sign in again to continue where you left off."
        action={
          <Button type="button" onClick={() => void signInAgain()}>
            Sign in again
          </Button>
        }
      />
    );
  }

  const offline = isApiError(error) && error.code === 'NETWORK_ERROR';
  const requestId = isApiError(error) ? error.requestId : null;

  return (
    <EmptyState
      className={className}
      icon={offline ? CloudOffIcon : TriangleAlertIcon}
      title={title}
      description={
        <>
          {getErrorMessage(error)}
          {requestId && (
            <span className="mt-1 block font-mono text-xs">Request ID: {requestId}</span>
          )}
        </>
      }
      action={
        onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}
