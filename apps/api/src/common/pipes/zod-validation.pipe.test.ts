import { createDocumentSchema, listDocumentsQuerySchema } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/app-errors.js';
import { ParseUuidPipe, ZodValidationPipe } from './zod-validation.pipe.js';

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the pipe to throw');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed output: trimmed, normalised, defaults applied', () => {
    const pipe = new ZodValidationPipe(createDocumentSchema);
    expect(pipe.transform({ title: '  Handbook ', content: 'Text', tags: ['HR', 'hr'] })).toEqual({
      title: 'Handbook',
      content: 'Text',
      tags: ['hr'],
    });
  });

  it('coerces query strings', () => {
    const pipe = new ZodValidationPipe(listDocumentsQuerySchema);
    expect(pipe.transform({ limit: '5' })).toEqual({ limit: 5, offset: 0 });
  });

  it('throws a ValidationError with flattened field errors', () => {
    const pipe = new ZodValidationPipe(createDocumentSchema);
    const error = captureError(() => pipe.transform({ title: '', content: '   ' }));

    expect(error).toBeInstanceOf(ValidationError);
    const validation = error as ValidationError;
    expect(validation.status).toBe(400);
    expect(validation.code).toBe('VALIDATION_FAILED');
    expect(validation.details).toMatchObject({
      formErrors: [],
      fieldErrors: {
        title: [expect.any(String)],
        content: ['Content cannot be empty'],
      },
    });
  });

  it('reports object-level errors as form errors', () => {
    const pipe = new ZodValidationPipe(createDocumentSchema);
    const error = captureError(() => pipe.transform('not an object')) as ValidationError;
    expect(error.details).toMatchObject({ formErrors: [expect.any(String)] });
  });
});

describe('ParseUuidPipe', () => {
  it('accepts a UUID', () => {
    const id = '0b6c6a58-8bd4-4f6e-9a3c-2f1b5d8e7c90';
    expect(new ParseUuidPipe().transform(id)).toBe(id);
  });

  it('rejects anything else as a validation error', () => {
    expect(() => new ParseUuidPipe().transform('42')).toThrow(ValidationError);
  });
});
