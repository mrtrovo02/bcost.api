import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';

describe('MetricsController', () => {
  const createController = (metricsApiKey = '') =>
    new MetricsController({
      get: jest.fn().mockReturnValue(metricsApiKey),
    } as any);

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
});
