'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from '@/lib/query-client';

/** Client-side providers shared by every page. */
export function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser tab, created lazily so it survives re-renders but not reloads.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
