import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthRoute, safeNextPath } from '@/lib/auth-routes';
import { getPublicEnv } from '@/lib/env';

/**
 * Runs before every page request: refreshes the Supabase session cookies, sends signed-out
 * visitors to /login (with `next` set to where they were going), and sends signed-in users
 * away from /login and /signup.
 *
 * This is an optimistic check for navigation. The API verifies the token on every data request.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims() validates the JWT signature (against the project's JWKS) and refreshes an
  // expired session. Nothing may run between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return redirectKeepingCookies(url, response);
  }

  if (signedIn && isAuthRoute(pathname)) {
    // Already signed in (another tab, the back button): go where the login was leading.
    const target = safeNextPath(request.nextUrl.searchParams.get('next'));
    return redirectKeepingCookies(new URL(target, request.url), response);
  }

  return response;
}

/** A redirect must carry the refreshed auth cookies, or the browser keeps the stale session. */
function redirectKeepingCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  const cacheControl = from.headers.get('Cache-Control');
  if (cacheControl) redirect.headers.set('Cache-Control', cacheControl);
  return redirect;
}

export const config = {
  matcher: [
    // Every page, but not Next.js internals or static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
