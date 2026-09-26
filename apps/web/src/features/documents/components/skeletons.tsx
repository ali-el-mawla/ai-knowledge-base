import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholders shaped like the real content, so nothing jumps when data arrives.
 * Server-safe: used both by route `loading.tsx` files and by client components.
 */
export function DocumentListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading documents" className="grid gap-4">
      <Skeleton className="h-5 w-32" />
      <ul className="divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="grid gap-2.5 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 flex-1 sm:max-w-sm" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="ml-auto h-4 w-28" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocumentsPageSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-1.5">
        <Skeleton className="h-7 w-12 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <DocumentListSkeleton />
    </div>
  );
}

/** Mirrors the editor: the sticky toolbar, then title, tags and the content area. */
export function EditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading document">
      <div className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4 sm:px-6">
          <Skeleton className="size-8" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="ml-auto h-8 w-32" />
        </div>
      </div>
      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6 sm:px-6">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="grid gap-3">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-[28rem] w-full" />
        </div>
      </div>
    </div>
  );
}
