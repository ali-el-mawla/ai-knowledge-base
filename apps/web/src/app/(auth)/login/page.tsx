import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { safeNextPath } from '@/lib/auth-routes';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  return (
    <div className="grid gap-6">
      <header className="grid gap-1 text-center">
        <h1 className="text-xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your knowledge base.</p>
      </header>
      <AuthForm mode="login" next={safeNextPath(typeof next === 'string' ? next : null)} />
    </div>
  );
}
