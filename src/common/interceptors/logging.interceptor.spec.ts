import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { register } from 'prom-client';
import { LoggingInterceptor } from './logging.interceptor.js';

type EventEmitterMock = {
  emit: jest.Mock<boolean, [string, unknown]>;
};

function createHttpContext(): ExecutionContext {
  const request = {
    method: 'GET',
    url: '/api/v1/dashboard/overview',
    ip: '127.0.0.1',
    headers: {
      'x-bcost-trace-id': 'trace-observability-001',
      'user-agent': 'jest',
    },
  };
  const reply = {
    statusCode: 200,
    header: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor observability', () => {
  beforeEach(() => {
    register.clear();
  });

  it('registra latencia HTTP com labels de baixa cardinalidade e preserva trace id', async () => {
    const eventEmitter: EventEmitterMock = {
      emit: jest.fn().mockReturnValue(true),
    };
    const interceptor = new LoggingInterceptor(eventEmitter);
    const context = createHttpContext();
    const next: CallHandler = {
      handle: () => of({ status: 'OK' }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        complete: resolve,
        error: reject,
      });
    });

    const metrics = await register.metrics();

    expect(metrics).toContain('bcost_http_request_duration_seconds');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('status="200"');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.log',
      expect.objectContaining({
        module: 'DASHBOARD',
        statusCode: 200,
        traceId: 'trace-observability-001',
      }),
    );
  });
});
