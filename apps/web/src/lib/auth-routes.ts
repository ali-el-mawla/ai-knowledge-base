/** Pages for signed-out visitors. Everything else requires a session. */
export const AUTH_ROUTES = ['/login', '/signup'] as const;

/** Where signed-in users land by default. */
export const HOME_ROUTE = '/documents';

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Validates the `next` parameter used to return to a page after signing in. Only same-site
 * paths are accepted, so the login page cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return HOME_ROUTE;
  }
  const pathname = next.split(/[?#]/, 1)[0] ?? '';
  return isAuthRoute(pathname) ? HOME_ROUTE : next;
}
