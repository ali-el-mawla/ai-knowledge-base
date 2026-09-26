'use client';

import type { DocumentIngestion } from '@repo/shared';
import { CircleAlertIcon, CircleCheckIcon, Loader2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';

type Ingestion = Pick<DocumentIngestion, 'status' | 'error' | 'chunkCount'>;

const IN_PROGRESS_LABEL = {
  pending: 'Queued',
  processing: 'Indexing',
} as const;

/**
 * Where a document is in the ingestion pipeline: queued or indexing (with a spinner), ready
 * (with its chunk count) or failed (with the error in a tooltip and for screen readers).
 */
export function DocumentStatusBadge({
  ingestion,
  className,
}: {
  ingestion: Ingestion;
  className?: string;
}) {
  const { status } = ingestion;

  if (status === 'pending' || status === 'processing') {
    return (
      <Badge variant="secondary" className={cn('gap-1.5', className)}>
        <Loader2Icon className="motion-safe:animate-spin" aria-hidden />
        {IN_PROGRESS_LABEL[status]}
      </Badge>
    );
  }

  if (status === 'ready') {
    return (
      <Badge
        variant="outline"
        className={cn('gap-1.5 text-muted-foreground', className)}
        title={`Indexed into ${pluralize(ingestion.chunkCount, 'chunk')}`}
      >
        <CircleCheckIcon className="text-success" aria-hidden />
        <span className="sr-only">Ready, </span>
        {pluralize(ingestion.chunkCount, 'chunk')}
      </Badge>
    );
  }

  const error = ingestion.error ?? 'Indexing failed for an unknown reason.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="destructive"
          tabIndex={0}
          className={cn('cursor-help gap-1.5 outline-none', className)}
        >
          <CircleAlertIcon aria-hidden />
          Failed
          <span className="sr-only">: {error}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{error}</TooltipContent>
    </Tooltip>
  );
}
