import { Injectable } from '@nestjs/common';
import { minutes, ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppRequest } from '../http/app-request.js';

/**
 * Generous default for every route: 300 requests per minute, per route, per caller.
 * A stricter limit for one route overrides it on the handler, e.g. for chat:
 * `@Throttle({ default: { limit: 20, ttl: minutes(1) } })`.
 */
export const RATE_LIMIT_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [{ name: 'default', ttl: minutes(1), limit: 300 }],
  errorMessage: 'Too many requests. Wait a moment and try again.',
};

/**
 * Limits signed-in callers per user id (several users can share one IP) and anonymous
 * callers per IP. Registered after the auth guard, so `request.user` is already set.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as AppRequest;
    const tracker = request.user ? `user:${request.user.id}` : `ip:${request.ip ?? 'unknown'}`;
    return Promise.resolve(tracker);
  }
}
