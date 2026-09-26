'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { describeAiInfo, formatAiInfo } from '../ai-info';
import { useAiInfo } from '../queries';

/** Which models answer and embed, in one muted line; the tooltip has the details. */
export function ProviderIndicator() {
  const info = useAiInfo();

  if (info.isPending) return <Skeleton className="h-3.5 w-56" />;
  // The indicator is informative only; a failure here must not distract from the chat.
  if (!info.data) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p
          tabIndex={0}
          className="truncate rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {formatAiInfo(info.data)}
        </p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="flex-col items-start gap-0.5">
        {describeAiInfo(info.data).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
