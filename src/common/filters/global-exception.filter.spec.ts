'use strict';

import { HttpAdapterHost } from '@nestjs/core';
import { register } from 'prom-client';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('GlobalExceptionFilter observability', () => {
  beforeEach(() => {
    register.clear();
  });

  it('increments the Prometheus counter for HTTP 5xx responses', async () => {
    const reply = jest.fn();
    const header = jest.fn();
    const httpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/api/v1/test'),
      reply,
    };
    const httpAdapterHost = { httpAdapter } as unknown as HttpAdapterHost;
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaService;
    const filter = new GlobalExceptionFilter(httpAdapterHost, prisma);
    const request = {
      method: 'GET',
      url: '/api/v1/test',
      ip: '127.0.0.1',
      headers: {},
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    };

    await filter.catch(new Error('database unavailable'), host as never);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ header }),
      expect.objectContaining({
        type: 'https://docs.bcost.com.br/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        statusCode: 500,
        traceId: 'N/A',
      }),
      500,
    );
    expect(header).toHaveBeenCalledWith(
      'content-type',
      'application/problem+json; charset=utf-8',
    );
    const metrics = await register.metrics();
    expect(metrics).toContain('bcost_http_5xx_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('status="500"');
    expect(metrics).toContain('bcost_http_5xx_total{method="GET",status="500"} 1');
  });
});
