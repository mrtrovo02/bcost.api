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
    const banking = coverage.items.find((item) => item.id === 'embedded-pj-account');

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
    const formation = coverage.items.find((item) => item.id === 'company-formation-engine');
    const issuer = coverage.items.find((item) => item.id === 'universal-nfse-issuer');

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
    const nfse = coverage.items.find((item) => item.id === 'universal-nfse-issuer');
    const matrix = coverage.items.find((item) => item.id === 'service-delivery-matrix');

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
    const fintech = response.offerings.find((item) => item.id === 'bcost-fintech');
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
    expect(core?.activationSummary.total).toBe(core?.requiredCapabilities.length);
  });

  it('gera playbook operacional de ativação para cada oferta', () => {
    const response = service.offerings();

    for (const offering of response.offerings) {
      expect(offering.activationPlaybook.map((stage) => stage.id)).toEqual([
        `${offering.id}-scope`,
        `${offering.id}-setup`,
        `${offering.id}-operation`,
      ]);
      expect(offering.activationPlaybook.every((stage) => stage.targetSlaHours > 0)).toBe(true);
      expect(offering.activationPlaybook.every((stage) => stage.exitCriteria.length > 0)).toBe(
        true,
      );
    }

    const fintech = response.offerings.find((item) => item.id === 'bcost-fintech');
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
    expect(portfolio.summary.assistedRequired + portfolio.summary.blocked).toBeGreaterThan(0);
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
        expect.objectContaining({ code: 'OFFICIAL_PORTAL_ACCESS', status: 'FAIL' }),
      ]),
    );
    expect(readiness.guardrails.join(' ')).toContain('100% automática');
    expect(readiness.officialDependencies).toEqual(
      expect.arrayContaining(['Receita Federal / CNPJ', 'Redesim']),
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
    expect(readiness.stages.every((stage) => stage.status === 'READY')).toBe(true);
    expect(readiness.evidenceRequired).toEqual(
      expect.arrayContaining([
        'Protocolo de desenquadramento MEI quando aplicável',
        'Dossiê de evidências vinculado à empresa',
      ]),
    );
  });
});
