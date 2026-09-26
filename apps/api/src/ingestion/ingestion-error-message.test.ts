import { type AiErrorKind, AiProviderError } from '@repo/ai';
import { describe, expect, it } from 'vitest';
import { DatabaseError } from '../common/errors/app-errors.js';
import { ingestionErrorMessage } from './ingestion-error-message.js';

const target = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'nomic-embed-text' };

function providerError(kind: AiErrorKind, status: number | null = null): AiProviderError {
  return new AiProviderError(kind, `raw ${kind} details`, 'ollama', status);
}

describe('ingestionErrorMessage', () => {
  it.each([
    [
      providerError('unavailable'),
      'Embedding provider unreachable (ollama at http://127.0.0.1:11434/v1)',
    ],
    [
      providerError('unavailable', 503),
      'Embedding provider unavailable (ollama at http://127.0.0.1:11434/v1)',
    ],
    [
      providerError('timeout'),
      'Embedding provider timed out (ollama at http://127.0.0.1:11434/v1)',
    ],
    [providerError('auth', 401), 'Embedding provider rejected the API key (ollama)'],
    [
      providerError('rate_limit', 429),
      'Embedding provider is rate limiting requests (ollama); reindex to retry',
    ],
    [
      providerError('context_length', 400),
      'A chunk is too long for the embedding model (nomic-embed-text)',
    ],
    [providerError('bad_request', 404), 'Embedding model "nomic-embed-text" not found (ollama)'],
    [
      providerError('bad_request', 400),
      'Embedding provider rejected the request (ollama, nomic-embed-text)',
    ],
    [
      providerError('invalid_response'),
      'Embedding provider returned an unexpected response (ollama, nomic-embed-text)',
    ],
  ])('explains %s briefly', (error, expected) => {
    expect(ingestionErrorMessage(error, target)).toBe(expected);
  });

  it('never exposes database details', () => {
    const error = new DatabaseError('replace document chunks', {
      message: 'relation x does not exist',
    });
    expect(ingestionErrorMessage(error, target)).toBe('Could not save the chunks (database error)');
  });

  it('falls back to a generic reason for anything else', () => {
    expect(ingestionErrorMessage(new TypeError('x is undefined'), target)).toBe(
      'Ingestion failed unexpectedly',
    );
  });
});
