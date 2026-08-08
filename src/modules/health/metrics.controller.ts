import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { register } from 'prom-client';

@Controller('internal/metrics')
export class MetricsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async getMetrics(@Headers('x-api-key') apiKey?: string) {
    const configuredKey = this.config.get<string>('METRICS_API_KEY');

    if (configuredKey && apiKey !== configuredKey) {
      throw new UnauthorizedException('Invalid metrics API key.');
    }

    return register.metrics();
  }
}
