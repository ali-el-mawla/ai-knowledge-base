import { Module } from '@nestjs/common';
import { TokenVerifier } from './token-verifier.js';

/**
 * Token verification. `SupabaseAuthGuard` is registered as a global guard by AppModule,
 * next to the rate limiter, so the order of the two is explicit in one place.
 */
@Module({
  providers: [TokenVerifier],
  exports: [TokenVerifier],
})
export class AuthModule {}
