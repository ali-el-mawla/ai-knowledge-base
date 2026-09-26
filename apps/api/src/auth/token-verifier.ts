import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedError } from '../common/errors/app-errors.js';
import type { AppConfig } from '../config/app-config.js';
import { InjectConfig } from '../config/config.module.js';
import type { AuthUser } from './auth-user.js';

// Supabase signs with asymmetric keys (ES256 locally, RS256 on some hosted projects).
// Pinning the list rules out algorithm-confusion tricks such as "alg": "none" or HS256.
const ACCEPTED_ALGORITHMS = ['ES256', 'RS256'];

/**
 * Verifies Supabase access tokens locally against the project's public keys (JWKS):
 * signature, expiry, issuer and audience. No call to Supabase per request; jose caches
 * the key set and refetches it (rate limited) only when it sees an unknown key id.
 */
@Injectable()
export class TokenVerifier {
  private readonly keySet: ReturnType<typeof createRemoteJWKSet>;

  constructor(@InjectConfig() private readonly config: AppConfig) {
    this.keySet = createRemoteJWKSet(new URL(config.supabase.jwksUrl));
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.keySet, {
        issuer: this.config.supabase.issuer,
        audience: 'authenticated',
        algorithms: ACCEPTED_ALGORITHMS,
      }));
    } catch (error) {
      throw toAuthError(error);
    }
    if (!payload.sub) throw new UnauthorizedError('The access token has no subject.');
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      accessToken: token,
    };
  }
}

function toAuthError(error: unknown): unknown {
  // The key set could not be fetched: Supabase is down or misconfigured. That is our
  // failure (500), not the caller's token, and must not log the user out.
  if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid) return error;
  if (!(error instanceof errors.JOSEError)) return error;
  if (error instanceof errors.JWTExpired) {
    return new UnauthorizedError('The access token has expired.', { cause: error });
  }
  return new UnauthorizedError('The access token is invalid.', { cause: error });
}
