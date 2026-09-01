'use strict';

import { BCOST_ALLOWED_CORS_HEADERS } from './cors-headers.config.js';

describe('BCOST_ALLOWED_CORS_HEADERS', () => {
  it('allows tenant, trace and controlled demo session headers used by the frontend', () => {
    expect(BCOST_ALLOWED_CORS_HEADERS).toEqual(
      expect.arrayContaining([
        'Authorization',
        'Content-Type',
        'x-bcost-trace-id',
        'x-company-id',
        'x-demo-session',
      ]),
    );
  });

  it('does not contain duplicate header names ignoring casing', () => {
    const normalizedHeaders = BCOST_ALLOWED_CORS_HEADERS.map((header) =>
      header.toLowerCase(),
    );

    expect(new Set(normalizedHeaders).size).toBe(normalizedHeaders.length);
  });
});
