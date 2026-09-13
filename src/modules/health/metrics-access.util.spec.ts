import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { assertMetricsAccess, METRICS_API_KEY_HEADER } from './metrics-access.util.js';

describe('assertMetricsAccess', () => {
  const createConfig = (
    metricsApiKey = '',
    nodeEnv = 'development',
  ): Pick<ConfigService, 'get'> =>
    ({
      get: jest.fn((key: string) => {
        if (key === 'METRICS_API_KEY') return metricsApiKey;
        if (key === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
    }) as Pick<ConfigService, 'get'>;

  it('uses the standardized API key header name', () => {
    expect(METRICS_API_KEY_HEADER).toBe('x-api-key');
  });

  it('allows metrics in development when no key is configured', () => {
    expect(() => assertMetricsAccess(createConfig())).not.toThrow();
  });

  it('rejects production metrics when no key is configured', () => {
    expect(() => assertMetricsAccess(createConfig('', 'production'))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid configured key', () => {
    expect(() => assertMetricsAccess(createConfig('secret-key'), 'wrong-key')).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the first header value when Fastify parses duplicate API keys as an array', () => {
    expect(() =>
      assertMetricsAccess(createConfig('secret-key'), ['secret-key', 'legacy-key']),
    ).not.toThrow();
  });
});
