import { type DynamicModule, Inject, Module } from '@nestjs/common';
import type { AppConfig } from './app-config.js';

/** Injection token for the validated `AppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** `constructor(@InjectConfig() private readonly config: AppConfig)` */
export const InjectConfig = (): ParameterDecorator => Inject(APP_CONFIG);

/**
 * Provides the configuration everywhere. The config is loaded and validated by the
 * entry point (main.ts, a CLI or a test) before Nest starts, so a bad `.env` fails
 * with a readable list instead of a dependency-injection stack trace.
 */
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
