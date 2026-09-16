'use strict';

import { HttpAdapterHost } from '@nestjs/core';
import { register } from 'prom-client';
import {
  BadRequestException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { PrismaService } from '../../database/prisma.service.js';

describe('GlobalExceptionFilter observability', () => {
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const parseReplyBody = <T extends Record<string, unknown>>(
    reply: jest.Mock,
  ): T => JSON.parse(String(reply.mock.calls[0]?.[1])) as T;

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
      headers: {
        'x-bcost-trace-id': 'client-trace-filter-001',
      },
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
      expect.any(String),
      500,
    );
    expect(parseReplyBody(reply)).toEqual(
      expect.objectContaining({
        type: 'https://docs.bcost.com.br/problems/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        statusCode: 500,
        traceId: 'client-trace-filter-001',
        requestId: 'client-trace-filter-001',
      }),
    );
    expect(header).toHaveBeenCalledWith(
      'content-type',
      'application/problem+json; charset=utf-8',
    );
    expect(header).toHaveBeenCalledWith(
      'x-bcost-trace-id',
      'client-trace-filter-001',
    );
    const metrics = await register.metrics();
    expect(metrics).toContain('bcost_http_5xx_total');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('status="500"');
    expect(metrics).toContain('bcost_http_5xx_total{method="GET",status="500"} 1');
  });

  it('gera traceId unico quando a falha acontece sem contexto e sem header de rastreio', async () => {
    const reply = jest.fn();
    const header = jest.fn();
    const httpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/api/v1/orphan-error'),
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
      method: 'POST',
      url: '/api/v1/orphan-error',
      ip: '127.0.0.1',
      headers: {},
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    };

    await filter.catch(new Error('orphan failure'), host as never);

    const responseBody = parseReplyBody<{
      traceId?: string;
      requestId?: string;
    }>(reply);

    expect(responseBody?.traceId).toEqual(expect.stringMatching(uuidV4Pattern));
    expect(responseBody?.requestId).toBe(responseBody?.traceId);
    expect(header).toHaveBeenCalledWith(
      'x-bcost-trace-id',
      responseBody?.traceId,
    );
  });

  it('classifica erro 400 como bad-request sem incrementar metrica 5xx', async () => {
    const reply = jest.fn();
    const header = jest.fn();
    const httpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/api/v1/company'),
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
      method: 'POST',
      url: '/api/v1/company',
      ip: '127.0.0.1',
      headers: {
        'x-bcost-trace-id': 'client-trace-filter-400',
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    };

    await filter.catch(
      new BadRequestException('CNPJ informado e invalido.'),
      host as never,
    );

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ header }),
      expect.any(String),
      400,
    );
    expect(parseReplyBody(reply)).toEqual(
      expect.objectContaining({
        type: 'https://docs.bcost.com.br/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        statusCode: 400,
        traceId: 'client-trace-filter-400',
        requestId: 'client-trace-filter-400',
        message: 'CNPJ informado e invalido.',
      }),
    );
    expect(await register.metrics()).not.toContain(
      'bcost_http_5xx_total{method="POST",status="400"}',
    );
  });

  it('registra sessao revogada como warn operacional sem stacktrace de erro', async () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation();
    const reply = jest.fn();
    const header = jest.fn();
    const httpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/api/v1/auth/me'),
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
      url: '/api/v1/auth/me',
      ip: '127.0.0.1',
      headers: {
        'x-bcost-trace-id': 'client-trace-revoked-session',
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    };

    await filter.catch(
      new UnauthorizedException(
        'Sessão revogada: faça login novamente para continuar.',
      ),
      host as never,
    );

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Sessao revogada detectada'),
    );
    expect(loggerError).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ header }),
      expect.any(String),
      401,
    );
    expect(parseReplyBody(reply)).toEqual(
      expect.objectContaining({
        type: 'https://docs.bcost.com.br/problems/unauthorized',
        status: 401,
        traceId: 'client-trace-revoked-session',
        message: 'Sessão revogada: faça login novamente para continuar.',
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EXCEPTION_THROWN',
          statusCode: 401,
        }),
      }),
    );

    loggerError.mockRestore();
    loggerWarn.mockRestore();
  });

  it('nao persiste 404 publico de baixo ruido no AuditLog', async () => {
    const reply = jest.fn();
    const header = jest.fn();
    const httpAdapter = {
      getRequestUrl: jest.fn().mockReturnValue('/robots.txt'),
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
      url: '/robots.txt',
      ip: '127.0.0.1',
      headers: {
        'x-bcost-trace-id': 'client-trace-filter-robots',
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    };

    await filter.catch(new NotFoundException('Cannot GET /robots.txt'), host as never);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ header }),
      expect.any(String),
      404,
    );
    expect(parseReplyBody(reply)).toEqual(
      expect.objectContaining({
        type: 'https://docs.bcost.com.br/problems/not-found',
        status: 404,
        traceId: 'client-trace-filter-robots',
      }),
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(await register.metrics()).not.toContain(
      'bcost_http_5xx_total{method="GET",status="404"}',
    );
  });
});
