import Link from 'next/link';
import { FileQuestionIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestionIcon className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/documents">Go to documents</Link>
      </Button>
    </main>
  );
}
