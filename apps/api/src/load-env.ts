import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Side-effect module: loads the monorepo's single root `.env` into `process.env`.
 * Imported first by every entry point so configuration exists before any module reads it.
 * Variables already set in the real environment win (Node does not overwrite them),
 * so CI and production can inject configuration without a file.
 */
// src/ and dist/ sit at the same depth, so the same relative path works in both.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
