import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PlusIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { DocumentsView } from '@/features/documents/components/documents-view';
import { DocumentsPageSkeleton } from '@/features/documents/components/skeletons';

export const metadata: Metadata = { title: 'Documents' };

export default function DocumentsPage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader
        title="Documents"
        description="Everything here is split into chunks and indexed for search and chat."
        actions={
          <Button asChild>
            <Link href="/documents/new">
              <PlusIcon aria-hidden />
              New document
            </Link>
          </Button>
        }
      />
      {/* DocumentsView reads the URL's query string, which is only known in the browser. */}
      <Suspense fallback={<DocumentsPageSkeleton />}>
        <DocumentsView />
      </Suspense>
    </div>
  );
}
