'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HOME_ROUTE } from '@/lib/auth-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** Supabase's `minimum_password_length` (supabase/config.toml). */
const PASSWORD_MIN = 6;

type Mode = 'login' | 'signup';

interface FieldErrors {
  email?: string;
  password?: string;
}

const COPY = {
  login: {
    submit: 'Sign in',
    pending: 'Signing in...',
    switchPrompt: 'New here?',
    switchLink: 'Create an account',
    switchHref: '/signup',
  },
  signup: {
    submit: 'Create account',
    pending: 'Creating account...',
    switchPrompt: 'Already have an account?',
    switchLink: 'Sign in',
    switchHref: '/login',
  },
} as const;

function validate(mode: Mode, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address, like name@example.com.';
  }
  if (!password) errors.password = 'Enter your password.';
  else if (mode === 'signup' && password.length < PASSWORD_MIN) {
    errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  }
  return errors;
}

/** Supabase's messages are terse; the common ones get a friendlier wording. */
function authErrorMessage(error: { code?: string; message: string; status?: number }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'The email or password is incorrect.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.';
    case 'weak_password':
      return `Choose a stronger password (at least ${PASSWORD_MIN} characters).`;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
  }
  if (!error.status)
    return 'Could not reach the sign-in service. Check your connection and try again.';
  return error.message;
}

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const copy = COPY[mode];
  const ids = { email: useId(), password: useId() };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const errors = validate(mode, email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      // Move focus to the first field that needs attention.
      document.getElementById(errors.email ? ids.email : ids.password)?.focus();
      return;
    }

    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setPending(false);
      setFormError(authErrorMessage(error));
      return;
    }
    if (!data.session) {
      // Only happens when email confirmation is turned on in Supabase.
      setPending(false);
      setNotice('Check your inbox and confirm your email address, then sign in.');
      return;
    }

    // A different user may have used this tab before: start from an empty cache.
    queryClient.clear();
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor={ids.email}>Email</Label>
        <Input
          id={ids.email}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
          disabled={pending}
        />
        {fieldErrors.email && (
          <p id={`${ids.email}-error`} className="text-sm text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={ids.password}>Password</Label>
        <Input
          id={ids.password}
          type="password"
          name="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password
              ? `${ids.password}-error`
              : mode === 'signup'
                ? `${ids.password}-hint`
                : undefined
          }
          disabled={pending}
        />
        {fieldErrors.password ? (
          <p id={`${ids.password}-error`} className="text-sm text-destructive">
            {fieldErrors.password}
          </p>
        ) : (
          mode === 'signup' && (
            <p id={`${ids.password}-hint`} className="text-sm text-muted-foreground">
              At least {PASSWORD_MIN} characters.
            </p>
          )
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {pending ? copy.pending : copy.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {copy.switchPrompt}{' '}
        <Link
          href={
            next === HOME_ROUTE
              ? copy.switchHref
              : `${copy.switchHref}?next=${encodeURIComponent(next)}`
          }
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {copy.switchLink}
        </Link>
      </p>
    </form>
  );
}
