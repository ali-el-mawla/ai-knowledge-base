import type { Request } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';

/** The Express request plus what this API attaches to it. */
export interface AppRequest extends Request {
  /** Set by `requestIdMiddleware` before anything else runs. */
  requestId?: string;
  /** Set by `SupabaseAuthGuard` on every non-public route. */
  user?: AuthUser;
}
