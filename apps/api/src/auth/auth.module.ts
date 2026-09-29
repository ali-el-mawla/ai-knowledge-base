import { Module } from '@nestjs/common';
import { TokenVerifier } from './token-verifier.js';

/**
 * `SupabaseAuthGuard` is registered as a global guard in AppModule, next to the rate
 * limiter, so their order is visible in one place.
 */
@Module({
  providers: [TokenVerifier],
  exports: [TokenVerifier],
})
export class AuthModule {}
