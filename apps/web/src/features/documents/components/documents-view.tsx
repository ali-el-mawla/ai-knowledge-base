'use client';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  Loader2Icon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { formatNumber, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDocuments } from '../queries';
import { DocumentRow } from './document-row';
import { DocumentListSkeleton } from './skeletons';
import { TagFilter } from './tag-filter';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MAX = 200;

type ListParam = 'q' | 'tag' | 'page';

/**
 * Filters live in the URL so a search can be shared and survives a reload. Next.js syncs
 * `history.replaceState` with `useSearchParams` without a server round trip.
 */
function setListParams(updates: Partial<Record<ListParam, string | null>>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function DocumentsView() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const tag = searchParams.get('tag') || null;
  const page = Math.max(1, Math.floor(Number(searchParams.get('page'))) || 1);

  // The input updates on every keystroke; the URL (and so the query) follows after a pause.
  const [searchText, setSearchText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    // The URL changed from outside the input (back button, a link): show its value.
    setSyncedQ(q);
    if (q !== searchText.trim()) setSearchText(q);
  }

  const debouncedSearch = useDebouncedCallback((text: string) => {
    setListParams({ q: text.trim() || null, page: null });
  }, SEARCH_DEBOUNCE_MS);

  const documents = useDocuments({
    q: q || undefined,
    tag: tag ?? undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const data = documents.data;
  const total = data?.total;
  const lastPage = total ? Math.ceil(total / PAGE_SIZE) : 1;

  // Deleting the last documents of the last page would leave an empty page: step back.
  useEffect(() => {
    if (total !== undefined && page > lastPage) {
      setListParams({ page: lastPage > 1 ? String(lastPage) : null });
    }
  }, [total, page, lastPage]);

  const selectTag = useCallback((next: string | null) => {
    setListParams({ tag: next, page: null });
  }, []);

  function goToPage(next: number) {
    setListParams({ page: next > 1 ? String(next) : null });
    document.getElementById('main')?.scrollTo({ top: 0 });
  }

  function clearSearch() {
    debouncedSearch.cancel();
    setSearchText('');
    setListParams({ q: null, page: null });
  }

  function clearFilters() {
    debouncedSearch.cancel();
    setSearchText('');
    setListParams({ q: null, tag: null, page: null });
  }

  const filtered = Boolean(q || tag);
  const updating = documents.isFetching && documents.isPlaceholderData;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              debouncedSearch.schedule(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && searchText) {
                event.preventDefault();
                clearSearch();
              }
            }}
            maxLength={SEARCH_MAX}
            placeholder="Search titles and content"
            aria-label="Search documents"
            className="h-9 pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
            {updating ? (
              <Loader2Icon
                className="mr-1.5 size-4 text-muted-foreground motion-safe:animate-spin"
                role="img"
                aria-label="Searching"
              />
            ) : (
              searchText && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <XIcon />
                </Button>
              )
            )}
          </div>
        </div>
        <TagFilter selected={tag} onSelect={selectTag} />
      </div>

      {documents.isPending ? (
        <DocumentListSkeleton />
      ) : !data ? (
        <ErrorState
          error={documents.error}
          title="Could not load your documents"
          onRetry={() => void documents.refetch()}
        />
      ) : data.total === 0 && !filtered ? (
        <EmptyState
          icon={FilePlus2Icon}
          title="No documents yet"
          description="Add a document to search it here and ask the chat about it."
          action={
            <Button asChild>
              <Link href="/documents/new">New document</Link>
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          title="No matching documents"
          description="Try other words, or clear the filters to see everything."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="documents-summary" className="grid gap-3">
          <p id="documents-summary" className="text-sm text-muted-foreground" aria-live="polite">
            {filtered
              ? `${pluralize(data.total, 'result')}${q ? ` for "${q}"` : ''}${tag ? ` tagged ${tag}` : ''}`
              : pluralize(data.total, 'document')}
          </p>
          <ul
            className={cn(
              'divide-y rounded-xl border bg-card transition-opacity',
              updating && 'opacity-60',
            )}
          >
            {data.items.map((doc) => (
              <DocumentRow key={doc.id} document={doc} onTagClick={selectTag} />
            ))}
          </ul>
          {data.total > PAGE_SIZE && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-1">
              <p className="text-sm text-muted-foreground">
                {formatNumber((page - 1) * PAGE_SIZE + 1)} to{' '}
                {formatNumber(Math.min(page * PAGE_SIZE, data.total))} of {formatNumber(data.total)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  <ChevronLeftIcon aria-hidden />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                  <ChevronRightIcon aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
