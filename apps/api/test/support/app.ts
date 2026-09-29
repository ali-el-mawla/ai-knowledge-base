import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { IngestionQueue } from '../../src/ingestion/ingestion-queue.js';
import { config } from './supabase.js';

/** Stands in for the ingestion worker, so tests can assert what was queued. */
export class RecordingIngestionQueue extends IngestionQueue {
  readonly enqueued: string[] = [];

  enqueue(documentId: string): void {
    this.enqueued.push(documentId);
  }

  countFor(documentId: string): number {
    return this.enqueued.filter((id) => id === documentId).length;
  }
}

export interface TestApp {
  baseUrl: string;
  ingestion: RecordingIngestionQueue;
  close(): Promise<void>;
}

/**
 * Boots the real application (same module graph and HTTP setup as main.ts) on an
 * ephemeral port. Only the ingestion queue is replaced.
 */
export async function startTestApp(): Promise<TestApp> {
  const ingestion = new RecordingIngestionQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(IngestionQueue)
    .useValue(ingestion)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: ['error', 'warn'],
  });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    ingestion,
    close: () => app.close(),
  };
}

export interface ApiResponse<T> {
  status: number;
  headers: Headers;
  body: T;
}

interface RequestOptions {
  body?: unknown;
  /** Sent as-is, for malformed or oversized payloads. */
  rawBody?: string;
  headers?: Record<string, string>;
}

/** A fetch wrapper that plays the web app: JSON in and out, optional bearer token. */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, { body });
  }

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path);
  }

  async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const payload =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (payload !== undefined) headers['content-type'] ??= 'application/json';

    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: payload });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: (text ? JSON.parse(text) : undefined) as T,
    };
  }
}
