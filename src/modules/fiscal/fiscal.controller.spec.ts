import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalController } from './fiscal.controller.js';

describe('FiscalController seed routes', () => {
  const companyId = '00000000-0000-0000-0000-000000000001';

  function createController(nodeEnv: string) {
    const fiscalService = {
      seedDemoData: jest.fn().mockResolvedValue({ ok: true }),
    };
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
    } as unknown as ConfigService;

    const controller = new FiscalController(
      fiscalService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      configService,
    );

    return { controller, fiscalService };
  }

  it('bloqueia seed fiscal em producao', async () => {
    const { controller, fiscalService } = createController('production');

    await expect(controller.seedDemo(companyId)).rejects.toThrow(
      ForbiddenException,
    );
    expect(fiscalService.seedDemoData).not.toHaveBeenCalled();
  });

  it('permite seed fiscal fora de producao para compatibilidade local', async () => {
    const { controller, fiscalService } = createController('development');

    await expect(controller.seedDemoCompat(companyId)).resolves.toEqual({
      ok: true,
    });
    expect(fiscalService.seedDemoData).toHaveBeenCalledWith(companyId);
  });
});
