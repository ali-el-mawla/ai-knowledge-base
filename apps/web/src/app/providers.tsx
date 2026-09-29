'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per tab: created once, kept across re-renders.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
