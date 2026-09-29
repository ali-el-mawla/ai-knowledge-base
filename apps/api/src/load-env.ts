import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the root `.env` into `process.env`; every entry point imports it first.
 * Variables already set in the environment win (Node does not overwrite them), so CI
 * and production can inject configuration without a file.
 */
// src/ and dist/ sit at the same depth, so the same relative path works in both.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
