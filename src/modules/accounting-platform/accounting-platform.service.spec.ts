'use strict';

import { AccountingPlatformService } from './accounting-platform.service.js';

describe('AccountingPlatformService', () => {
  let service: AccountingPlatformService;

  beforeEach(() => {
    service = new AccountingPlatformService();
  });

  it('mapeia os quatro blocos estrategicos de accounting as a service', () => {
    const coverage = service.coverage();
    const blocks = new Set(coverage.items.map((item) => item.block));

    expect(blocks).toEqual(
      new Set([
        'ONBOARDING_LEGALIZATION',
        'RECURRING_ACCOUNTING_TAX',
        'FINTECH_VALUE_ADDED',
        'SERVICE_ARCHITECTURE',
      ]),
    );
    expect(coverage.summary.total).toBe(10);
    expect(coverage.summary.crcValidated).toBeGreaterThanOrEqual(4);
    expect(coverage.summary.blockers).toBeGreaterThan(0);
    expect(coverage.summary.warnings).toBeGreaterThan(0);
    expect(coverage.summary.p0 + coverage.summary.p1).toBeGreaterThan(0);
  });

  it('declara capacidades criticas para rotinas reguladas e fintech', () => {
    const coverage = service.coverage();
    const das = coverage.items.find((item) => item.id === 'simples-tax-engine');
    const banking = coverage.items.find(
      (item) => item.id === 'embedded-pj-account',
    );

    expect(das?.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'DIGITAL_CERTIFICATE',
        'OFFICIAL_PORTAL_ACCESS',
        'CRC_ACCOUNTANT',
        'AUDIT_EVIDENCE_STORE',
      ]),
    );
    expect(banking?.requiredCapabilities).toEqual(
      expect.arrayContaining(['BAAS_PARTNER', 'OPEN_FINANCE_PROVIDER']),
    );
  });

  it('expõe lacunas acionáveis antes de vender serviços não prontos', () => {
    const coverage = service.coverage();
    const formation = coverage.items.find(
      (item) => item.id === 'company-formation-engine',
    );
    const issuer = coverage.items.find(
      (item) => item.id === 'universal-nfse-issuer',
    );

    expect(formation?.readinessGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MODULE_NOT_IMPLEMENTED',
          severity: 'BLOCKER',
        }),
      ]),
    );
    expect(issuer?.readinessGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PARTNER_REQUIRED',
          severity: 'BLOCKER',
        }),
      ]),
    );
    expect(issuer?.nextActions?.length).toBeGreaterThan(0);
  });

  it('prioriza lacunas críticas como backlog executivo', () => {
    const coverage = service.coverage();
    const nfse = coverage.items.find(
      (item) => item.id === 'universal-nfse-issuer',
    );
    const matrix = coverage.items.find(
      (item) => item.id === 'service-delivery-matrix',
    );

    expect(nfse?.priorityTier).toBe('P0');
    expect(nfse?.priorityScore).toBeGreaterThanOrEqual(80);
    expect(matrix?.priorityTier).toBe('P3');
  });

  it('estrutura prateleira comercial original sem nomes de concorrentes', () => {
    const response = service.offerings();
    const serialized = JSON.stringify(response).toLowerCase();

    expect(response.summary.total).toBe(6);
    expect(response.offerings.map((item) => item.id)).toEqual([
      'bcost-start',
      'bcost-core',
      'bcost-people',
      'bcost-issue',
      'bcost-fintech',
      'bcost-office',
    ]);
    expect(serialized).not.toContain('contabilizei');
    expect(serialized).not.toContain('dominio');
    expect(serialized).not.toContain('contimatic');
    expect(serialized).not.toContain('alterdata');
  });

  it('gera matriz executiva de prontidão para competir em mercado', () => {
    const readiness = service.marketReadiness();

    expect(readiness.summary.totalTracks).toBe(9);
    expect(readiness.summary.p0).toBeGreaterThanOrEqual(5);
    expect(readiness.summary.blocked).toBeGreaterThan(0);
    expect(readiness.marketPosition).toBe('ASSISTED_ACCOUNTING_PILOT');
    expect(readiness.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CRC_GOVERNANCE',
          priority: 'P0',
          status: 'BLOCKED',
          owner: 'CRC',
        }),
        expect.objectContaining({
          code: 'NFSE_ISSUANCE',
          priority: 'P0',
          status: 'INTEGRATION_REQUIRED',
        }),
        expect.objectContaining({
          code: 'SECURITY_LGPD',
          status: 'ASSISTED_READY',
        }),
      ]),
    );
    expect(readiness.nextBuildQueue[0]).toEqual(
      expect.objectContaining({
        priority: 'P0',
        owner: 'CRC',
      }),
    );
    expect(JSON.stringify(readiness).toLowerCase()).not.toContain(
      'contabilizei',
    );
  });

  it('gera registry canônico para evitar duplicação de módulos e APIs', () => {
    const registry = service.architectureRegistry();
    const capabilityIds = registry.items.map((item) => item.capabilityId);
    const canonicalApiBases = registry.items.map(
      (item) => item.canonicalApiBase,
    );

    expect(registry.summary.total).toBeGreaterThanOrEqual(10);
    expect(registry.summary.legacyAliases).toBeGreaterThanOrEqual(9);
    expect(registry.summary.supportedAliases).toBeGreaterThan(0);
    expect(registry.summary.internalOnlyAliases).toBeGreaterThan(0);
    expect(new Set(capabilityIds).size).toBe(capabilityIds.length);
    expect(new Set(canonicalApiBases).size).toBe(canonicalApiBases.length);
    expect(registry.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'SERVICE_SCOPE_CATALOG',
          canonicalOwner: 'service-catalog',
          duplicateRisk: 'LOW',
        }),
        expect.objectContaining({
          capabilityId: 'DOCUMENT_XML_INTAKE',
          status: 'NEEDS_CONSOLIDATION',
          duplicateRisk: 'HIGH',
        }),
        expect.objectContaining({
          capabilityId: 'BANKING_RECONCILIATION',
          canonicalOwner: 'banking-enterprise',
          duplicateRisk: 'HIGH',
          legacyAliases: expect.arrayContaining([
            expect.objectContaining({
              path: '/banking/transactions/:companyId',
              migrationTarget: '/banking/enterprise/transactions/:companyId',
            }),
            expect.objectContaining({
              path: '/reconciliation/auto/:companyId',
              migrationTarget:
                '/banking/enterprise/reconciliation/:companyId/auto',
            }),
          ]),
        }),
        expect.objectContaining({
          capabilityId: 'FISCAL_COMPLIANCE_CHECKS',
          canonicalOwner: 'compliance-enterprise',
          canonicalApiBase: '/compliance/enterprise',
          duplicateRisk: 'MEDIUM',
          legacyAliases: expect.arrayContaining([
            expect.objectContaining({
              path: '/fiscal/compliance/health-check/:companyId',
              migrationTarget: '/compliance/enterprise/run/:companyId',
            }),
          ]),
        }),
        expect.objectContaining({
          capabilityId: 'TAX_SCENARIO_SIMULATOR',
          canonicalOwner: 'tax-scenarios',
          canonicalApiBase: '/tax-scenarios',
          duplicateRisk: 'LOW',
          forbiddenDuplicates: expect.arrayContaining([
            expect.stringContaining('Não copiar layout'),
          ]),
        }),
        expect.objectContaining({
          capabilityId: 'NOTIFICATIONS_WEBHOOKS',
          canonicalOwner: 'notifications-enterprise',
          canonicalApiBase: '/notifications/enterprise',
          duplicateRisk: 'MEDIUM',
          legacyAliases: expect.arrayContaining([
            expect.objectContaining({
              path: '/notifications',
              migrationTarget: '/notifications/enterprise/:companyId',
            }),
          ]),
        }),
        expect.objectContaining({
          capabilityId: 'DIGITAL_CERTIFICATE_VAULT',
          canonicalOwner: 'digital-certificates-enterprise',
          canonicalApiBase: '/digital-certificates/enterprise',
          duplicateRisk: 'MEDIUM',
          legacyAliases: expect.arrayContaining([
            expect.objectContaining({
              path: '/digital-certificates',
              migrationTarget: '/digital-certificates/enterprise/:companyId',
            }),
          ]),
        }),
      ]),
    );
  });

  it('documenta aliases legados sem transformar compatibilidade em novo core', () => {
    const registry = service.architectureRegistry();
    const xmlIntake = registry.items.find(
      (item) => item.capabilityId === 'DOCUMENT_XML_INTAKE',
    );
    const payroll = registry.items.find(
      (item) => item.capabilityId === 'PAYROLL_ESOCIAL',
    );

    expect(xmlIntake?.canonicalApiBase).toBe('/fiscal/upload');
    expect(xmlIntake?.legacyAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'POST',
          path: '/fiscal/upload-xml/:companyId',
          migrationTarget: '/fiscal/upload/:companyId',
          deprecationStage: 'SUPPORTED_ALIAS',
        }),
      ]),
    );
    expect(payroll?.legacyAliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/fiscal/payroll/:companyId',
          migrationTarget: '/payroll/enterprise/payrolls/:companyId',
          deprecationStage: 'INTERNAL_ONLY',
        }),
      ]),
    );
  });

  it('prioriza consolidação quando capacidade enterprise tem risco de sobreposição', () => {
    const registry = service.architectureRegistry();

    expect(registry.summary.highRisk).toBeGreaterThanOrEqual(2);
    expect(registry.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'document_xml_intake-consolidation',
          priority: 'P0',
          owner: 'fiscal',
          affectedCapabilities: expect.arrayContaining(['DOCUMENT_XML_INTAKE']),
        }),
        expect.objectContaining({
          id: 'banking_reconciliation-consolidation',
          priority: 'P0',
          owner: 'banking-enterprise',
          affectedCapabilities: expect.arrayContaining([
            'BANKING_RECONCILIATION',
          ]),
        }),
      ]),
    );
  });

  it('bloqueia comunicação plena quando a oferta depende de parceiro ou módulo planejado', () => {
    const response = service.offerings();
    const issue = response.offerings.find((item) => item.id === 'bcost-issue');
    const core = response.offerings.find((item) => item.id === 'bcost-core');

    expect(issue?.marketStatus).toBe('WAITLIST_ONLY');
    expect(issue?.marketGuardrails.join(' ')).toContain('lista de espera');
    expect(issue?.requiredCapabilities).toEqual(
      expect.arrayContaining(['MUNICIPAL_COVERAGE', 'DIGITAL_CERTIFICATE']),
    );

    expect(core?.marketStatus).toBe('ASSISTED_SELLABLE');
    expect(core?.includedServices.length).toBeGreaterThan(0);
    expect(core?.excludedServices.length).toBeGreaterThan(0);
  });

  it('gera plano de ativação com donos, evidências e bloqueios por oferta', () => {
    const response = service.offerings();
    const fintech = response.offerings.find(
      (item) => item.id === 'bcost-fintech',
    );
    const core = response.offerings.find((item) => item.id === 'bcost-core');

    expect(fintech?.commercialDecision).toContain('piloto controlado');
    expect(fintech?.activationSummary.blocked).toBeGreaterThan(0);
    expect(fintech?.activationRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BAAS_PARTNER',
          owner: 'FINTECH_PARTNERS',
          status: 'BLOCKED',
        }),
      ]),
    );

    expect(core?.activationRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CRC_ACCOUNTANT',
          owner: 'CRC',
          status: 'REQUIRES_SETUP',
        }),
      ]),
    );
    expect(core?.activationSummary.total).toBe(
      core?.requiredCapabilities.length,
    );
  });

  it('gera playbook operacional de ativação para cada oferta', () => {
    const response = service.offerings();

    for (const offering of response.offerings) {
      expect(offering.activationPlaybook.map((stage) => stage.id)).toEqual([
        `${offering.id}-scope`,
        `${offering.id}-setup`,
        `${offering.id}-operation`,
      ]);
      expect(
        offering.activationPlaybook.every((stage) => stage.targetSlaHours > 0),
      ).toBe(true);
      expect(
        offering.activationPlaybook.every(
          (stage) => stage.exitCriteria.length > 0,
        ),
      ).toBe(true);
    }

    const fintech = response.offerings.find(
      (item) => item.id === 'bcost-fintech',
    );
    expect(fintech?.activationPlaybook[1]).toEqual(
      expect.objectContaining({
        owner: 'FINTECH_PARTNERS',
        status: 'BLOCKED',
      }),
    );
  });

  it('avalia elegibilidade de ativação por empresa sem misturar com estado demo', () => {
    const blockedFintech = service.assessOffering('bcost-fintech', {
      companyId: 'company-amel',
      taxRegime: 'SIMPLES_NACIONAL',
      hasAuditEvidenceStore: true,
    });

    expect(blockedFintech.decision).toBe('BLOCKED');
    expect(blockedFintech.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BAAS_PARTNER',
          status: 'FAIL',
        }),
      ]),
    );
    expect(blockedFintech.requiredActions.length).toBeGreaterThan(0);

    const assistedCore = service.assessOffering('bcost-core', {
      companyId: 'company-amel',
      taxRegime: 'SIMPLES_NACIONAL',
      hasDigitalCertificate: true,
      hasCrcResponsible: true,
      hasBackofficeOwner: true,
      hasAuditEvidenceStore: true,
      hasOfficialPortalAccess: true,
    });

    expect(assistedCore.decision).toBe('ASSISTED_REQUIRED');
    expect(assistedCore.score).toBeGreaterThan(blockedFintech.score);
  });

  it('falha com erro claro ao avaliar oferta inexistente', () => {
    expect(() => service.assessOffering('nao-existe', {})).toThrow(
      'Oferta contábil não encontrada: nao-existe',
    );
  });

  it('consolida avaliação de portfólio comercial por empresa', () => {
    const portfolio = service.assessOfferings({
      companyId: 'company-amel',
      taxRegime: 'SIMPLES_NACIONAL',
      hasDigitalCertificate: true,
      hasCrcResponsible: true,
      hasBackofficeOwner: true,
      hasAuditEvidenceStore: true,
      hasOfficialPortalAccess: true,
    });

    expect(portfolio.summary.total).toBe(6);
    expect(portfolio.assessments).toHaveLength(6);
    expect(
      portfolio.summary.assistedRequired + portfolio.summary.blocked,
    ).toBeGreaterThan(0);
    expect(portfolio.summary.averageScore).toBeGreaterThan(0);
    expect(portfolio.actionQueue.length).toBeGreaterThan(0);
    expect(portfolio.actionQueue[0]).toEqual(
      expect.objectContaining({
        priority: expect.stringMatching(/^P[0-2]$/),
        impactedOfferings: expect.any(Array),
      }),
    );
    expect(portfolio.ownerSummary.length).toBeGreaterThan(0);
    expect(portfolio.ownerSummary[0]).toEqual(
      expect.objectContaining({
        owner: expect.any(String),
        totalActions: expect.any(Number),
        impactedOfferings: expect.any(Array),
      }),
    );
    expect(portfolio.recommendedNextOffering).toEqual(
      expect.objectContaining({
        offeringId: expect.any(String),
        score: expect.any(Number),
      }),
    );
  });

  it('bloqueia abertura de empresa sem documentos, CRC e acesso oficial', () => {
    const readiness = service.setupReadiness({
      operation: 'COMPANY_OPENING',
      companyId: 'lead-001',
      hasPartnerDocuments: true,
      hasAddressProof: false,
    });

    expect(readiness.decision).toBe('BLOCKED');
    expect(readiness.score).toBeLessThan(70);
    expect(readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CUSTOMER_DOCUMENTS', status: 'FAIL' }),
        expect.objectContaining({ code: 'CRC_REVIEW', status: 'FAIL' }),
        expect.objectContaining({
          code: 'OFFICIAL_PORTAL_ACCESS',
          status: 'FAIL',
        }),
      ]),
    );
    expect(readiness.guardrails.join(' ')).toContain('100% automática');
    expect(readiness.officialDependencies).toEqual(
      expect.arrayContaining(['Receita Federal / CNPJ', 'Redesim']),
    );
    expect(readiness.setupDossier.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(readiness.setupDossier.requiredArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CUSTOMER_ID_DOCUMENTS',
          status: 'MISSING',
        }),
        expect.objectContaining({
          code: 'CRC_TECHNICAL_REVIEW',
          status: 'MISSING',
        }),
        expect.objectContaining({
          code: 'VIABILITY_PROTOCOL',
          status: 'PENDING',
        }),
      ]),
    );
  });

  it('libera migração MEI para ME como execução assistida quando gates oficiais passam', () => {
    const readiness = service.setupReadiness({
      operation: 'MEI_TO_ME_MIGRATION',
      companyId: 'company-mei',
      municipalityCode: '3550308',
      hasPartnerDocuments: true,
      hasAddressProof: true,
      hasViabilityCheck: true,
      hasCrcResponsible: true,
      hasBackofficeOwner: true,
      hasAuditEvidenceStore: true,
      hasOfficialPortalAccess: true,
      hasMunicipalCoverage: true,
      hasMeiDeregistrationEvidence: true,
    });

    expect(readiness.decision).toBe('READY_FOR_ASSISTED_EXECUTION');
    expect(readiness.score).toBe(100);
    expect(readiness.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MEI_DEREGISTRATION', status: 'PASS' }),
        expect.objectContaining({ code: 'MUNICIPAL_COVERAGE', status: 'PASS' }),
      ]),
    );
    expect(readiness.stages.every((stage) => stage.status === 'READY')).toBe(
      true,
    );
    expect(readiness.evidenceRequired).toEqual(
      expect.arrayContaining([
        'Protocolo de desenquadramento MEI quando aplicável',
        'Dossiê de evidências vinculado à empresa',
      ]),
    );
    expect(readiness.setupDossier.id).toBe(
      'setup:MEI_TO_ME_MIGRATION:company-mei:3550308',
    );
    expect(readiness.setupDossier.requiredArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MEI_DEREGISTRATION_PROTOCOL',
          status: 'READY',
        }),
        expect.objectContaining({
          code: 'AUDIT_DOSSIER_STORE',
          status: 'READY',
        }),
      ]),
    );
  });
});
