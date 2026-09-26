import { LibraryBigIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const APP_NAME = 'Knowledge Base';

/** The app mark and name, used in the top bar and on the sign-in pages. */
export function AppLogo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <LibraryBigIcon className="size-4" aria-hidden />
      </span>
      {APP_NAME}
    </span>
  );
}
