import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compiles the decorators with metadata, which Nest's dependency injection needs
// (esbuild, Vitest's default transformer, does not emit decorator metadata).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'integration', include: ['test/**/*.int.test.ts'], testTimeout: 30_000 },
      },
    ],
  },
});
