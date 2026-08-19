'use strict';

import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { AccountingOfferingCompanyProfile } from './accounting-offerings.types.js';
import { AccountingPlatformService } from './accounting-platform.service.js';
import {
  AccountingSetupOperation,
  AccountingSetupReadinessInput,
} from './accounting-platform.types.js';

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

  @Get('market-readiness')
  marketReadiness() {
    return this.accountingPlatform.marketReadiness();
  }

  @Get('setup/readiness')
  setupReadiness(@Query() query: Record<string, string | undefined>) {
    return this.accountingPlatform.setupReadiness(this.toSetupReadinessInput(query));
  }

  @Get('offerings/assessment')
  offeringsAssessment(@Query() query: Record<string, string | undefined>) {
    return this.accountingPlatform.assessOfferings(this.toCompanyProfile(query));
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

  private toSetupReadinessInput(
    query: Record<string, string | undefined>,
  ): AccountingSetupReadinessInput {
    return {
      companyId: query.companyId,
      operation: this.toSetupOperation(query.operation),
      state: query.state,
      municipalityCode: query.municipalityCode,
      legalNature: this.toLegalNature(query.legalNature),
      taxRegime: this.toTaxRegime(query.taxRegime),
      hasPartnerDocuments: this.toBoolean(query.hasPartnerDocuments),
      hasAddressProof: this.toBoolean(query.hasAddressProof),
      hasViabilityCheck: this.toBoolean(query.hasViabilityCheck),
      hasDigitalCertificate: this.toBoolean(query.hasDigitalCertificate),
      hasCrcResponsible: this.toBoolean(query.hasCrcResponsible),
      hasBackofficeOwner: this.toBoolean(query.hasBackofficeOwner),
      hasAuditEvidenceStore: this.toBoolean(query.hasAuditEvidenceStore),
      hasOfficialPortalAccess: this.toBoolean(query.hasOfficialPortalAccess),
      hasMunicipalCoverage: this.toBoolean(query.hasMunicipalCoverage),
      hasPreviousAccountingDocs: this.toBoolean(query.hasPreviousAccountingDocs),
      hasMeiDeregistrationEvidence: this.toBoolean(query.hasMeiDeregistrationEvidence),
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

  private toSetupOperation(value?: string): AccountingSetupOperation | undefined {
    if (
      value === 'COMPANY_OPENING' ||
      value === 'ACCOUNTING_MIGRATION' ||
      value === 'MEI_TO_ME_MIGRATION'
    ) {
      return value;
    }

    return undefined;
  }

  private toLegalNature(value?: string): AccountingSetupReadinessInput['legalNature'] {
    if (
      value === 'LTDA' ||
      value === 'SLU' ||
      value === 'EI' ||
      value === 'MEI' ||
      value === 'OTHER'
    ) {
      return value;
    }

    return undefined;
  }
}
