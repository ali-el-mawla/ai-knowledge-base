import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { UserMenu } from './user-menu';

/**
 * The signed-in frame: a top bar (menu button on mobile, app name, user menu), a sidebar on
 * md+ screens, and `main` as the scroll container. Pages fill `main`; a page that manages its
 * own scrolling (the chat) can use `h-full` and `overflow-hidden`.
 */
export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-3 focus:ring-ring/50"
      >
        Skip to content
      </a>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
        <MobileNav />
        <Link
          href="/documents"
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <AppLogo />
        </Link>
        <div className="ml-auto">
          <UserMenu email={email} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="hidden w-56 shrink-0 border-r bg-sidebar p-3 md:block">
          <NavLinks />
        </nav>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
