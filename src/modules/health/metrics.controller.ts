import { Controller, Get } from '@nestjs/common';
import { register } from 'prom-client';

@Controller('internal/metrics')
export class MetricsController {
  @Get()
  async getMetrics() {
    return register.metrics();
  }
}
