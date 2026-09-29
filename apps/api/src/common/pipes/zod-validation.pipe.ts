import { Injectable, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ValidationError } from '../errors/app-errors.js';

/**
 * Validates a handler parameter against a `@repo/shared` zod schema (the one the web
 * forms use) and passes on the parsed output, defaults applied and strings trimmed.
 * Usage: `@Body(new ZodValidationPipe(createDocumentSchema)) body: CreateDocumentBody`
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError('The request is invalid.', {
        details: z.flattenError(result.error),
      });
    }
    return result.data;
  }
}

/** `@Param('id', ParseUuidPipe)`: a malformed id is a validation error, not a database error. */
@Injectable()
export class ParseUuidPipe extends ZodValidationPipe<z.ZodUUID> {
  constructor() {
    super(z.uuid());
  }
}
