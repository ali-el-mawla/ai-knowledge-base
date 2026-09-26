'use client';

import type { DocumentSummary } from '@repo/shared';
import Link from 'next/link';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { DocumentStatusBadge } from './document-status-badge';

/**
 * One document in the list. The title link stretches over the whole row (so the row is one
 * click target), while the status badge and tag buttons sit above it and stay interactive.
 */
export function DocumentRow({
  document,
  onTagClick,
}: {
  document: DocumentSummary;
  onTagClick: (tag: string) => void;
}) {
  return (
    <li className="relative grid gap-1.5 px-4 py-3.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50 has-[a:focus-visible]:bg-muted/50">
      <div className="flex items-start gap-3">
        {/* Up to two lines rather than one truncated line, so a phone shows the title.
            (A single nowrap line also counted its full width as the minimum width of every
            grid around it, which pushed the whole page sideways on phones.) */}
        <h2 className="line-clamp-2 min-w-0 flex-1 text-sm font-medium wrap-anywhere sm:text-base">
          <Link
            href={`/documents/${document.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
          >
            {document.title}
          </Link>
        </h2>
        <DocumentStatusBadge ingestion={document.ingestion} className="relative z-10 shrink-0" />
      </div>
      {/* The API already turns the start of the markdown into plain text. */}
      {document.excerpt && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{document.excerpt}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-xs text-muted-foreground">
        {document.tags.length > 0 && (
          <ul className="relative z-10 flex flex-wrap gap-1.5" aria-label="Tags">
            {document.tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => onTagClick(tag)}
                  title={`Show documents tagged ${tag}`}
                  className="inline-flex h-5 items-center rounded-md bg-secondary px-1.5 font-medium text-secondary-foreground outline-none hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
        <time
          className="ml-auto whitespace-nowrap"
          dateTime={document.updatedAt}
          title={formatDateTime(document.updatedAt)}
        >
          Updated {formatRelativeTime(document.updatedAt)}
        </time>
      </div>
    </li>
  );
}
