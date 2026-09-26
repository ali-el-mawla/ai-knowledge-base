import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '../common/errors/app-errors.js';
import type { AppRequest } from '../common/http/app-request.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { TokenVerifier } from './token-verifier.js';

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function extractBearerToken(header: string | undefined): string | null {
  const match = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  return match?.[1] ?? null;
}

/**
 * Global guard: every route requires a valid Supabase access token unless marked
 * `@Public()`. On success the caller is available as `@CurrentUser()`.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedError(
        'Missing access token. Send "Authorization: Bearer <Supabase access token>".',
      );
    }
    request.user = await this.verifier.verify(token);
    return true;
  }
}
