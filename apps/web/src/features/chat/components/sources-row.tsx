'use client';

import type { Source } from '@repo/shared';
import { useId, useState } from 'react';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type OpenSource, sourceLabel } from './citation-chip';

function SourceButton({
  source,
  cited,
  active,
  onOpen,
}: {
  source: Source;
  cited: boolean;
  active: boolean;
  onOpen: OpenSource;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={(event) => onOpen(source, event.currentTarget)}
        aria-pressed={active}
        title={sourceLabel(source)}
        className={cn(
          'inline-flex h-6 max-w-72 items-center gap-1.5 rounded-md border px-1.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          !cited && 'border-dashed text-muted-foreground',
          active && 'border-primary bg-muted text-foreground',
        )}
      >
        <span className="font-semibold tabular-nums">{source.index}</span>
        <span className="truncate">{source.documentTitle}</span>
        {!cited && <span className="sr-only">(retrieved, not cited)</span>}
      </button>
    </li>
  );
}

/**
 * The sources under an answer: the cited ones as chips, and the other retrieved passages
 * behind a toggle, so it stays visible what the model saw but chose not to use.
 */
export function SourcesRow({
  sources,
  cited,
  activeIndex,
  onOpenSource,
}: {
  sources: readonly Source[];
  /** Citation numbers the answer uses. */
  cited: readonly number[];
  activeIndex: number | null;
  onOpenSource: OpenSource;
}) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

  if (sources.length === 0) {
    return <p className="text-xs text-muted-foreground">No matching passages in your documents.</p>;
  }

  const citedSet = new Set(cited);
  const citedSources = sources.filter((source) => citedSet.has(source.index));
  const others = sources.filter((source) => !citedSet.has(source.index));
  const visible = showAll ? [...citedSources, ...others] : citedSources;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {citedSources.length > 0 ? 'Sources' : 'No sources cited'}
      </span>
      {visible.length > 0 && (
        // contents: the chips flow on from the label like words, instead of the whole list
        // dropping to the next line and leaving "Sources" alone on the first.
        <ul id={listId} className="contents" aria-label="Sources">
          {visible.map((source) => (
            <SourceButton
              key={source.chunkId}
              source={source}
              cited={citedSet.has(source.index)}
              active={activeIndex === source.index}
              onOpen={onOpenSource}
            />
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          aria-controls={visible.length > 0 ? listId : undefined}
          // -mx-1.5: the text lines up with "Sources" when the row wraps.
          className="-mx-1.5 h-6 rounded-md px-1.5 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showAll ? 'Show cited only' : `${pluralize(others.length, 'more passage')} retrieved`}
        </button>
      )}
    </div>
  );
}
