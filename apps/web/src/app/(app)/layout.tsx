import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Layout for every signed-in page. The proxy already redirects signed-out visitors. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  // Defence in depth, in case the proxy matcher ever stops covering a route.
  if (!data?.claims) redirect('/login');

  return <AppShell email={data.claims.email ?? ''}>{children}</AppShell>;
}
