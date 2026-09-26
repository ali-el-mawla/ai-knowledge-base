import { describe, expect, it } from 'vitest';
import { safeNextPath } from './auth-routes';

describe('safeNextPath', () => {
  it('keeps same-site paths with their query string', () => {
    expect(safeNextPath('/documents/42?tab=chunks')).toBe('/documents/42?tab=chunks');
  });

  it.each([null, '', 'https://evil.test', '//evil.test/x', '/\\evil.test', 'documents'])(
    'falls back to /documents for %j',
    (next) => {
      expect(safeNextPath(next)).toBe('/documents');
    },
  );

  it('never sends a signed-in user back to an auth page', () => {
    expect(safeNextPath('/login?next=/chat')).toBe('/documents');
  });
});
