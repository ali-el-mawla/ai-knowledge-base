import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@repo/shared';

@Controller('health')
export class HealthController {
  @Get()
  health(): Pick<HealthResponse, 'status'> {
    return { status: 'ok' };
  }
}
