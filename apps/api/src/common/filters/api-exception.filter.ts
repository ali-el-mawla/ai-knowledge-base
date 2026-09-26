import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AiProviderError } from '@repo/ai';
import type { ApiErrorBody, ApiErrorCode } from '@repo/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AiProviderFailure, AppError } from '../errors/app-errors.js';
import type { AppRequest } from '../http/app-request.js';

/** How one exception is rendered and logged. */
export interface ResolvedError {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  /** `error`: our fault, logged with the stack. `warn`: an upstream failure. `none`: the client's mistake. */
  logLevel: 'error' | 'warn' | 'none';
}

export const INTERNAL_ERROR_MESSAGE =
  'Something went wrong on our side. Quote the request id if you report it.';

const CODE_BY_STATUS: Readonly<Record<number, ApiErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

const INTERNAL: ResolvedError = {
  status: 500,
  code: 'INTERNAL',
  message: INTERNAL_ERROR_MESSAGE,
  logLevel: 'error',
};

/** Errors raised by Express middleware (body-parser) follow the `http-errors` shape. */
interface ExpressHttpError extends Error {
  status: number;
  expose: boolean;
}

function isExpressHttpError(error: unknown): error is ExpressHttpError {
  return (
    error instanceof Error &&
    typeof (error as Partial<ExpressHttpError>).status === 'number' &&
    (error as Partial<ExpressHttpError>).expose === true
  );
}

function fromHttpStatus(status: number, message: string): ResolvedError {
  if (status >= 500) return INTERNAL;
  return { status, code: CODE_BY_STATUS[status] ?? 'BAD_REQUEST', message, logLevel: 'none' };
}

function fromAppError(error: AppError): ResolvedError {
  // An INTERNAL message describes our internals; the client gets the generic one.
  if (error.code === 'INTERNAL') return { ...INTERNAL, status: error.status };
  return {
    status: error.status,
    code: error.code,
    message: error.message,
    ...(error.details !== undefined && { details: error.details }),
    logLevel: error.status >= 500 ? 'warn' : 'none',
  };
}

/** Maps anything thrown while handling a request to a status, code and safe message. */
export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppError) return fromAppError(exception);
  if (exception instanceof z.ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'The request is invalid.',
      details: z.flattenError(exception),
      logLevel: 'none',
    };
  }
  if (exception instanceof AiProviderError) {
    return fromAppError(AiProviderFailure.from(exception));
  }
  if (exception instanceof HttpException) {
    return fromHttpStatus(exception.getStatus(), exception.message);
  }
  if (isExpressHttpError(exception)) return fromHttpStatus(exception.status, exception.message);
  return INTERNAL;
}

/** Stack plus the `cause` chain and database diagnostics (code, details, hint). */
function describe(error: unknown, depth = 0): string {
  if (!(error instanceof Error)) {
    return typeof error === 'object' ? JSON.stringify(error) : String(error);
  }
  const lines = [error.stack ?? `${error.name}: ${error.message}`];
  const { code, details, hint } = error as Error & Record<string, unknown>;
  if (code !== undefined || details || hint) lines.push(JSON.stringify({ code, details, hint }));
  if (error.cause !== undefined && depth < 3) {
    lines.push(`Caused by: ${describe(error.cause, depth + 1)}`);
  }
  return lines.join('\n');
}

/**
 * The single place that turns exceptions into HTTP responses. Every error leaves the
 * API as `ApiErrorBody`, with the request id, and nothing internal (stack traces,
 * SQL errors) ever reaches the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';
    const error = resolveError(exception);

    this.log(error, exception, request, requestId);

    // A streaming response (the chat SSE) has already sent its headers and reports
    // failures as stream events; the only thing left to do is close it.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
        requestId,
      },
    };
    response.status(error.status).json(body);
  }

  private log(
    error: ResolvedError,
    exception: unknown,
    request: AppRequest,
    requestId: string,
  ): void {
    if (error.logLevel === 'none') return;
    const summary = `[${requestId}] ${request.method} ${request.originalUrl} -> ${error.status} ${error.code}`;
    if (error.logLevel === 'warn') {
      // Upstream failures: the provider's own message is the useful part, not our stack.
      const cause = exception instanceof Error ? (exception.cause ?? exception) : exception;
      this.logger.warn(`${summary}: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }
    this.logger.error(summary, describe(exception));
  }
}
