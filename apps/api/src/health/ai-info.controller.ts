import { Controller, Get } from '@nestjs/common';
import type { AiInfo } from '@repo/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AiInfoService } from './ai-info.service.js';

@Controller('ai')
export class AiInfoController {
  constructor(private readonly aiInfo: AiInfoService) {}

  @Get('info')
  info(@CurrentUser() user: AuthUser): Promise<AiInfo> {
    return this.aiInfo.get(user);
  }
}
