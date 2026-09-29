import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';

const MAX_RETRIES = 2;

/** Never retries 4xx answers: a missing document or a validation error will not fix itself. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientError) return false;
  return failureCount < MAX_RETRIES;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30 s: navigating back and forth does not refetch everything.
        staleTime: 30_000,
        // Polling covers live status; no burst of refetches when switching windows.
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
