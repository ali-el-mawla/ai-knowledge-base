import { describe, expect, it } from 'vitest';
import { ConfigError, loadAppConfig } from './app-config.js';

const validEnv = {
  SUPABASE_URL: 'http://127.0.0.1:54321/',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  EMBEDDING_PROVIDER: 'ollama',
  EMBEDDING_MODEL: 'nomic-embed-text',
  EMBEDDING_DIMENSIONS: '768',
};

function captureConfigError(env: Record<string, string | undefined>): ConfigError {
  try {
    loadAppConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected a ConfigError');
}

describe('loadAppConfig', () => {
  it('applies defaults and derives the auth endpoints', () => {
    const config = loadAppConfig(validEnv);
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.webOrigin).toBe('http://127.0.0.1:3000');
    expect(config.supabase).toEqual({
      url: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_test',
      secretKey: 'sb_secret_test',
      issuer: 'http://127.0.0.1:54321/auth/v1',
      jwksUrl: 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json',
    });
    expect(config.ai.embedding.dimensions).toBe(768);
    expect(config.ai.chat).toBeNull();
  });

  it('treats empty values as unset and normalises the web origin', () => {
    const config = loadAppConfig({
      ...validEnv,
      API_PORT: '',
      API_HOST: '  ',
      WEB_ORIGIN: 'http://localhost:3000/',
    });
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.webOrigin).toBe('http://localhost:3000');
  });

  it('listens on API_HOST when set, for example in a container', () => {
    expect(loadAppConfig({ ...validEnv, API_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  it('lists every invalid variable at once', () => {
    const error = captureConfigError({
      SUPABASE_URL: 'not a url',
      SUPABASE_PUBLISHABLE_KEY: '',
      API_PORT: 'eighty',
      EMBEDDING_PROVIDER: 'ollama',
      EMBEDDING_MODEL: 'nomic-embed-text',
      EMBEDDING_DIMENSIONS: '768',
    });
    expect(error.problems).toEqual([
      'SUPABASE_URL must be an http(s) URL',
      'SUPABASE_PUBLISHABLE_KEY is not set',
      'SUPABASE_SECRET_KEY is not set',
      'API_PORT must be a port number',
    ]);
    expect(error.message).toContain('  - SUPABASE_SECRET_KEY is not set');
  });

  it('includes AI configuration problems in the same report', () => {
    const error = captureConfigError({ ...validEnv, EMBEDDING_PROVIDER: 'anthropic' });
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toContain('has no embeddings endpoint');
  });
});
