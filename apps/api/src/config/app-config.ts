import { AiConfigError, loadAiConfig, type AiConfig } from '@repo/ai';
import { z } from 'zod';

/** Validated, typed configuration. Built once at startup and injected with `@InjectConfig()`. */
export interface AppConfig {
  port: number;
  /** Interface the API listens on: 127.0.0.1 by default, 0.0.0.0 in a container. */
  host: string;
  /** Origin of the web app, allowed by CORS. */
  webOrigin: string;
  supabase: {
    url: string;
    /** Browser-safe key; every request made with it is subject to RLS. */
    publishableKey: string;
    /** Bypasses RLS. Only the admin client (worker, CLIs, system checks) uses it. */
    secretKey: string;
    /** Exact `iss` claim of this project's access tokens. */
    issuer: string;
    jwksUrl: string;
  };
  ai: AiConfig;
}

type Env = Record<string, string | undefined>;

/** Startup configuration problems, all of them at once, so one restart fixes everything. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';

  constructor(readonly problems: string[]) {
    super(
      [
        'Invalid configuration. Fix these variables in the root .env (.env.example documents each one):',
        ...problems.map((problem) => `  - ${problem}`),
      ].join('\n'),
    );
  }
}

// An empty value in .env ("API_PORT=") means "not set", so the default applies.
const blankAsUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const requiredString = z.preprocess(
  blankAsUndefined,
  z.string({ error: 'is not set' }).trim().min(1, 'is not set'),
);

const httpUrl = z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' });

const envSchema = z.object({
  SUPABASE_URL: z.preprocess(blankAsUndefined, httpUrl),
  SUPABASE_PUBLISHABLE_KEY: requiredString,
  SUPABASE_SECRET_KEY: requiredString,
  API_PORT: z.preprocess(
    blankAsUndefined,
    z.coerce
      .number({ error: 'must be a port number' })
      .int('must be a port number')
      .min(0, 'must be a port number')
      .max(65535, 'must be a port number')
      .default(4000),
  ),
  API_HOST: z.preprocess(blankAsUndefined, z.string().trim().default('127.0.0.1')),
  WEB_ORIGIN: z.preprocess(blankAsUndefined, httpUrl.default('http://127.0.0.1:3000')),
});

/** Throws a `ConfigError` listing every problem. Pure, so tests can pass any env object. */
export function loadAppConfig(env: Env): AppConfig {
  const problems: string[] = [];

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    problems.push(
      ...parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    );
  }

  let ai: AiConfig | null = null;
  try {
    ai = loadAiConfig(env);
  } catch (error) {
    if (!(error instanceof AiConfigError)) throw error;
    problems.push(error.message);
  }

  if (!parsed.success || !ai) throw new ConfigError(problems);

  const supabaseUrl = parsed.data.SUPABASE_URL.replace(/\/+$/, '');
  return {
    port: parsed.data.API_PORT,
    host: parsed.data.API_HOST,
    webOrigin: new URL(parsed.data.WEB_ORIGIN).origin,
    supabase: {
      url: supabaseUrl,
      publishableKey: parsed.data.SUPABASE_PUBLISHABLE_KEY,
      secretKey: parsed.data.SUPABASE_SECRET_KEY,
      // Tokens must carry this issuer exactly (host included: 127.0.0.1 is not localhost).
      issuer: `${supabaseUrl}/auth/v1`,
      jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    },
    ai,
  };
}
