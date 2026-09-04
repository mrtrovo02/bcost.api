import {
  parseCsvList,
  resolveCorsOrigins,
  shouldEnableSwagger,
} from './http-runtime.config.js';

describe('HTTP runtime production config', () => {
  it('parses comma-separated environment values safely', () => {
    expect(
      parseCsvList(' https://app.bcost.com.br,https://admin.bcost.com.br ,, '),
    ).toEqual(['https://app.bcost.com.br', 'https://admin.bcost.com.br']);
  });

  it('normalizes markdown-pasted CORS origins from production env files', () => {
    expect(
      parseCsvList(
        '[https://bcost.com.br,https://www.bcost.com.br,https://app.bcost.com.br](https://bcost.com.br,https://www.bcost.com.br,https://app.bcost.com.br)',
      ),
    ).toEqual([
      'https://bcost.com.br',
      'https://www.bcost.com.br',
      'https://app.bcost.com.br',
    ]);
  });

  it('allows all CORS origins outside production when no explicit origin is configured', () => {
    expect(resolveCorsOrigins('', false)).toBe(true);
  });

  it('uses strict production CORS defaults when no explicit origin is configured', () => {
    const origins = resolveCorsOrigins(undefined, true);

    expect(Array.isArray(origins)).toBe(true);
    expect(String((origins as RegExp[])[0])).toContain('bcost');
  });

  it('prefers explicit CORS origins over defaults', () => {
    expect(
      resolveCorsOrigins(
        'https://app.bcost.com.br,https://admin.bcost.com.br',
        true,
      ),
    ).toEqual(['https://app.bcost.com.br', 'https://admin.bcost.com.br']);
  });

  it('keeps Swagger enabled during non-production development', () => {
    expect(shouldEnableSwagger(false, 'false')).toBe(true);
  });

  it('requires an explicit flag to expose Swagger in production', () => {
    expect(shouldEnableSwagger(true, undefined)).toBe(false);
    expect(shouldEnableSwagger(true, 'false')).toBe(false);
    expect(shouldEnableSwagger(true, 'true')).toBe(true);
  });
});
