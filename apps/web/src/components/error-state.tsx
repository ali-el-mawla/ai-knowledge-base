'use client';

import { CloudOffIcon, LockIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { useSignInAgain } from '@/hooks/use-sign-in-again';
import { getErrorMessage, isApiError } from '@/lib/api-client';

interface ErrorStateProps {
  error: unknown;
  /** What failed, e.g. "Could not load your documents". */
  title: string;
  onRetry?: () => void;
  className?: string;
}

/** A failed query, with a way out that fits the failure (sign in again, or retry). */
export function ErrorState({ error, title, onRetry, className }: ErrorStateProps) {
  const signInAgain = useSignInAgain();

  if (isApiError(error) && error.status === 401) {
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
