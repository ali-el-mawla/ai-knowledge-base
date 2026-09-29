import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type AppConfig, ConfigError, loadAppConfig } from '../config/app-config.js';
import { IngestionQueue } from '../ingestion/ingestion-queue.js';
import type { IngestionOutcome } from '../ingestion/ingestion.service.js';
import { IngestionWorker } from '../ingestion/ingestion.worker.js';
import { SchemaMismatchError } from '../supabase/embedding-dimensions.check.js';
import { CliModule } from './cli.module.js';

/** A failure the operator can fix from its message alone; printed without a stack. */
export class CliError extends Error {
  override readonly name = 'CliError';
}

/** Returns whether the command succeeded; false sets a non-zero exit code. */
export type CliTask = (app: INestApplicationContext, config: AppConfig) => Promise<boolean>;

/**
 * Runs a command inside a Nest application context (the API's providers, no HTTP
 * server). Prints operator errors without a stack, sets the exit code and always closes
 * the context, which lets the ingestion worker finish its current job.
 */
export async function runCli(task: CliTask): Promise<void> {
  let app: INestApplicationContext | undefined;
  try {
    const config = loadAppConfig(process.env);
    app = await NestFactory.createApplicationContext(CliModule.forRoot(config), {
      // The command prints its own progress; Nest's start-up lines would bury it.
      logger: ['error', 'warn'],
      abortOnError: false,
    });
    process.exitCode = (await task(app, config)) ? 0 : 1;
  } catch (error) {
    const readable =
      error instanceof ConfigError ||
      error instanceof SchemaMismatchError ||
      error instanceof CliError;
    console.error(readable ? `\n${error.message}\n` : error);
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

/** The ingestion worker behind the IngestionQueue binding (CLIs need `idle()`). */
export function ingestionWorker(app: INestApplicationContext): IngestionWorker {
  const queue = app.get(IngestionQueue);
  if (!(queue instanceof IngestionWorker)) {
    throw new Error('IngestionQueue is not bound to IngestionWorker');
  }
  return queue;
}

export interface IngestionTotals {
  ready: number;
  failed: number;
  chunks: number;
  embedded: number;
  reused: number;
}

export function sumOutcomes(outcomes: Iterable<IngestionOutcome>): IngestionTotals {
  const totals: IngestionTotals = { ready: 0, failed: 0, chunks: 0, embedded: 0, reused: 0 };
  for (const outcome of outcomes) {
    if (outcome.status === 'failed') totals.failed += 1;
    if (outcome.status !== 'ready') continue;
    totals.ready += 1;
    totals.chunks += outcome.chunks;
    totals.embedded += outcome.embedded;
    totals.reused += outcome.reused;
  }
  return totals;
}

export function describeOutcome(outcome: IngestionOutcome, label: string): string {
  switch (outcome.status) {
    case 'ready':
      return `  ready    ${label}: ${outcome.chunks} chunks, embedded ${outcome.embedded}, reused ${outcome.reused} (${outcome.durationMs} ms)`;
    case 'skipped':
      return `  skipped  ${label}: ${outcome.reason.replace('_', ' ')}`;
    case 'failed':
      return `  FAILED   ${label}: ${outcome.error}`;
  }
}

export function seconds(startedAt: number): string {
  return `${((performance.now() - startedAt) / 1000).toFixed(1)} s`;
}
