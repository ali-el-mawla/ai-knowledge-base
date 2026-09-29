'use client';

import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSignInAgain } from '@/hooks/use-sign-in-again';
import { describeStreamError } from '../stream-errors';
import type { ChatStreamError } from '../stream-state';

const QUESTION_PREVIEW_CHARS = 140;

/** Retry, disabled with a countdown while the server asks to wait (rate limit). */
function RetryButton({ waitSeconds, onRetry }: { waitSeconds: number; onRetry: () => void }) {
  const [left, setLeft] = useState(waitSeconds);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={left > 0}>
      <RotateCcwIcon aria-hidden />
      {left > 0 ? `Try again in ${left} s` : 'Try again'}
    </Button>
  );
}

export function StreamErrorAlert({
  error,
  question,
  onRetry,
  onDismiss,
}: {
  error: ChatStreamError;
  question: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const copy = describeStreamError(error);
  const signInAgain = useSignInAgain();
  const preview =
    question.length > QUESTION_PREVIEW_CHARS
      ? `${question.slice(0, QUESTION_PREVIEW_CHARS).trimEnd()}...`
      : question;

  return (
    <Alert variant="destructive">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="grid gap-2 [&_p:not(:last-child)]:mb-0">
        <p>{copy.description}</p>
        {error.phase === 'request' && (
          <p className="text-muted-foreground">
            Your question was: <q>{preview}</q>
          </p>
        )}
        {error.requestId && <p className="font-mono text-xs">Request ID: {error.requestId}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {copy.retryable && (
            <RetryButton
              key={error.retryAfter ?? 0}
              waitSeconds={error.retryAfter ?? 0}
              onRetry={onRetry}
            />
          )}
          {error.code === 'UNAUTHORIZED' && (
            <Button type="button" variant="outline" size="sm" onClick={() => void signInAgain()}>
              Sign in again
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
