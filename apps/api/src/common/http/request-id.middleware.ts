import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './app-request.js';

export const REQUEST_ID_HEADER = 'x-request-id';

// Incoming ids end up in logs, so only short, plain tokens are trusted.
const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/**
 * Gives every request an id: the caller's `x-request-id` when it is safe, otherwise a
 * new UUID. The id is echoed in the response header and in every error body, so a
 * user-reported error can be matched to its log line.
 *
 * Plain Express middleware (not a Nest middleware class) on purpose: it is mounted
 * first, before the body parser, so even a 413 or malformed-JSON error has an id.
 */
export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction): void {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
