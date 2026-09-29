'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon, LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const initial = email.charAt(0).toUpperCase() || '?';

  async function signOut() {
    setSigningOut(true);
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) {
      setSigningOut(false);
      toast.error('Could not sign out', { description: error.message });
      return;
    }
    // The next user of this tab starts with an empty cache.
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:pr-2.5" aria-label="Account menu">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
            aria-hidden
          >
            {initial}
          </span>
          <span className="hidden max-w-48 truncate text-sm font-normal text-muted-foreground sm:inline">
            {email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="text-xs text-muted-foreground">Signed in as</span>
          <span className="truncate text-sm font-medium text-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            // Keep the menu open so the pending state is visible until the redirect.
            event.preventDefault();
            void signOut();
          }}
        >
          {signingOut ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <LogOutIcon aria-hidden />
          )}
          {signingOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
