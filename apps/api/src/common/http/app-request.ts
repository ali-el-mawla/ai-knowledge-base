import type { Request } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';

export interface AppRequest extends Request {
  /** Set by `requestIdMiddleware` before anything else runs. */
  requestId?: string;
  /** Set by `SupabaseAuthGuard` on every non-public route. */
  user?: AuthUser;
}
