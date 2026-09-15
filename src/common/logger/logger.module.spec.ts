import { shouldSkipHttpAccessLog } from './logger.module.js';

describe('AppLoggerModule access log policy', () => {
  it.each([
    '/health',
    '/api/health',
    '/api/v1/health',
    '/live',
    '/api/live',
    '/api/v1/live',
    '/ready',
    '/api/ready',
    '/api/v1/ready',
    '/metrics',
    '/robots.txt',
  ])('ignora access log ruidoso de infraestrutura em %s', (url) => {
    expect(shouldSkipHttpAccessLog({ url })).toBe(true);
  });

  it('mantem access log para rotas de negocio', () => {
    expect(
      shouldSkipHttpAccessLog({ url: '/api/v1/company?limit=20' }),
    ).toBe(false);
  });
});
