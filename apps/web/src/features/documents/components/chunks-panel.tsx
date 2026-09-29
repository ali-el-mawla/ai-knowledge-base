'use client';

import type { Document, DocumentChunk } from '@repo/shared';
import { InfoIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/error-state';
import { HeadingPath } from '@/components/heading-path';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isIngesting, useDocumentChunks } from '../queries';

const PREVIEW_CHARS = 480;
const PREVIEW_LINES = 6;

function ChunkCard({ chunk }: { chunk: DocumentChunk }) {
  const [expanded, setExpanded] = useState(false);
  const long =
    chunk.content.length > PREVIEW_CHARS || chunk.content.split('\n').length > PREVIEW_LINES;
  const contentId = `chunk-${chunk.id}`;

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
        <span className="font-mono font-semibold tabular-nums">#{chunk.chunkIndex + 1}</span>
        <div className="min-w-0 flex-1" title={chunk.headingPath || undefined}>
          <HeadingPath path={chunk.headingPath} />
        </div>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          ~{pluralize(chunk.tokenEstimate, 'token')}
        </span>
      </div>
      <div className="grid gap-1 px-3 py-2.5">
        <p
          id={contentId}
          className={cn(
            'font-mono text-xs leading-relaxed break-words whitespace-pre-wrap',
            long && !expanded && 'line-clamp-6',
          )}
        >
          {chunk.content}
        </p>
        {long && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto justify-self-start px-0"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : 'Show the whole chunk'}
          </Button>
        )}
      </div>
    </li>
  );
}

function ChunksSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading chunks">
      <Skeleton className="h-4 w-64" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Refreshes by itself when a new ingestion run ends (the query is keyed by `ingestedAt`). */
export function ChunksPanel({
  document,
  hasUnsavedChanges,
}: {
  document: Document;
  hasUnsavedChanges: boolean;
}) {
  const { status, error, ingestedAt } = document.ingestion;
  const chunks = useDocumentChunks(document.id, ingestedAt);
  const ingesting = isIngesting(status);

  let notice: React.ReactNode = null;
  if (ingesting && !ingestedAt) {
    notice = (
      <Alert>
        <Loader2Icon className="motion-safe:animate-spin" aria-hidden />
        <AlertTitle>Indexing in progress</AlertTitle>
        <AlertDescription>The chunks appear here as soon as indexing finishes.</AlertDescription>
      </Alert>
    );
  } else if (ingesting) {
    notice = (
      <Alert>
        <Loader2Icon className="motion-safe:animate-spin" aria-hidden />
        <AlertTitle>Re-indexing</AlertTitle>
        <AlertDescription>
          These chunks come from the previous version. They refresh when indexing finishes.
        </AlertDescription>
      </Alert>
    );
  } else if (status === 'failed') {
    notice = (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden />
        <AlertTitle>Indexing failed</AlertTitle>
        <AlertDescription>{error ?? 'The last indexing run did not finish.'}</AlertDescription>
      </Alert>
    );
  } else if (hasUnsavedChanges) {
    notice = (
      <Alert>
        <InfoIcon aria-hidden />
        <AlertDescription>
          Chunks show the last saved version. Save your changes to re-index.
        </AlertDescription>
      </Alert>
    );
  }

  const items = chunks.data ?? [];
  const totalTokens = items.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0);

  return (
    <div className="grid gap-4">
      {notice}
      {chunks.isPending ? (
        <ChunksSkeleton />
      ) : chunks.isError && !chunks.data ? (
        <ErrorState
          error={chunks.error}
          title="Could not load the chunks"
          onRetry={() => void chunks.refetch()}
        />
      ) : items.length === 0 ? (
        !ingesting && (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            This document has no chunks yet.
          </p>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {pluralize(items.length, 'chunk')}, about {formatNumber(totalTokens)} tokens in total.
            Each chunk is embedded on its own; chat retrieves the chunks closest to a question and
            cites them.
          </p>
          <ol className="grid gap-3">
            {items.map((chunk) => (
              <ChunkCard key={chunk.id} chunk={chunk} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
