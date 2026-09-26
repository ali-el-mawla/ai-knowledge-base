import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { safeNextPath } from '@/lib/auth-routes';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { next } = await searchParams;
  return (
    <div className="grid gap-6">
      <header className="grid gap-1 text-center">
        <h1 className="text-xl font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">Your documents are private to your account.</p>
      </header>
      <AuthForm mode="signup" next={safeNextPath(typeof next === 'string' ? next : null)} />
    </div>
  );
}
