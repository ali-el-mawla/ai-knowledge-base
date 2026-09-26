import { Module } from '@nestjs/common';
import { AiInfoController } from './ai-info.controller.js';
import { AiInfoService } from './ai-info.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** Operational endpoints: `GET /health` (public) and `GET /ai/info` (signed in). */
@Module({
  controllers: [HealthController, AiInfoController],
  providers: [HealthService, AiInfoService],
})
export class HealthModule {}
