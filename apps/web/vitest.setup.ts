import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount rendered trees between tests (automatic only when Vitest globals are enabled).
afterEach(cleanup);
