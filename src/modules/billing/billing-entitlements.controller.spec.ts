import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CompanyRole } from '@prisma/client';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { BillingEntitlementsController } from './billing-entitlements.controller.js';
import { BillingEntitlementsService } from './billing-entitlements.service.js';

type BillingEntitlementsServiceMock = Pick<
  BillingEntitlementsService,
  'getPlans' | 'getEntitlements' | 'checkFeature' | 'updatePlan'
>;

function createServiceMock(): jest.Mocked<BillingEntitlementsServiceMock> {
  return {
    getPlans: jest.fn().mockResolvedValue({ status: 'OK', plans: [] }),
    getEntitlements: jest.fn().mockResolvedValue({ status: 'OK' }),
    checkFeature: jest.fn().mockResolvedValue({ status: 'ALLOWED', allowed: true }),
    updatePlan: jest.fn().mockResolvedValue({ status: 'UPDATED' }),
  };
}

describe('BillingEntitlementsController', () => {
  const companyId = '6befc33e-95cd-4ef4-b8d4-9d5bf1e15f1b';
  const request: AuthenticatedRequest = {
    user: {
      id: 'user-001',
      companyId,
      role: CompanyRole.OWNER,
    },
    companyId,
  };

  let service: jest.Mocked<BillingEntitlementsServiceMock>;
  let controller: BillingEntitlementsController;

  beforeEach(() => {
    service = createServiceMock();
    controller = new BillingEntitlementsController(
      service as unknown as BillingEntitlementsService,
    );
  });

  it('mantem guards de autenticação, tenant e acesso por empresa no controller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      BillingEntitlementsController,
    ) as Function[];

    expect(guards).toEqual(
      expect.arrayContaining([
        JwtAuthGuard,
        TenantContextGuard,
        CompanyAccessGuard,
      ]),
    );
  });

  it('exige papel OWNER para alteração manual de plano', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      BillingEntitlementsController.prototype.updatePlan,
    ) as CompanyRole[];

    expect(roles).toEqual([CompanyRole.OWNER]);
  });

  it('delega consulta de entitlements com companyId e usuario autenticado', async () => {
    await expect(controller.getEntitlements(companyId, request)).resolves.toEqual({
      status: 'OK',
    });

    expect(service.getEntitlements).toHaveBeenCalledWith(companyId, request.user);
  });

  it('delega check de feature usando query validada', async () => {
    await expect(
      controller.checkFeature(companyId, { feature: 'banking.reconciliation' }, request),
    ).resolves.toEqual({ status: 'ALLOWED', allowed: true });

    expect(service.checkFeature).toHaveBeenCalledWith(
      companyId,
      'banking.reconciliation',
      request.user,
    );
  });

  it('delega alteração manual de plano com motivo auditável', async () => {
    await expect(
      controller.updatePlan(
        companyId,
        {
          planLevel: 'ENTERPRISE',
          reason: 'Upgrade contratado em proposta comercial assinada.',
        },
        request,
      ),
    ).resolves.toEqual({ status: 'UPDATED' });

    expect(service.updatePlan).toHaveBeenCalledWith(
      companyId,
      'ENTERPRISE',
      request.user,
      'Upgrade contratado em proposta comercial assinada.',
    );
  });
});
