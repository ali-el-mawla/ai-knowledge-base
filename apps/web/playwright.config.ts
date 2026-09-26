import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke test: the whole stack in a real browser (see e2e/smoke.spec.ts).
 *
 * Local only, not part of `turbo run test` or CI: it needs the local Supabase, the embedding
 * model and a configured chat model, and it makes one short chat call. Servers already
 * listening on :3000 and :4000 (for example `npm run dev`) are reused; otherwise the API and
 * the web app are built and started in production mode, and stopped afterwards.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const WEB_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://127.0.0.1:4000/api';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  // Every run makes a real (paid) chat call: a failure should be looked at, not retried.
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // Wide enough (80rem and up) for the source panel to dock next to the chat thread.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      name: 'api',
      command: 'npx turbo run build --filter=@repo/api && npm run start --workspace=@repo/api',
      url: `${API_URL}/health`,
      cwd: repoRoot,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      name: 'web',
      command: 'npx turbo run build --filter=@repo/web && npm run start --workspace=@repo/web',
      url: `${WEB_URL}/login`,
      cwd: repoRoot,
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
