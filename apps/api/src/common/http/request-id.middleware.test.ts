import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AppRequest } from './app-request.js';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware.js';

function run(incoming?: string) {
  const request = {
    get: (name: string) => (name === REQUEST_ID_HEADER ? incoming : undefined),
  } as AppRequest;
  const setHeader = vi.fn();
  const next = vi.fn();
  requestIdMiddleware(request, { setHeader } as unknown as Response, next);
  return { request, setHeader, next };
}

describe('requestIdMiddleware', () => {
  it('reuses a safe incoming id and echoes it', () => {
    const { request, setHeader, next } = run('web-1234.abc_def');
    expect(request.requestId).toBe('web-1234.abc_def');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'web-1234.abc_def');
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when none is sent', () => {
    const { request } = run();
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces ids that could forge log lines', () => {
    const { request } = run('abc\n[req-1] GET /admin -> 200');
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
