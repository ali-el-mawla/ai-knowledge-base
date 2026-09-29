// Must stay the first import: it loads the root .env before any other module runs.
import './load-env.js';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp } from './app.setup.js';
import { ConfigError, loadAppConfig } from './config/app-config.js';
import { SchemaMismatchError } from './supabase/embedding-dimensions.check.js';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    // Rethrow startup errors to the catch below instead of aborting the process.
    abortOnError: false,
  });
  configureApp(app, config);
  await app.listen(config.port, config.host);
  new Logger('Bootstrap').log(
    `API listening on http://${config.host}:${config.port}/${API_PREFIX}`,
  );
}

bootstrap().catch((error: unknown) => {
  // Configuration and schema problems are operator errors: print the fix, not a stack.
  if (error instanceof ConfigError || error instanceof SchemaMismatchError) {
    console.error(`\n${error.message}\n`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
