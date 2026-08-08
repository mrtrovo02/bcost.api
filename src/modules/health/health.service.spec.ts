import { HealthService } from './health.service.js';

describe('HealthService runtime diagnostics', () => {
  const createService = (isHealthy = true) =>
    new HealthService({
      isHealthy: jest.fn().mockResolvedValue(isHealthy),
    } as any);

  it('reports Node runtime diagnostics from core APIs', async () => {
    const service = createService();

    const diagnostics = await service.getRuntimeDiagnostics();

    expect(diagnostics.status).toMatch(/healthy|warning/);
    expect(diagnostics.process.nodeVersion).toBe(process.version);
    expect(diagnostics.resources.cpuCount).toBeGreaterThan(0);
    expect(diagnostics.resources.memory.heapUsedMb).toBeGreaterThan(0);
    expect(diagnostics.resources.eventLoop.utilization).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('marks readiness as ready when database and runtime checks are healthy', async () => {
    const service = createService(true);
    jest.spyOn(service, 'getRuntimeDiagnostics').mockResolvedValue({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: 1,
        environment: 'test',
      },
      resources: {
        cpuCount: 2,
        loadAverage: [0, 0, 0],
        memory: {
          rssMb: 100,
          heapUsedMb: 40,
          heapTotalMb: 100,
          externalMb: 1,
          systemFreeMb: 1000,
          systemTotalMb: 2000,
        },
        eventLoop: {
          utilization: 0.1,
          active: 1,
          idle: 9,
        },
      },
    });

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('ready');
    expect(readiness.checks.database).toBe('up');
    expect(readiness.checks.heap).toBe('ok');
  });

  it('marks readiness as not_ready when the database check fails', async () => {
    const service = createService(false);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.checks.database).toBe('down');
  });
});
