import { AppLogo } from '@/components/brand/app-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-12">
      <AppLogo className="text-lg" />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
