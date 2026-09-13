import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller.js';

describe('MetricsController', () => {
  const createController = (metricsApiKey = '', nodeEnv = 'development') =>
    new MetricsController({
      get: jest.fn((key: string) => {
        if (key === 'METRICS_API_KEY') return metricsApiKey;
        if (key === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
    } as Pick<ConfigService, 'get'> as ConfigService);

  it('returns Prometheus metrics when no API key is configured', async () => {
    const controller = createController();

    const metrics = await controller.getMetrics();

    expect(typeof metrics).toBe('string');
  });

  it('rejects metrics requests with an invalid API key when configured', async () => {
    const controller = createController('secret-key');

    await expect(controller.getMetrics('wrong-key')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns metrics when the configured API key matches', async () => {
    const controller = createController('secret-key');

    const metrics = await controller.getMetrics('secret-key');

    expect(typeof metrics).toBe('string');
  });

  it('accepts the first metrics API key value when the header is parsed as an array', async () => {
    const controller = createController('secret-key');

    const metrics = await controller.getMetrics(['secret-key', 'legacy-key']);

    expect(typeof metrics).toBe('string');
  });

  it('fails closed in production when no metrics API key is configured', async () => {
    const controller = createController('', 'production');

    await expect(controller.getMetrics()).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
