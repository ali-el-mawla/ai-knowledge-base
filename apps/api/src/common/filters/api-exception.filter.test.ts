import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AiProviderError } from '@repo/ai';
import type { ApiErrorBody } from '@repo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ChatNotConfiguredError,
  DatabaseError,
  EmbeddingUnavailableError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../errors/app-errors.js';
import {
  ApiExceptionFilter,
  INTERNAL_ERROR_MESSAGE,
  resolveError,
} from './api-exception.filter.js';

/** What body-parser throws for an oversized body (the `http-errors` shape). */
function bodyTooLarge(): Error {
  return Object.assign(new Error('request entity too large'), {
    status: 413,
    statusCode: 413,
    expose: true,
    type: 'entity.too.large',
  });
}

function zodError(): z.ZodError {
  const result = z.object({ title: z.string() }).safeParse({ title: 1 });
  if (result.success) throw new Error('expected a zod failure');
  return result.error;
}

describe('resolveError', () => {
  it.each([
    ['BadRequestException', new BadRequestException('Bad input'), 400, 'BAD_REQUEST', 'Bad input'],
    ['UnauthorizedException', new UnauthorizedException(), 401, 'UNAUTHORIZED', 'Unauthorized'],
    [
      'NotFoundException',
      new NotFoundException('Cannot GET /x'),
      404,
      'NOT_FOUND',
      'Cannot GET /x',
    ],
    ['ConflictException', new ConflictException('Taken'), 409, 'CONFLICT', 'Taken'],
    [
      'PayloadTooLargeException',
      new PayloadTooLargeException('Too big'),
      413,
      'PAYLOAD_TOO_LARGE',
      'Too big',
    ],
    ['ThrottlerException', new ThrottlerException('Slow down'), 429, 'RATE_LIMITED', 'Slow down'],
    ['an unmapped 4xx', new ForbiddenException('No'), 403, 'BAD_REQUEST', 'No'],
    ['body-parser 413', bodyTooLarge(), 413, 'PAYLOAD_TOO_LARGE', 'request entity too large'],
    ['NotFoundError', NotFoundError.resource('Document'), 404, 'NOT_FOUND', 'Document not found'],
    ['UnauthorizedError', new UnauthorizedError('Expired'), 401, 'UNAUTHORIZED', 'Expired'],
  ])('maps %s', (_name, exception, status, code, message) => {
    expect(resolveError(exception)).toMatchObject({ status, code, message, logLevel: 'none' });
  });

  it('maps a ZodError to 400 VALIDATION_FAILED with flattened issues', () => {
    expect(resolveError(zodError())).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details: { formErrors: [], fieldErrors: { title: [expect.any(String)] } },
    });
  });

  it('keeps the details of a ValidationError', () => {
    const details = { formErrors: [], fieldErrors: { q: ['Too long'] } };
    expect(resolveError(new ValidationError('Invalid', { details }))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
    });
  });

  it('maps an AiProviderError to 502 AI_PROVIDER_ERROR with safe details', () => {
    const error = new AiProviderError('rate_limit', 'HTTP 429 from upstream', 'anthropic', 429);
    expect(resolveError(error)).toEqual({
      status: 502,
      code: 'AI_PROVIDER_ERROR',
      message: 'The AI provider is rate limiting requests. Try again shortly.',
      details: { provider: 'anthropic', kind: 'rate_limit', retryable: true },
      logLevel: 'warn',
    });
  });

  it('maps an embedding failure to 503 EMBEDDING_UNAVAILABLE', () => {
    const cause = new AiProviderError('unavailable', 'connect ECONNREFUSED', 'ollama');
    expect(resolveError(EmbeddingUnavailableError.from(cause))).toMatchObject({
      status: 503,
      code: 'EMBEDDING_UNAVAILABLE',
      details: { provider: 'ollama', kind: 'unavailable', retryable: true },
      logLevel: 'warn',
    });
  });

  it('maps a missing chat configuration to 503 CHAT_NOT_CONFIGURED', () => {
    expect(resolveError(new ChatNotConfiguredError('CHAT_PROVIDER is not set'))).toMatchObject({
      status: 503,
      code: 'CHAT_NOT_CONFIGURED',
      details: { reason: 'CHAT_PROVIDER is not set' },
    });
  });

  it.each([
    ['a DatabaseError', new DatabaseError('list documents', { code: '42P01' })],
    ['a 5xx HttpException', new InternalServerErrorException('pg password is hunter2')],
    ['an unknown Error', new Error('Cannot read properties of undefined')],
    ['a thrown string', 'boom'],
  ])('hides %s behind a generic 500 INTERNAL', (_name, exception) => {
    expect(resolveError(exception)).toEqual({
      status: 500,
      code: 'INTERNAL',
      message: INTERNAL_ERROR_MESSAGE,
      logLevel: 'error',
    });
  });
});

function fakeHost(options: { requestId?: string; headersSent?: boolean } = {}) {
  const response = {
    headersSent: options.headersSent ?? false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  const request = { requestId: options.requestId, method: 'GET', originalUrl: '/api/documents' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always answers with ApiErrorBody and the request id', () => {
    const { host, response } = fakeHost({ requestId: 'req-42' });
    filter.catch(NotFoundError.resource('Document'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    const body: ApiErrorBody = {
      error: { code: 'NOT_FOUND', message: 'Document not found', requestId: 'req-42' },
    };
    expect(response.json).toHaveBeenCalledWith(body);
  });

  it('includes details only when there are some', () => {
    const { host, response } = fakeHost({ requestId: 'req-1' });
    filter.catch(zodError(), host);
    const [body] = response.json.mock.calls[0] as [ApiErrorBody];
    expect(body.error.details).toMatchObject({ fieldErrors: { title: [expect.any(String)] } });
  });

  it('never leaks internals of unexpected errors, but logs them with the request id', () => {
    const { host, response } = fakeHost({ requestId: 'req-7' });
    filter.catch(new Error('relation "secrets" does not exist'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    const [body] = response.json.mock.calls[0] as [ApiErrorBody];
    expect(body).toEqual({
      error: { code: 'INTERNAL', message: INTERNAL_ERROR_MESSAGE, requestId: 'req-7' },
    });
    expect(JSON.stringify(body)).not.toContain('secrets');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('[req-7] GET /api/documents -> 500 INTERNAL'),
      expect.stringContaining('relation "secrets" does not exist'),
    );
  });

  it('logs the database diagnostics carried as the cause', () => {
    const { host } = fakeHost({ requestId: 'req-8' });
    const cause = Object.assign(new Error('permission denied for table documents'), {
      code: '42501',
    });
    filter.catch(new DatabaseError('update document', cause), host);
    expect(errorLog).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/Caused by: .*permission denied[\s\S]*"code":"42501"/),
    );
  });

  it('does not log client errors', () => {
    const { host } = fakeHost({ requestId: 'req-9' });
    filter.catch(new BadRequestException('nope'), host);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('falls back to "unknown" when no request id was assigned', () => {
    const { host, response } = fakeHost();
    filter.catch(new UnauthorizedError('Missing token'), host);
    const [body] = response.json.mock.calls[0] as [ApiErrorBody];
    expect(body.error.requestId).toBe('unknown');
  });

  it('only closes a response whose headers were already sent (streams)', () => {
    const { host, response } = fakeHost({ requestId: 'req-3', headersSent: true });
    filter.catch(new Error('stream broke'), host);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });
});
