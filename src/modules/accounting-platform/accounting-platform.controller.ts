'use strict';

import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { AccountingOfferingCompanyProfile } from './accounting-offerings.types.js';
import { AccountingPlatformService } from './accounting-platform.service.js';

@Public()
@Controller('accounting-platform')
export class AccountingPlatformController {
  constructor(private readonly accountingPlatform: AccountingPlatformService) {}

  @Get('coverage')
  coverage() {
    return this.accountingPlatform.coverage();
  }

  @Get('offerings')
  offerings() {
    return this.accountingPlatform.offerings();
  }

  @Get('offerings/:offeringId/assessment')
  offeringAssessment(
    @Param('offeringId') offeringId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.accountingPlatform.assessOffering(offeringId, this.toCompanyProfile(query));
  }

  private toCompanyProfile(query: Record<string, string | undefined>): AccountingOfferingCompanyProfile {
    return {
      companyId: query.companyId,
      taxRegime: this.toTaxRegime(query.taxRegime),
      cnae: query.cnae,
      municipalityCode: query.municipalityCode,
      hasDigitalCertificate: this.toBoolean(query.hasDigitalCertificate),
      hasCrcResponsible: this.toBoolean(query.hasCrcResponsible),
      hasBackofficeOwner: this.toBoolean(query.hasBackofficeOwner),
      hasAuditEvidenceStore: this.toBoolean(query.hasAuditEvidenceStore),
      hasBaasPartner: this.toBoolean(query.hasBaasPartner),
      hasOpenFinanceConsent: this.toBoolean(query.hasOpenFinanceConsent),
      hasOfficialPortalAccess: this.toBoolean(query.hasOfficialPortalAccess),
      hasOfficialApiProvider: this.toBoolean(query.hasOfficialApiProvider),
    };
  }

  private toBoolean(value?: string): boolean | undefined {
    if (value === undefined) return undefined;
    return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
  }

  private toTaxRegime(value?: string): AccountingOfferingCompanyProfile['taxRegime'] {
    if (
      value === 'SIMPLES_NACIONAL' ||
      value === 'LUCRO_PRESUMIDO' ||
      value === 'LUCRO_REAL'
    ) {
      return value;
    }

    return undefined;
  }
}
