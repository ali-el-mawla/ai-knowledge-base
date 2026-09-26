import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// One .env at the repository root configures both apps.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnvConfig(repoRoot);

const nextConfig: NextConfig = {
  // Pins the workspace root so Turbopack does not guess it from lockfiles.
  turbopack: { root: repoRoot },
};

export default nextConfig;
