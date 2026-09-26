import { Controller, Get, Query } from '@nestjs/common';
import type { HealthResponse } from '@repo/shared';
import { z } from 'zod';
import { Public } from '../auth/public.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { HealthService } from './health.service.js';

const healthQuerySchema = z.object({ deep: z.stringbool().default(false) });
type HealthQuery = z.output<typeof healthQuerySchema>;

/**
 * Always 200 with the status in the body: `degraded` is information for the UI and
 * for operators, and an error status would have to carry an ApiErrorBody instead.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(
    @Query(new ZodValidationPipe(healthQuerySchema)) query: HealthQuery,
  ): Promise<HealthResponse> {
    return this.health.check(query.deep);
  }
}
