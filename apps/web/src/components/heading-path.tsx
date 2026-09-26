import { ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The heading trail of a chunk ("Leave > Parental leave") as a compact breadcrumb. */
export function HeadingPath({ path, className }: { path: string; className?: string }) {
  if (!path) {
    return (
      <span className={cn('text-muted-foreground italic', className)}>
        Before the first heading
      </span>
    );
  }
  const parts = path.split(' > ');
  return (
    <ol
      className={cn('flex min-w-0 items-center gap-1 overflow-hidden', className)}
      aria-label="Section"
    >
      {parts.map((part, i) => (
        <li key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && (
            <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span
            className={cn(
              'truncate',
              i === parts.length - 1 ? 'font-medium' : 'text-muted-foreground',
            )}
          >
            {part}
          </span>
        </li>
      ))}
    </ol>
  );
}
