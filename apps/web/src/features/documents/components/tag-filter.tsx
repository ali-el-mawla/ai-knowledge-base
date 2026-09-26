'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTags } from '../queries';

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/** One chip per tag (with its document count) plus "All". Selecting a chip again clears it. */
export function TagFilter({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const tags = useTags();

  if (tags.isPending) {
    return (
      <div className="flex gap-1.5" aria-hidden>
        <Skeleton className="h-7 w-12 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
    );
  }

  const items = tags.data ?? [];
  // A tag from the URL that no document uses any more still shows, so it can be cleared.
  const list =
    selected && !items.some(({ tag }) => tag === selected)
      ? [...items, { tag: selected, count: 0 }]
      : items;
  if (list.length === 0) return null;

  return (
    <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
      <FilterChip pressed={selected === null} onClick={() => onSelect(null)}>
        All
      </FilterChip>
      {list.map(({ tag, count }) => (
        <FilterChip
          key={tag}
          pressed={selected === tag}
          onClick={() => onSelect(selected === tag ? null : tag)}
        >
          {tag}
          <span
            className={cn(
              'tabular-nums',
              selected === tag ? 'opacity-70' : 'text-muted-foreground',
            )}
          >
            {formatNumber(count)}
          </span>
        </FilterChip>
      ))}
    </div>
  );
}
