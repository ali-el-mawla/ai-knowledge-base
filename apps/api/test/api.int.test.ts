import type { AiInfo, ApiErrorBody, Document, HealthResponse } from '@repo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, startTestApp, type TestApp } from './support/app.js';
import {
  config,
  createTestUser,
  deleteTestUsers,
  type TestUser,
  writeChunksAsWorker,
} from './support/supabase.js';

let testApp: TestApp;
let alice: TestUser;
let bob: TestUser;
let anonymous: ApiClient;

beforeAll(async () => {
  [testApp, alice, bob] = await Promise.all([
    startTestApp(),
    createTestUser('alice'),
    createTestUser('bob'),
  ]);
  anonymous = new ApiClient(testApp.baseUrl);
});

afterAll(async () => {
  await testApp?.close();
  await deleteTestUsers(alice, bob);
});

/** Same header and signature, different claims: what an attacker could build. */
function withForgedSubject(token: string, sub: string): string {
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as object;
  const forged = Buffer.from(JSON.stringify({ ...claims, sub })).toString('base64url');
  return [header, forged, signature].join('.');
}

describe('health', () => {
  it('is public and reports the database and model configuration', async () => {
    const response = await anonymous.get<HealthResponse>('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      db: { reachable: true },
      embedding: {
        provider: config.ai.embedding.preset.name,
        model: config.ai.embedding.model,
        reachable: null,
      },
      chat: { configured: config.ai.chat !== null },
    });
  });
});

describe('authentication', () => {
  it('rejects a request without a token', async () => {
    const response = await anonymous.get<ApiErrorBody>('/documents');
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      requestId: response.headers.get('x-request-id'),
    });
  });

  it('rejects a malformed token', async () => {
    const response = await new ApiClient(testApp.baseUrl, 'not-a-jwt').get<ApiErrorBody>(
      '/documents',
    );
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token whose claims were tampered with', async () => {
    const forged = withForgedSubject(alice.token, bob.id);
    const response = await new ApiClient(testApp.baseUrl, forged).get<ApiErrorBody>('/documents');
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'The access token is invalid.',
    });
  });

  it('accepts a real Supabase access token', async () => {
    const response = await new ApiClient(testApp.baseUrl, alice.token).get('/documents');
    expect(response.status).toBe(200);
  });
});

describe('error contract', () => {
  it('echoes a caller-supplied request id in the header and the body', async () => {
    const response = await anonymous.get<ApiErrorBody>('/documents', {
      headers: { 'x-request-id': 'web-trace-123' },
    });
    expect(response.headers.get('x-request-id')).toBe('web-trace-123');
    expect(response.body.error.requestId).toBe('web-trace-123');
  });

  it('answers unknown routes with NOT_FOUND', async () => {
    const response = await new ApiClient(testApp.baseUrl, alice.token).get<ApiErrorBody>(
      '/nothing-here',
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('answers malformed JSON with BAD_REQUEST', async () => {
    const response = await new ApiClient(testApp.baseUrl, alice.token).post<ApiErrorBody>(
      '/documents',
      undefined,
      { rawBody: '{"title": ' },
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'BAD_REQUEST',
      requestId: expect.any(String),
    });
  });

  it('refuses bodies over 1 MB with PAYLOAD_TOO_LARGE', async () => {
    const response = await new ApiClient(testApp.baseUrl, alice.token).post<ApiErrorBody>(
      '/documents',
      undefined,
      { rawBody: JSON.stringify({ title: 'Big', content: 'x'.repeat(1_100_000) }) },
    );
    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      requestId: expect.any(String),
    });
  });
});

describe('CORS', () => {
  async function preflight(origin: string): Promise<Response> {
    return fetch(`${testApp.baseUrl}/documents`, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
  }

  it('allows the web origin and its localhost twin', async () => {
    const [primary, twin] = await Promise.all([
      preflight('http://127.0.0.1:3000'),
      preflight('http://localhost:3000'),
    ]);
    expect(primary.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:3000');
    expect(twin.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('does not allow other origins', async () => {
    const response = await preflight('https://evil.example');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('ai info', () => {
  it("reports the active models and counts only the caller's stale chunks", async () => {
    const asAlice = new ApiClient(testApp.baseUrl, alice.token);
    const created = await asAlice.post<Document>('/documents', {
      title: 'Embedded with an old model',
      content: 'Old vectors.',
    });
    await writeChunksAsWorker(
      created.body.id,
      1,
      [
        { chunkIndex: 0, content: 'Old vectors.' },
        { chunkIndex: 1, content: 'More old vectors.' },
      ],
      'retired-embedding-model',
    );

    const forAlice = await asAlice.get<AiInfo>('/ai/info');
    expect(forAlice.status).toBe(200);
    expect(forAlice.body).toMatchObject({
      embedding: {
        provider: config.ai.embedding.preset.name,
        model: config.ai.embedding.model,
        dimensions: config.ai.embedding.dimensions,
      },
      staleChunks: 2,
    });

    const forBob = await new ApiClient(testApp.baseUrl, bob.token).get<AiInfo>('/ai/info');
    expect(forBob.body.staleChunks).toBe(0);
  });

  it('requires authentication', async () => {
    expect((await anonymous.get('/ai/info')).status).toBe(401);
  });
});
