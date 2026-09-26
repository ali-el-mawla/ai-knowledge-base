import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '../common/errors/app-errors.js';
import type { AppRequest } from '../common/http/app-request.js';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { extractBearerToken, SupabaseAuthGuard } from './supabase-auth.guard.js';
import type { TokenVerifier } from './token-verifier.js';

const user: AuthUser = { id: 'user-1', email: 'a@example.test', accessToken: 'token-abc' };

function setup(options: { isPublic?: boolean; authorization?: string }) {
  const request = { headers: { authorization: options.authorization } } as AppRequest;
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
    key === IS_PUBLIC_KEY ? options.isPublic : undefined,
  );
  const verify = vi.fn<(token: string) => Promise<AuthUser>>().mockResolvedValue(user);
  const guard = new SupabaseAuthGuard(reflector, { verify } as unknown as TokenVerifier);
  return { guard, context, request, verify };
}

describe('extractBearerToken', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
    ['Basic abc', null],
    ['Bearer', null],
    ['Bearer a b', null],
    [undefined, null],
  ])('%j -> %j', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe('SupabaseAuthGuard', () => {
  it('lets public routes through without a token', async () => {
    const { guard, context, verify } = setup({ isPublic: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects a request without a bearer token', async () => {
    const { guard, context } = setup({});
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('verifies the token and exposes the user on the request', async () => {
    const { guard, context, request, verify } = setup({ authorization: 'Bearer token-abc' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('token-abc');
    expect(request.user).toEqual(user);
  });

  it('propagates verification failures', async () => {
    const { guard, context, verify } = setup({ authorization: 'Bearer expired' });
    verify.mockRejectedValue(new UnauthorizedError('The access token has expired.'));
    await expect(guard.canActivate(context)).rejects.toThrow('The access token has expired.');
  });
});
