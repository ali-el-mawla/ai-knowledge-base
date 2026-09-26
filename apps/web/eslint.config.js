import next from '@repo/eslint-config/next';

// Playwright writes its HTML report (bundled JavaScript) and failure artifacts here.
const config = [{ ignores: ['playwright-report/**', 'test-results/**'] }, ...next];

export default config;
