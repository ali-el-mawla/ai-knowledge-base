'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

/** Catches unexpected render errors in signed-in pages; the shell around it keeps working. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Something went wrong"
      description="This page hit an unexpected error. Trying again usually fixes it."
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
