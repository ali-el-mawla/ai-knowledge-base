import { type DynamicModule, Inject, Module } from '@nestjs/common';
import type { AppConfig } from './app-config.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** `constructor(@InjectConfig() private readonly config: AppConfig)` */
export const InjectConfig = (): ParameterDecorator => Inject(APP_CONFIG);

/**
 * The entry point (main.ts, a CLI or a test) validates the config before Nest starts, so
 * a bad `.env` fails with a readable list instead of a dependency-injection stack trace.
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
