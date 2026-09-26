'use client';

import type { Source } from '@repo/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type OpenSource = (source: Source, trigger: HTMLElement) => void;

/** Where the source came from, in one line: "Employee Handbook, Leave > Parental leave". */
export function sourceLabel(source: Source): string {
  return source.headingPath
    ? `${source.documentTitle}, ${source.headingPath}`
    : source.documentTitle;
}

/** A citation marker in an answer: a small numbered badge that opens its source. */
export function CitationChip({
  source,
  active,
  onOpen,
}: {
  source: Source;
  active: boolean;
  onOpen: OpenSource;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => onOpen(source, event.currentTarget)}
          aria-label={`Source ${source.index}: ${sourceLabel(source)}`}
          aria-pressed={active}
          data-citation-chip=""
          className={cn(
            'mx-px inline-flex h-[1.35em] min-w-[1.35em] items-center justify-center rounded-[0.3rem] px-[0.3em] font-sans text-[0.68rem] leading-none font-semibold tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground',
          )}
        >
          {source.index}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 flex-col items-start gap-0.5">
        <span className="font-medium">{source.documentTitle}</span>
        {source.headingPath && <span className="opacity-80">{source.headingPath}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
