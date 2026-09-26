/**
 * Public configuration. Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle at
 * build time, which only works when each one is referenced literally as below.
 */
export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiUrl: string;
}

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  cached ??= {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    apiUrl: required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL).replace(/\/+$/, ''),
  };
  return cached;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Run \`npm run setup\` or fill it in the root .env file.`);
  }
  return value;
}
