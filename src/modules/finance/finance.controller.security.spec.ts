import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '#auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '#auth/guards/roles.guard.js';
import { CompanyAccessGuard } from '#common/guards/company-access.guard.js';
import { TenantContextGuard } from '#common/guards/tenant-context.guard.js';
import { FinanceController } from './finance.controller.js';

describe('FinanceController security metadata', () => {
  it('deve proteger rotas financeiras com autenticacao, tenant, empresa e RBAC', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      FinanceController,
    ) as Function[] | undefined;

    expect(guards).toEqual([
      JwtAuthGuard,
      TenantContextGuard,
      CompanyAccessGuard,
      RolesGuard,
    ]);
  });
});
