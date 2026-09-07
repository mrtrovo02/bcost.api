import { Controller, Get, Headers } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { register } from 'prom-client';
import {
  assertMetricsAccess,
  METRICS_API_KEY_HEADER,
} from './metrics-access.util.js';

@Controller('internal/metrics')
export class MetricsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async getMetrics(
    @Headers(METRICS_API_KEY_HEADER) apiKey?: string | string[],
  ): Promise<string> {
    assertMetricsAccess(this.config, apiKey);
    return register.metrics();
  }
}
