'use strict';

import { BCOST_ALLOWED_CORS_HEADERS } from './cors-headers.config.js';

describe('BCOST_ALLOWED_CORS_HEADERS', () => {
  it('allows only auth, tenant and trace headers used by the frontend', () => {
    expect(BCOST_ALLOWED_CORS_HEADERS).toEqual(
      expect.arrayContaining([
        'Authorization',
        'Content-Type',
        'x-bcost-trace-id',
        'x-company-id',
      ]),
    );
    expect(BCOST_ALLOWED_CORS_HEADERS).not.toContain('x-demo-session');
  });

  it('does not contain duplicate header names ignoring casing', () => {
    const normalizedHeaders = BCOST_ALLOWED_CORS_HEADERS.map((header) =>
      header.toLowerCase(),
    );

    expect(new Set(normalizedHeaders).size).toBe(normalizedHeaders.length);
  });
});
