import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../common/http/app-request.js';
import type { AuthUser } from './auth-user.js';

/** The verified caller: `handler(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AppRequest>();
    // Only possible when a @Public() route asks for the user: a programming error.
    if (!user) throw new Error('@CurrentUser() used on a route that skips authentication');
    return user;
  },
);
