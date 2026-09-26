import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';

const MAX_RETRIES = 2;

/**
 * Retry network and server failures a couple of times, but never 4xx answers:
 * a missing document or a validation error will not fix itself.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.isClientError) return false;
  return failureCount < MAX_RETRIES;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays fresh for 30 s: navigating back and forth does not refetch everything.
        staleTime: 30_000,
        // Switching windows does not trigger a burst of refetches; polling covers live status.
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
