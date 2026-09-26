import { describe, expect, it } from 'vitest';
import { describeStreamError } from './stream-errors';
import type { ChatStreamError } from './stream-state';

function error(overrides: Partial<ChatStreamError>): ChatStreamError {
  return {
    code: 'INTERNAL',
    message: 'Something broke.',
    phase: 'request',
    retryAfter: null,
    requestId: null,
    ...overrides,
  };
}

describe('describeStreamError', () => {
  it.each([
    ['CHAT_NOT_CONFIGURED', false],
    ['VALIDATION_FAILED', false],
    ['NOT_FOUND', false],
    ['UNAUTHORIZED', false],
    ['RATE_LIMITED', true],
    ['NETWORK_ERROR', true],
    ['AI_PROVIDER_ERROR', true],
    ['EMBEDDING_UNAVAILABLE', true],
    ['INTERNAL', true],
  ] as const)('%s can be retried: %s', (code, retryable) => {
    expect(describeStreamError(error({ code })).retryable).toBe(retryable);
  });

  it('tells a failed send from an answer that broke midway', () => {
    expect(describeStreamError(error({ phase: 'request' })).title).toBe(
      'The message could not be sent',
    );
    expect(describeStreamError(error({ phase: 'stream' })).title).toBe(
      'The answer could not be finished',
    );
  });
});
