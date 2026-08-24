import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import { EnterpriseModulesController } from './enterprise-modules.controller.js';

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
});
