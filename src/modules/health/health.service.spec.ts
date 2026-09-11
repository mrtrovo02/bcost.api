import { HealthService } from './health.service.js';

type PrismaHealthMock = {
  isHealthy: jest.Mock<Promise<boolean>, []>;
  $queryRaw: jest.Mock<Promise<unknown>, TemplateStringsArray[]>;
};

describe('HealthService runtime diagnostics', () => {
  const createPrismaMock = (isHealthy = true): PrismaHealthMock => ({
    isHealthy: jest.fn<Promise<boolean>, []>().mockResolvedValue(isHealthy),
    $queryRaw: jest.fn<Promise<unknown>, TemplateStringsArray[]>(),
  });

  const createService = (isHealthy = true) =>
    new HealthService(createPrismaMock(isHealthy) as never);

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

  it('keeps readiness ready when only heap usage is warning', async () => {
    const service = createService(true);
    jest.spyOn(service, 'getRuntimeDiagnostics').mockResolvedValue({
      status: 'warning',
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
          heapUsedMb: 95,
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
    expect(readiness.checks.heap).toBe('warning');
  });

  it('marks readiness as not_ready when the database check fails', async () => {
    const service = createService(false);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('not_ready');
    expect(readiness.checks.database).toBe('down');
  });

  it('does not query performance view when the current database role lacks select privilege', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ can_read: false }])
      .mockResolvedValueOnce([{ version: 'PostgreSQL 16' }]);

    const service = new HealthService(prisma as never);
    const response = await service.getDatabaseMetrics('company-1');

    expect(response.status).toBe('warning');
    expect(response.metrics).toEqual([]);
    expect(response.dbVersion).toBe('PostgreSQL 16');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('queries performance view only after privilege check succeeds', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ can_read: true }])
      .mockResolvedValueOnce([{ version: 'PostgreSQL 16' }])
      .mockResolvedValueOnce([
        {
          tabela: 'invoices',
          buscas_sequenciais: 1,
          buscas_por_indice: 10,
          total_linhas: 100,
          eficiencia_indice_percentual: 90,
        },
      ]);

    const service = new HealthService(prisma as never);
    const response = await service.getDatabaseMetrics('company-1');

    expect(response.status).toBe('healthy');
    expect(response.metrics).toHaveLength(1);
    expect(response.metrics[0]?.tabela).toBe('invoices');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
