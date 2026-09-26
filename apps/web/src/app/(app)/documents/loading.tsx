import { Skeleton } from '@/components/ui/skeleton';
import { DocumentsPageSkeleton } from '@/features/documents/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <DocumentsPageSkeleton />
    </div>
  );
}
