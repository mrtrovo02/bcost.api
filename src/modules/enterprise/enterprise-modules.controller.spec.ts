import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { EnterpriseModulesController } from './enterprise-modules.controller.js';
import { EnterpriseModulesService } from './enterprise-modules.service.js';

describe('EnterpriseModulesController', () => {
  it('protects the universal enterprise surface with auth, tenant context and company access guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      EnterpriseModulesController,
    ) as unknown[];

    expect(guards).toEqual([
      JwtAuthGuard,
      TenantContextGuard,
      CompanyAccessGuard,
    ]);
  });

  it('exposes commercial lanes from the enterprise service', () => {
    const lanes = [
      {
        id: 'direct-sale',
        title: 'Venda direta',
        description: 'Módulos vendáveis.',
        marketReadiness: 'SELLABLE',
        automationBoundaries: ['SOFTWARE_ONLY'],
        modules: [],
        primaryAction: 'Abrir módulo',
        operationalGate: 'Plano ativo.',
      },
    ];
    const service = {
      listCommercialLanes: jest.fn().mockReturnValue(lanes),
    } as unknown as EnterpriseModulesService;
    const controller = new EnterpriseModulesController(service);

    expect(controller.commercialLanes()).toBe(lanes);
    expect(service.listCommercialLanes).toHaveBeenCalledTimes(1);
  });
});
