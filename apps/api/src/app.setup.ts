import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './common/http/request-id.middleware.js';
import type { AppConfig } from './config/app-config.js';

export const API_PREFIX = 'api';
export const JSON_BODY_LIMIT = '1mb';

const LOOPBACK_TWIN: Readonly<Record<string, string>> = {
  '127.0.0.1': 'localhost',
  localhost: '127.0.0.1',
};

/**
 * The web origin plus its twin on the other loopback name: http://127.0.0.1:3000 also
 * allows http://localhost:3000 and the reverse, since developers open either.
 */
export function allowedOrigins(webOrigin: string): string[] {
  const origin = new URL(webOrigin);
  const twin = LOOPBACK_TWIN[origin.hostname];
  if (!twin) return [origin.origin];
  const other = new URL(origin.href);
  other.hostname = twin;
  return [origin.origin, other.origin];
}

/**
 * HTTP-level setup shared by main.ts and the integration tests, so tests exercise
 * exactly what production runs. Order matters: Express runs these in sequence.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: allowedOrigins(config.webOrigin),
    exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
    maxAge: 600,
  });
  // Documents are capped at 200k characters; 1 MB leaves room for JSON escaping.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  // Lets providers finish work on SIGTERM / SIGINT (OnApplicationShutdown hooks).
  app.enableShutdownHooks();
}
