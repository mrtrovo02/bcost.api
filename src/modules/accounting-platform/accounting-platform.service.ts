'use strict';

import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ACCOUNTING_OFFERINGS } from './accounting-offerings.data.js';
import {
  AccountingOffering,
  AccountingOfferingActivationRequirement,
  AccountingOfferingActivationStatus,
  AccountingOfferingCompanyAssessment,
  AccountingOfferingCompanyProfile,
  AccountingOfferingEligibilityCheck,
  AccountingOfferingPortfolioAssessment,
  AccountingOfferingPlaybookStage,
  AccountingOfferingMarketStatus,
  AccountingOfferingsResponse,
} from './accounting-offerings.types.js';
import { ACCOUNTING_PLATFORM_COVERAGE } from './accounting-platform.data.js';
import {
  AccountingArchitectureRegistryItem,
  AccountingArchitectureRegistryResponse,
  AccountingMarketReadinessResponse,
  AccountingMarketReadinessStatus,
  AccountingMarketReadinessTrack,
  AccountingArchitectureOwner,
  AccountingPlatformCoverageItem,
  AccountingPlatformCoverageResponse,
  AccountingPlatformPriorityTier,
  AccountingPlatformReadinessGap,
  AccountingSetupOperation,
  AccountingSetupReadinessInput,
  AccountingSetupReadinessResponse,
} from './accounting-platform.types.js';

@Injectable()
export class AccountingPlatformService {
  coverage(): AccountingPlatformCoverageResponse {
    const items = ACCOUNTING_PLATFORM_COVERAGE.map((item) =>
      this.withReadiness(item),
    );

    return {
      status: 'OK',
      items,
      summary: this.buildSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  offerings(): AccountingOfferingsResponse {
    const coverageItems = this.coverage().items;
    const offerings = ACCOUNTING_OFFERINGS.map((offering) =>
      this.buildOffering(offering, coverageItems),
    );

    return {
      status: 'OK',
      offerings,
      summary: {
        total: offerings.length,
        marketReady: offerings.filter(
          (item) => item.marketStatus === 'MARKET_READY',
        ).length,
        assistedSellable: offerings.filter(
          (item) => item.marketStatus === 'ASSISTED_SELLABLE',
        ).length,
        waitlistOnly: offerings.filter(
          (item) => item.marketStatus === 'WAITLIST_ONLY',
        ).length,
        internalRoadmap: offerings.filter(
          (item) => item.marketStatus === 'INTERNAL_ROADMAP',
        ).length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  marketReadiness(): AccountingMarketReadinessResponse {
    const tracks = this.buildMarketReadinessTracks();
    const summary = this.buildMarketReadinessSummary(tracks);
    const score = this.calculateMarketReadinessScore(tracks);

    return {
      status: 'OK',
      score,
      marketPosition: this.resolveMarketPosition(score, summary.blocked),
      summary,
      tracks,
      nextBuildQueue: this.buildMarketNextBuildQueue(tracks),
      executiveGuardrails: [
        'Não vender contabilidade completa em escala antes de formalizar CRC, governança técnica e dossiê de evidências.',
        'Todo serviço dependente de órgão público deve comunicar prazo assistido, protocolo oficial e exceções municipais.',
        'Fintech, conta PJ e Open Finance devem operar por parceiro autorizado ou estrutura regulatória compatível.',
        'CBS/IBS em 2026 deve ser tratado como compliance documental e calibração operacional, sem comunicação de recolhimento indevido.',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  architectureRegistry(): AccountingArchitectureRegistryResponse {
    const items = this.buildArchitectureRegistryItems();
    const legacyAliases = items.flatMap((item) => item.legacyAliases);

    return {
      status: 'OK',
      items,
      summary: {
        total: items.length,
        canonical: items.filter((item) => item.status === 'CANONICAL').length,
        shared: items.filter((item) => item.status === 'SHARED_CAPABILITY')
          .length,
        needsConsolidation: items.filter(
          (item) => item.status === 'NEEDS_CONSOLIDATION',
        ).length,
        deprecatedAlias: items.filter(
          (item) => item.status === 'DEPRECATED_ALIAS',
        ).length,
        highRisk: items.filter((item) => item.duplicateRisk === 'HIGH').length,
        mediumRisk: items.filter((item) => item.duplicateRisk === 'MEDIUM')
          .length,
        legacyAliases: legacyAliases.length,
        supportedAliases: legacyAliases.filter(
          (alias) => alias.deprecationStage === 'SUPPORTED_ALIAS',
        ).length,
        internalOnlyAliases: legacyAliases.filter(
          (alias) => alias.deprecationStage === 'INTERNAL_ONLY',
        ).length,
        removableAliases: legacyAliases.filter(
          (alias) => alias.deprecationStage === 'REMOVE_AFTER_MIGRATION',
        ).length,
      },
      recommendations: this.buildArchitectureRecommendations(items),
      generatedAt: new Date().toISOString(),
    };
  }

  assessOffering(
    offeringId: string,
    profile: AccountingOfferingCompanyProfile,
  ): AccountingOfferingCompanyAssessment {
    const offering = this.offerings().offerings.find(
      (item) => item.id === offeringId,
    );

    if (!offering) {
      throw new NotFoundException(
        `Oferta contábil não encontrada: ${offeringId}`,
      );
    }

    const checks = this.buildEligibilityChecks(offering, profile);
    const fails = checks.filter((item) => item.status === 'FAIL').length;
    const warnings = checks.filter((item) => item.status === 'WARN').length;
    const decision = this.resolveCompanyActivationDecision(
      offering.marketStatus,
      fails,
      warnings,
    );
    const score = Math.max(
      0,
      Math.round(offering.launchReadinessScore - fails * 18 - warnings * 7),
    );

    return {
      status: 'OK',
      offeringId: offering.id,
      offeringName: offering.name,
      companyId: profile.companyId,
      decision,
      score,
      checks,
      requiredActions: this.buildCompanyRequiredActions(decision, checks),
      generatedAt: new Date().toISOString(),
    };
  }

  assessOfferings(
    profile: AccountingOfferingCompanyProfile,
  ): AccountingOfferingPortfolioAssessment {
    const assessments = this.offerings().offerings.map((offering) =>
      this.assessOffering(offering.id, profile),
    );
    const actionQueue = this.buildPortfolioActionQueue(assessments);
    const activationAllowed = assessments.filter(
      (item) => item.decision === 'ACTIVATION_ALLOWED',
    ).length;
    const assistedRequired = assessments.filter(
      (item) => item.decision === 'ASSISTED_REQUIRED',
    ).length;
    const blocked = assessments.filter(
      (item) => item.decision === 'BLOCKED',
    ).length;
    const averageScore =
      assessments.length > 0
        ? Math.round(
            assessments.reduce((sum, item) => sum + item.score, 0) /
              assessments.length,
          )
        : 0;
    const recommendedNextOffering = [...assessments]
      .sort((a, b) => {
        const decisionWeight = {
          ACTIVATION_ALLOWED: 3,
          ASSISTED_REQUIRED: 2,
          BLOCKED: 1,
        };

        return (
          decisionWeight[b.decision] - decisionWeight[a.decision] ||
          b.score - a.score ||
          a.offeringName.localeCompare(b.offeringName)
        );
      })
      .at(0);

    return {
      status: 'OK',
      companyId: profile.companyId,
      assessments,
      actionQueue,
      ownerSummary: this.buildOwnerSummary(actionQueue),
      summary: {
        total: assessments.length,
        activationAllowed,
        assistedRequired,
        blocked,
        averageScore,
      },
      recommendedNextOffering: recommendedNextOffering
        ? {
            offeringId: recommendedNextOffering.offeringId,
            offeringName: recommendedNextOffering.offeringName,
            decision: recommendedNextOffering.decision,
            score: recommendedNextOffering.score,
          }
        : undefined,
      generatedAt: new Date().toISOString(),
    };
  }

  setupReadiness(
    input: AccountingSetupReadinessInput = {},
  ): AccountingSetupReadinessResponse {
    const operation = input.operation ?? 'COMPANY_OPENING';
    const gates = this.buildSetupReadinessGates(operation, input);
    const failed = gates.filter((gate) => gate.status === 'FAIL').length;
    const warnings = gates.filter((gate) => gate.status === 'WARN').length;
    const decision: AccountingSetupReadinessResponse['decision'] =
      failed > 0
        ? 'BLOCKED'
        : warnings > 0
          ? 'REQUIRES_SETUP'
          : 'READY_FOR_ASSISTED_EXECUTION';
    const score = Math.max(0, Math.round(100 - failed * 18 - warnings * 7));
    const stages = this.buildSetupReadinessStages(operation, gates);
    const evidenceRequired = [
      ...new Set(stages.flatMap((stage) => stage.evidenceRequired)),
    ];
    const setupDossier = this.buildSetupDossier(
      operation,
      input,
      gates,
      stages,
    );

    return {
      status: 'OK',
      operation,
      companyId: input.companyId,
      decision,
      score,
      gates,
      stages,
      evidenceRequired,
      setupDossier,
      officialDependencies: this.setupOfficialDependencies(operation),
      nextActions: this.buildSetupNextActions(gates, operation),
      guardrails: [
        'Não comunicar abertura, alteração ou migração como 100% automática sem protocolo oficial concluído.',
        'Serviços regulados exigem validação de contador responsável quando envolver enquadramento, CNAE, regime tributário ou documento societário.',
        'Prazos dependem de Receita Federal, Redesim, Junta Comercial, Prefeitura e demais órgãos locais.',
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  private buildArchitectureRegistryItems(): AccountingArchitectureRegistryItem[] {
    return [
      {
        capabilityId: 'SERVICE_SCOPE_CATALOG',
        name: 'Catálogo comercial e escopo de serviços',
        layer: 'CUSTOMER_EXPERIENCE',
        canonicalOwner: 'service-catalog',
        canonicalApiBase: '/service-catalog',
        frontendRoutes: ['/dashboard/modules/business-rules'],
        relatedModules: ['business-rules', 'compliance-checks'],
        status: 'CANONICAL',
        duplicateRisk: 'LOW',
        consolidationRule:
          'Escopo comercial, condicionantes e bloqueios de atendimento devem evoluir no service-catalog; regras de compliance apenas consomem esse contrato.',
        publicContract:
          'Classifica solicitações, plano, competência, prefeitura digital, protocolo físico e limites de atendimento sem usar marca ou conteúdo de concorrente.',
        integrationPoints: ['BusinessRule', 'ComplianceCheck', 'AuditLog'],
        forbiddenDuplicates: [
          'Não criar novo catálogo paralelo em accounting-platform ou compliance-enterprise.',
          'Não nomear recursos com marcas de concorrentes.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'ACCOUNTING_MARKET_READINESS',
        name: 'Prateleira Accounting as a Service e readiness de mercado',
        layer: 'GOVERNANCE',
        canonicalOwner: 'accounting-platform',
        canonicalApiBase: '/accounting-platform',
        frontendRoutes: ['/dashboard/enterprise'],
        relatedModules: ['accounting-platform', 'operational-workflows'],
        status: 'CANONICAL',
        duplicateRisk: 'LOW',
        consolidationRule:
          'Decisão comercial, maturity map e guardrails executivos pertencem ao accounting-platform; módulos operacionais reportam evidências para ele.',
        publicContract:
          'Expõe cobertura, ofertas, readiness, assessment por empresa e bloqueios oficiais para venda assistida.',
        integrationPoints: [
          '/accounting-platform/coverage',
          '/accounting-platform/offerings',
          '/accounting-platform/market-readiness',
        ],
        forbiddenDuplicates: [
          'Não criar dashboards paralelos de readiness fora do painel enterprise.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'SETUP_LEGALIZATION',
        name: 'Onboarding, legalização e migração contábil',
        layer: 'ACCOUNTING_CORE',
        canonicalOwner: 'accounting-platform',
        canonicalApiBase: '/accounting-platform/setup',
        frontendRoutes: [
          '/dashboard/enterprise',
          '/dashboard/modules/company-formation',
        ],
        relatedModules: ['company-formation', 'document-management', 'company'],
        status: 'SHARED_CAPABILITY',
        duplicateRisk: 'MEDIUM',
        consolidationRule:
          'Readiness e dossiê ficam no accounting-platform; execução real deve abrir workflow operacional por empresa e protocolo oficial.',
        publicContract:
          'Valida documentos, viabilidade, certificado, CRC, prefeitura e evidências antes de prometer abertura, migração ou desenquadramento MEI.',
        integrationPoints: [
          'Redesim',
          'Junta Comercial',
          'Receita Federal',
          'Prefeitura',
        ],
        forbiddenDuplicates: [
          'Não criar /legalization/* isolado sem delegar readiness para /accounting-platform/setup.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'MONTHLY_TAX_CLOSURE',
        name: 'Fechamento fiscal mensal e apuração do Simples',
        layer: 'FISCAL_CORE',
        canonicalOwner: 'fiscal',
        canonicalApiBase: '/fiscal/tax',
        frontendRoutes: [
          '/dashboard/enterprise',
          '/dashboard/modules/tax-regime-calculations',
        ],
        relatedModules: [
          'tax-obligations',
          'fiscal-obligations',
          'indirect-taxes',
        ],
        status: 'SHARED_CAPABILITY',
        duplicateRisk: 'MEDIUM',
        consolidationRule:
          'Cálculo, fator R e fechamento pertencem ao fiscal; obrigação e evidência oficial pertencem a obligations-enterprise.',
        publicContract:
          'Prévia de apuração, gates de certificado/portal/CRC e dossiê de evidências antes de gerar obrigação oficial.',
        integrationPoints: [
          'PGDAS-D',
          'Portal e-CAC',
          'AuditLog',
          'TaxObligation',
        ],
        forbiddenDuplicates: [
          'Não duplicar cálculo de imposto dentro de obligations-enterprise.',
          'Não gerar guia sem evidence packet e responsável definido.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'TAX_OBLIGATION_EVIDENCE',
        name: 'Evidência oficial de guias e obrigações tributárias',
        layer: 'FISCAL_CORE',
        canonicalOwner: 'obligations-enterprise',
        canonicalApiBase: '/obligations/enterprise/tax',
        frontendRoutes: ['/dashboard/modules/tax-obligations'],
        relatedModules: ['tax-obligations', 'audit-logs', 'automation-jobs'],
        status: 'CANONICAL',
        duplicateRisk: 'MEDIUM',
        consolidationRule:
          'Protocolo, recibo, arquivo oficial e hash ficam em obligations-enterprise; módulos fiscais apenas referenciam o obligationId.',
        publicContract:
          'Registra comprovante oficial com URL, código de recibo, versão e auditoria multi-tenant.',
        integrationPoints: ['TaxObligation', 'AuditLog', 'DocumentManagement'],
        forbiddenDuplicates: [
          'Não anexar comprovante fiscal em endpoint genérico sem atualizar TaxObligation.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'OFFICIAL_FISCAL_OBLIGATIONS',
        name: 'Obrigações acessórias oficiais',
        layer: 'FISCAL_CORE',
        canonicalOwner: 'obligations-enterprise',
        canonicalApiBase: '/obligations/enterprise/fiscal',
        frontendRoutes: ['/dashboard/modules/fiscal-obligations'],
        relatedModules: [
          'fiscal-obligations',
          'sped-fiscal',
          'efd-contributions',
        ],
        status: 'CANONICAL',
        duplicateRisk: 'LOW',
        consolidationRule:
          'Agenda, entrega, recibo e reprocessamento de obrigações acessórias ficam centralizados em obligations-enterprise.',
        publicContract:
          'Controla DEFIS, DCTFWeb, SPED/EFD e demais obrigações com status, competência, responsável e evidência.',
        integrationPoints: ['SPED', 'e-CAC', 'AutomationJob', 'AuditLog'],
        forbiddenDuplicates: [
          'Não criar scheduler fiscal fora de automation-jobs e obligations-enterprise.',
        ],
        legacyAliases: [],
      },
      {
        capabilityId: 'PAYROLL_ESOCIAL',
        name: 'Folha, pró-labore e eventos eSocial',
        layer: 'PAYROLL_CORE',
        canonicalOwner: 'payroll-enterprise',
        canonicalApiBase: '/payroll/enterprise',
        frontendRoutes: ['/dashboard/payroll', '/dashboard/modules/payrolls'],
        relatedModules: [
          'employees',
          'payrolls',
          'payroll-entries',
          'payroll-lifecycle',
        ],
        status: 'SHARED_CAPABILITY',
        duplicateRisk: 'MEDIUM',
        consolidationRule:
          'Ciclo de folha e eventos eSocial pertencem ao payroll-enterprise; fiscal/payroll deve ser compatibilidade ou integração, não novo core.',
        publicContract:
          'Calcula pró-labore, folha básica, INSS/FGTS e trilha de eventos eSocial com validação humana quando aplicável.',
        integrationPoints: ['eSocial', 'FGTS Digital', 'DCTFWeb', 'AuditLog'],
        forbiddenDuplicates: [
          'Não evoluir fiscal/payroll como segundo motor de folha sem plano de migração.',
        ],
        legacyAliases: [
          {
            method: 'POST',
            path: '/fiscal/payroll/:companyId',
            migrationTarget: '/payroll/enterprise/payrolls/:companyId',
            deprecationStage: 'INTERNAL_ONLY',
          },
          {
            method: 'POST',
            path: '/fiscal/payroll/sync/:companyId',
            migrationTarget: '/payroll/enterprise/payrolls/:companyId/generate',
            deprecationStage: 'INTERNAL_ONLY',
          },
        ],
      },
      {
        capabilityId: 'BANKING_RECONCILIATION',
        name: 'Conta PJ, extrato e conciliação financeira',
        layer: 'FINTECH_CORE',
        canonicalOwner: 'banking-enterprise',
        canonicalApiBase: '/banking/enterprise',
        frontendRoutes: ['/dashboard/banking', '/dashboard/reconciliation'],
        relatedModules: [
          'bank-accounts',
          'bank-transactions',
          'finance-operations',
        ],
        status: 'NEEDS_CONSOLIDATION',
        duplicateRisk: 'HIGH',
        consolidationRule:
          'Lifecycle de conta e transação pertence ao banking-enterprise; matching contábil pertence a reconciliation; projeções pertencem ao financeiro.',
        publicContract:
          'Opera por parceiro BaaS/Open Finance autorizado, consentimento rastreável e conciliação sem misturar tenants.',
        integrationPoints: [
          'BaaS partner',
          'Open Finance',
          'Reconciliation',
          'AuditLog',
        ],
        forbiddenDuplicates: [
          'Não criar novo /finance/banking para transações bancárias.',
          'Não armazenar consentimento Open Finance fora da camada fintech/governança.',
        ],
        legacyAliases: [
          {
            method: 'GET',
            path: '/banking/accounts/:companyId',
            migrationTarget: '/banking/enterprise/accounts/:companyId',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
          {
            method: 'GET',
            path: '/banking/transactions/:companyId',
            migrationTarget: '/banking/enterprise/transactions/:companyId',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
          {
            method: 'POST',
            path: '/banking/reconcile/:companyId',
            migrationTarget:
              '/banking/enterprise/reconciliation/:companyId/auto',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
          {
            method: 'POST',
            path: '/reconciliation/auto/:companyId',
            migrationTarget:
              '/banking/enterprise/reconciliation/:companyId/auto',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
          {
            method: 'DELETE',
            path: '/reconciliation/undo/:bankTransactionId',
            migrationTarget:
              '/banking/enterprise/reconciliation/:companyId/undo/:transactionId',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
        ],
      },
      {
        capabilityId: 'DOCUMENT_XML_INTAKE',
        name: 'Entrada de documentos fiscais e XML',
        layer: 'INTEGRATIONS',
        canonicalOwner: 'fiscal',
        canonicalApiBase: '/fiscal/upload',
        frontendRoutes: ['/dashboard/xml', '/upload-xml'],
        relatedModules: ['document-management', 'fiscal-books', 'dfe'],
        status: 'NEEDS_CONSOLIDATION',
        duplicateRisk: 'HIGH',
        consolidationRule:
          'Upload, validação XML e ingestão DFe devem convergir para /fiscal/upload; /fiscal/upload-xml e /upload-xml devem operar apenas como aliases controlados.',
        publicContract:
          'Recebe XML/documento fiscal, valida estrutura, vincula empresa, gera hash e libera para apuração e obrigações.',
        integrationPoints: [
          'SEFAZ',
          'DFe',
          'DocumentManagement',
          'TaxCalculation',
        ],
        forbiddenDuplicates: [
          'Não criar terceira tela de upload fiscal.',
          'Não permitir fallback demo em ingestão de documento produtivo.',
        ],
        legacyAliases: [
          {
            method: 'POST',
            path: '/fiscal/upload-xml/:companyId',
            migrationTarget: '/fiscal/upload/:companyId',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
          {
            method: 'GET',
            path: '/upload-xml',
            migrationTarget: '/dashboard/xml',
            deprecationStage: 'SUPPORTED_ALIAS',
          },
        ],
      },
      {
        capabilityId: 'SECURITY_TENANCY_GOVERNANCE',
        name: 'Segurança, multi-tenant e governança LGPD',
        layer: 'GOVERNANCE',
        canonicalOwner: 'security',
        canonicalApiBase: '/auth',
        frontendRoutes: ['/login', '/dashboard/modules/audit-logs'],
        relatedModules: ['users', 'sessions', 'company-users', 'audit-logs'],
        status: 'CANONICAL',
        duplicateRisk: 'LOW',
        consolidationRule:
          'Autenticação, sessão, isolamento por empresa e auditoria são contratos transversais obrigatórios para todo módulo enterprise.',
        publicContract:
          'JWT, guard multi-tenant, auditoria, configurações públicas seguras e fallback demo desabilitado em produção.',
        integrationPoints: [
          'AuthGuard',
          'TenantGuard',
          'AuditLog',
          'PublicSettings',
        ],
        forbiddenDuplicates: [
          'Não acessar dados por companyId sem validação de tenant.',
          'Não reativar fallback demonstrativo em ambiente produtivo.',
        ],
        legacyAliases: [],
      },
    ];
  }

  private buildArchitectureRecommendations(
    items: AccountingArchitectureRegistryItem[],
  ) {
    return items
      .filter(
        (item) =>
          item.duplicateRisk === 'HIGH' ||
          item.status === 'NEEDS_CONSOLIDATION' ||
          item.status === 'DEPRECATED_ALIAS',
      )
      .map((item) => ({
        id: `${item.capabilityId.toLowerCase()}-consolidation`,
        priority:
          item.duplicateRisk === 'HIGH'
            ? 'P0'
            : ('P1' as AccountingPlatformPriorityTier),
        action: item.consolidationRule,
        owner: item.canonicalOwner as AccountingArchitectureOwner,
        affectedCapabilities: [item.capabilityId, ...item.relatedModules],
      }));
  }

  private buildOwnerSummary(
    actionQueue: AccountingOfferingPortfolioAssessment['actionQueue'],
  ): AccountingOfferingPortfolioAssessment['ownerSummary'] {
    const summary = new Map<
      AccountingOfferingActivationRequirement['owner'],
      AccountingOfferingPortfolioAssessment['ownerSummary'][number]
    >();

    for (const action of actionQueue) {
      const current = summary.get(action.owner) ?? {
        owner: action.owner,
        totalActions: 0,
        p0: 0,
        p1: 0,
        p2: 0,
        impactedOfferings: [],
      };

      current.totalActions += 1;
      if (action.priority === 'P0') current.p0 += 1;
      if (action.priority === 'P1') current.p1 += 1;
      if (action.priority === 'P2') current.p2 += 1;
      current.impactedOfferings.push(...action.impactedOfferings);
      summary.set(action.owner, current);
    }

    return [...summary.values()]
      .map((item) => ({
        ...item,
        impactedOfferings: [...new Set(item.impactedOfferings)].sort(),
      }))
      .sort(
        (a, b) =>
          b.p0 - a.p0 ||
          b.totalActions - a.totalActions ||
          a.owner.localeCompare(b.owner),
      );
  }

  private buildMarketReadinessTracks(): AccountingMarketReadinessTrack[] {
    return [
      {
        code: 'CRC_GOVERNANCE',
        title: 'Governança CRC e organização contábil',
        priority: 'P0',
        owner: 'CRC',
        status: 'BLOCKED',
        automationBoundary: 'CRC_VALIDATED',
        gap: 'Formalizar responsável técnico, políticas de revisão, registro da operação contábil e matriz de responsabilidade antes de escalar.',
        implementationActions: [
          'Cadastrar responsáveis técnicos por UF/CRC e matriz de alçada.',
          'Criar workflow de revisão/aprovação para DAS, folha, demonstrações e obrigações acessórias.',
          'Vincular parecer técnico e assinatura digital ao dossiê de cada entrega.',
        ],
        officialDependencies: [
          'CFC/CRC',
          'NBC PG 01',
          'Registro de organização contábil',
        ],
        requiredEvidence: [
          'Registro cadastral da organização contábil',
          'Responsável técnico ativo',
          'Política de revisão CRC versionada',
        ],
        sourceBasis: [
          'CFC',
          'NBC PG',
          'Resoluções de registro profissional e cadastral',
        ],
        estimatedImpact: 'RISK_CRITICAL',
      },
      {
        code: 'LEGALIZATION_ENGINE',
        title: 'Abertura, migração, alteração e baixa',
        priority: 'P0',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status: 'ASSISTED_READY',
        automationBoundary: 'ASSISTED_AUTOMATION',
        gap: 'Readiness e dossiê existem, mas ainda falta execução transacional com protocolos, exigências, anexos e conclusão oficial.',
        implementationActions: [
          'Criar entidades de protocolo, exigência, anexo e etapa pública.',
          'Conectar Redesim/Junta quando houver API ou RPA governado.',
          'Registrar deferimento, CNPJ, inscrição municipal e comunicação final ao cliente.',
        ],
        officialDependencies: [
          'Redesim',
          'Receita Federal',
          'Junta Comercial',
          'Prefeituras',
        ],
        requiredEvidence: [
          'Consulta de viabilidade',
          'Protocolo Redesim/Junta',
          'CNPJ deferido',
          'Inscrição municipal/estadual quando aplicável',
        ],
        sourceBasis: ['Gov.br Redesim', 'Receita Federal CNPJ'],
        estimatedImpact: 'REVENUE_CRITICAL',
      },
      {
        code: 'MONTHLY_TAX_CORE',
        title: 'Core mensal de impostos e DAS',
        priority: 'P0',
        owner: 'ENGINEERING',
        status: 'ASSISTED_READY',
        automationBoundary: 'CRC_VALIDATED',
        gap: 'Prévia, gates, fechamento e evidências já existem; falta transmissão/retorno oficial PGDAS-D e exceções de regime/município.',
        implementationActions: [
          'Persistir memória de cálculo mensal com versionamento imutável.',
          'Criar fila de transmissão assistida PGDAS-D com retorno de recibo e guia.',
          'Ampliar regras para Lucro Presumido e retenções quando sair do foco Simples.',
        ],
        officialDependencies: [
          'Portal do Simples Nacional',
          'e-CAC',
          'Procuração eletrônica',
        ],
        requiredEvidence: [
          'Memória de cálculo',
          'Recibo PGDAS-D',
          'Guia DAS',
          'Parecer CRC',
        ],
        sourceBasis: ['Simples Nacional', 'Receita Federal e-CAC'],
        estimatedImpact: 'REVENUE_CRITICAL',
      },
      {
        code: 'OFFICIAL_OBLIGATIONS',
        title: 'Obrigações acessórias oficiais',
        priority: 'P0',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status: 'INTEGRATION_REQUIRED',
        automationBoundary: 'HUMAN_LED',
        gap: 'É preciso cobrir DEFIS, DCTFWeb, SPED, ECD, ECF, EFD, recibos, rejeições e calendário oficial por regime.',
        implementationActions: [
          'Criar catálogo parametrizado de obrigações por regime, CNAE, UF e município.',
          'Implementar geração/validação de arquivos e anexação de recibos oficiais.',
          'Adicionar monitor de vencimentos, rejeições, retificações e aceite CRC.',
        ],
        officialDependencies: ['SPED', 'DCTFWeb', 'eSocial', 'Receita Federal'],
        requiredEvidence: [
          'Arquivo transmitido',
          'Recibo oficial',
          'Protocolo de retificação',
          'Log de validação',
        ],
        sourceBasis: ['SPED Receita Federal', 'eSocial', 'DCTFWeb'],
        estimatedImpact: 'RISK_CRITICAL',
      },
      {
        code: 'NFSE_ISSUANCE',
        title: 'Emissão NFS-e/NF-e com cobertura nacional',
        priority: 'P0',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status: 'INTEGRATION_REQUIRED',
        automationBoundary: 'ASSISTED_AUTOMATION',
        gap: 'Falta emissor produtivo universal com NFS-e Nacional, prefeituras não aderentes, certificados, cancelamento e substituição.',
        implementationActions: [
          'Criar abstração de provedor fiscal por município/documento.',
          'Homologar NFS-e Nacional, provedores municipais e fallback assistido.',
          'Implementar cancelamento, substituição, carta/justificativa e armazenamento XML/PDF.',
        ],
        officialDependencies: [
          'NFS-e Nacional',
          'Prefeituras',
          'SEFAZ',
          'Certificado digital',
        ],
        requiredEvidence: [
          'XML autorizado',
          'PDF/DANFSE',
          'Código de verificação',
          'Protocolo de cancelamento',
        ],
        sourceBasis: ['Portal NFS-e Nacional', 'Notas técnicas fiscais'],
        estimatedImpact: 'REVENUE_CRITICAL',
      },
      {
        code: 'PAYROLL_ESOCIAL',
        title: 'Folha, pró-labore, eSocial, DCTFWeb e FGTS Digital',
        priority: 'P1',
        owner: 'ENGINEERING',
        status: 'INTEGRATION_REQUIRED',
        automationBoundary: 'CRC_VALIDATED',
        gap: 'Falta esteira completa de DP com eventos eSocial, fechamento, totalizadores, FGTS Digital e guias.',
        implementationActions: [
          'Modelar eventos de admissão, remuneração, pró-labore, férias e rescisão.',
          'Criar fechamento mensal com S-1299, totalizadores, DCTFWeb e FGTS Digital.',
          'Adicionar revisão CRC/DP e dossiê por colaborador/competência.',
        ],
        officialDependencies: [
          'eSocial',
          'DCTFWeb',
          'FGTS Digital',
          'Procuração/certificado',
        ],
        requiredEvidence: [
          'Recibos eSocial',
          'Totalizadores',
          'Guia FGTS Digital',
          'DARF DCTFWeb',
        ],
        sourceBasis: ['Manual eSocial', 'FGTS Digital'],
        estimatedImpact: 'SCALE_CRITICAL',
      },
      {
        code: 'BANKING_BAAS',
        title: 'Conta PJ, BaaS, Open Finance e conciliação',
        priority: 'P1',
        owner: 'FINTECH_PARTNERS',
        status: 'BLOCKED',
        automationBoundary: 'ASSISTED_AUTOMATION',
        gap: 'Para oferecer conta, Pix, boleto e Open Finance com segurança comercial é necessário parceiro autorizado, consentimento e SLA.',
        implementationActions: [
          'Selecionar parceiro BaaS/Open Finance e definir sandbox/homologação.',
          'Implementar consentimento, reconciliação bancária e trilha de auditoria LGPD.',
          'Integrar baixa automática de impostos, notas, salários e recebíveis.',
        ],
        officialDependencies: [
          'Banco Central',
          'Instituição autorizada',
          'Open Finance Brasil',
        ],
        requiredEvidence: [
          'Contrato parceiro',
          'Consentimento do cliente',
          'Log de API',
          'SLA financeiro',
        ],
        sourceBasis: [
          'Banco Central Open Finance',
          'Regulação de instituições de pagamento',
        ],
        estimatedImpact: 'SCALE_CRITICAL',
      },
      {
        code: 'SECURITY_LGPD',
        title: 'Segurança, LGPD, certificados e multi-tenant',
        priority: 'P0',
        owner: 'SECURITY',
        status: 'ASSISTED_READY',
        automationBoundary: 'SOFTWARE_ONLY',
        gap: 'Base multi-tenant evoluiu, mas produção real exige hardening contínuo, cofre de credenciais e política LGPD operacional.',
        implementationActions: [
          'Implantar cofre de certificados/procurações com rotação e logs de uso.',
          'Adicionar auditoria imutável para ações sensíveis e segregação por tenant em testes.',
          'Formalizar papéis LGPD, bases legais, retenção e resposta a titulares.',
        ],
        officialDependencies: ['ANPD', 'ICP-Brasil', 'Receita Federal e-CAC'],
        requiredEvidence: [
          'DPIA/LIA quando aplicável',
          'Log de acesso',
          'Termos de tratamento',
          'Cofre de credenciais',
        ],
        sourceBasis: ['ANPD', 'Receita Federal e-CAC'],
        estimatedImpact: 'RISK_CRITICAL',
      },
      {
        code: 'CUSTOMER_SUCCESS_OPS',
        title: 'Atendimento, SLA, filas e operação assistida',
        priority: 'P1',
        owner: 'CUSTOMER_SUCCESS',
        status: 'INTEGRATION_REQUIRED',
        automationBoundary: 'HUMAN_LED',
        gap: 'Para competir em escala falta fila omnichannel, SLA por serviço, playbooks de exceção e handoff para contador/backoffice.',
        implementationActions: [
          'Criar filas por serviço, prioridade, vencimento e risco fiscal.',
          'Adicionar macros de atendimento, histórico e handoff CRC/backoffice.',
          'Medir SLA, retrabalho, exigências públicas e satisfação por carteira.',
        ],
        officialDependencies: [
          'Contratos de serviço',
          'Políticas internas',
          'Canais de atendimento',
        ],
        requiredEvidence: [
          'SLA contratado',
          'Histórico de atendimento',
          'Aceite do cliente',
          'Checklist de encerramento',
        ],
        sourceBasis: [
          'Benchmarks públicos de players contábeis',
          'Operação assistida bCost',
        ],
        estimatedImpact: 'EFFICIENCY',
      },
    ];
  }

  private buildMarketReadinessSummary(
    tracks: AccountingMarketReadinessTrack[],
  ) {
    return {
      totalTracks: tracks.length,
      productionReady: tracks.filter(
        (track) => track.status === 'PRODUCTION_READY',
      ).length,
      assistedReady: tracks.filter((track) => track.status === 'ASSISTED_READY')
        .length,
      integrationRequired: tracks.filter(
        (track) => track.status === 'INTEGRATION_REQUIRED',
      ).length,
      blocked: tracks.filter((track) => track.status === 'BLOCKED').length,
      p0: tracks.filter((track) => track.priority === 'P0').length,
      p1: tracks.filter((track) => track.priority === 'P1').length,
    };
  }

  private calculateMarketReadinessScore(
    tracks: AccountingMarketReadinessTrack[],
  ): number {
    const scoreByStatus: Record<AccountingMarketReadinessStatus, number> = {
      PRODUCTION_READY: 100,
      ASSISTED_READY: 68,
      INTEGRATION_REQUIRED: 35,
      BLOCKED: 8,
    };
    const weightByPriority: Record<AccountingPlatformPriorityTier, number> = {
      P0: 4,
      P1: 3,
      P2: 2,
      P3: 1,
    };
    const weighted = tracks.reduce(
      (acc, track) => {
        const weight = weightByPriority[track.priority];

        return {
          score: acc.score + scoreByStatus[track.status] * weight,
          weight: acc.weight + weight,
        };
      },
      { score: 0, weight: 0 },
    );

    return weighted.weight > 0
      ? Math.round(weighted.score / weighted.weight)
      : 0;
  }

  private resolveMarketPosition(
    score: number,
    blocked: number,
  ): AccountingMarketReadinessResponse['marketPosition'] {
    if (score >= 85 && blocked === 0) return 'SCALE_READY';
    if (score >= 68 && blocked <= 1) return 'MARKET_READY_WITH_GUARDRAILS';
    if (score >= 40) return 'ASSISTED_ACCOUNTING_PILOT';
    return 'NOT_SELLABLE_AS_FULL_ACCOUNTING';
  }

  private buildMarketNextBuildQueue(tracks: AccountingMarketReadinessTrack[]) {
    return tracks
      .filter((track) => track.status !== 'PRODUCTION_READY')
      .sort((a, b) => {
        const priorityWeight: Record<AccountingPlatformPriorityTier, number> = {
          P0: 4,
          P1: 3,
          P2: 2,
          P3: 1,
        };
        const statusWeight: Record<AccountingMarketReadinessStatus, number> = {
          BLOCKED: 4,
          INTEGRATION_REQUIRED: 3,
          ASSISTED_READY: 2,
          PRODUCTION_READY: 1,
        };

        return (
          priorityWeight[b.priority] - priorityWeight[a.priority] ||
          statusWeight[b.status] - statusWeight[a.status] ||
          a.title.localeCompare(b.title)
        );
      })
      .slice(0, 7)
      .map((track) => ({
        id: track.code,
        priority: track.priority,
        owner: track.owner,
        action: track.implementationActions[0],
        unlocks: [track.title, ...track.officialDependencies.slice(0, 2)],
      }));
  }

  private buildPortfolioActionQueue(
    assessments: AccountingOfferingCompanyAssessment[],
  ) {
    const queue = new Map<
      string,
      {
        id: string;
        owner: AccountingOfferingActivationRequirement['owner'];
        priority: 'P0' | 'P1' | 'P2';
        action: string;
        impactedOfferings: string[];
      }
    >();

    for (const assessment of assessments) {
      for (const check of assessment.checks.filter(
        (item) => item.status !== 'PASS',
      )) {
        const owner = this.ownerFromEligibilityCode(check.code);
        const priority =
          check.status === 'FAIL'
            ? 'P0'
            : assessment.decision === 'BLOCKED'
              ? 'P1'
              : 'P2';
        const id = `${owner}:${check.code}:${check.status}`;
        const action = `${check.label}: ${check.message}`;
        const existing = queue.get(id);

        if (existing) {
          existing.impactedOfferings.push(assessment.offeringName);
          if (priority === 'P0') existing.priority = 'P0';
          continue;
        }

        queue.set(id, {
          id,
          owner,
          priority,
          action,
          impactedOfferings: [assessment.offeringName],
        });
      }
    }

    return [...queue.values()]
      .map((item) => ({
        ...item,
        impactedOfferings: [...new Set(item.impactedOfferings)].sort(),
      }))
      .sort((a, b) => {
        const priorityWeight = { P0: 3, P1: 2, P2: 1 };

        return (
          priorityWeight[b.priority] - priorityWeight[a.priority] ||
          b.impactedOfferings.length - a.impactedOfferings.length ||
          a.action.localeCompare(b.action)
        );
      });
  }

  private ownerFromEligibilityCode(
    code: string,
  ): AccountingOfferingActivationRequirement['owner'] {
    if (code === 'CRC_ACCOUNTANT') return 'CRC';
    if (code === 'BACKOFFICE_TEAM') return 'BACKOFFICE';
    if (code === 'BAAS_PARTNER' || code === 'OPEN_FINANCE_PROVIDER')
      return 'FINTECH_PARTNERS';
    if (
      code === 'DIGITAL_CERTIFICATE' ||
      code === 'MUNICIPAL_COVERAGE' ||
      code === 'OFFICIAL_API_PROVIDER' ||
      code === 'OFFICIAL_PORTAL_ACCESS'
    ) {
      return 'GOVERNMENT_INTEGRATIONS';
    }
    if (code === 'AUDIT_EVIDENCE_STORE') return 'GOVERNANCE';
    return 'PRODUCT';
  }

  private buildSummary(items: AccountingPlatformCoverageItem[]) {
    const gaps = items.flatMap((item) => item.readinessGaps ?? []);

    return {
      total: items.length,
      active: items.filter((item) => item.maturity === 'ACTIVE').length,
      integrating: items.filter((item) => item.maturity === 'INTEGRATING')
        .length,
      planned: items.filter((item) => item.maturity === 'PLANNED').length,
      requiresPartner: items.filter(
        (item) => item.maturity === 'REQUIRES_PARTNER',
      ).length,
      requiresHumanOperation: items.filter(
        (item) => item.maturity === 'REQUIRES_HUMAN_OPERATION',
      ).length,
      crcValidated: items.filter(
        (item) => item.automationBoundary === 'CRC_VALIDATED',
      ).length,
      blockers: gaps.filter((gap) => gap.severity === 'BLOCKER').length,
      warnings: gaps.filter((gap) => gap.severity === 'WARNING').length,
      p0: items.filter((item) => item.priorityTier === 'P0').length,
      p1: items.filter((item) => item.priorityTier === 'P1').length,
    };
  }

  private buildEligibilityChecks(
    offering: AccountingOffering,
    profile: AccountingOfferingCompanyProfile,
  ): AccountingOfferingEligibilityCheck[] {
    const checks: AccountingOfferingEligibilityCheck[] = [
      {
        code: 'COMPANY_SCOPE',
        label: 'Escopo empresarial mínimo',
        status: profile.companyId && profile.taxRegime ? 'PASS' : 'WARN',
        message:
          profile.companyId && profile.taxRegime
            ? 'Empresa e regime tributário informados para avaliação.'
            : 'Informe empresa ativa e regime tributário antes de proposta final.',
      },
    ];

    for (const requirement of offering.activationRequirements) {
      const capabilityReady = this.isCapabilitySatisfied(
        requirement.code,
        profile,
      );
      const status = capabilityReady
        ? 'PASS'
        : requirement.status === 'BLOCKED'
          ? 'FAIL'
          : 'WARN';

      checks.push({
        code: requirement.code,
        label: requirement.label,
        status,
        message: capabilityReady
          ? 'Capacidade declarada como disponível para a empresa avaliada.'
          : this.capabilityEligibilityMessage(
              requirement.code,
              requirement.status,
            ),
      });
    }

    return checks;
  }

  private isCapabilitySatisfied(
    capability: AccountingOffering['requiredCapabilities'][number],
    profile: AccountingOfferingCompanyProfile,
  ): boolean {
    if (capability === 'CUSTOMER_PORTAL') return Boolean(profile.companyId);
    if (capability === 'AUDIT_EVIDENCE_STORE')
      return profile.hasAuditEvidenceStore === true;
    if (capability === 'BACKOFFICE_TEAM')
      return profile.hasBackofficeOwner === true;
    if (capability === 'CRC_ACCOUNTANT')
      return profile.hasCrcResponsible === true;
    if (capability === 'DIGITAL_CERTIFICATE')
      return profile.hasDigitalCertificate === true;
    if (capability === 'MUNICIPAL_COVERAGE')
      return Boolean(profile.municipalityCode);
    if (capability === 'OFFICIAL_PORTAL_ACCESS')
      return profile.hasOfficialPortalAccess === true;
    if (capability === 'OFFICIAL_API_PROVIDER')
      return profile.hasOfficialApiProvider === true;
    if (capability === 'BAAS_PARTNER') return profile.hasBaasPartner === true;
    if (capability === 'OPEN_FINANCE_PROVIDER')
      return profile.hasOpenFinanceConsent === true;
    return false;
  }

  private capabilityEligibilityMessage(
    capability: AccountingOffering['requiredCapabilities'][number],
    requirementStatus: AccountingOfferingActivationStatus,
  ): string {
    if (requirementStatus === 'BLOCKED') {
      return 'Capacidade crítica ainda bloqueada para ativação desta oferta em produção.';
    }

    if (capability === 'DIGITAL_CERTIFICATE') {
      return 'Certificado/procuração precisa ser validado antes da execução oficial.';
    }

    if (capability === 'CRC_ACCOUNTANT') {
      return 'Contador responsável precisa revisar e assumir a entrega regulada.';
    }

    return 'Capacidade precisa ser configurada ou comprovada no onboarding da empresa.';
  }

  private resolveCompanyActivationDecision(
    marketStatus: AccountingOfferingMarketStatus,
    fails: number,
    warnings: number,
  ): AccountingOfferingCompanyAssessment['decision'] {
    if (marketStatus === 'INTERNAL_ROADMAP' || fails > 0) return 'BLOCKED';
    if (marketStatus !== 'MARKET_READY' || warnings > 0)
      return 'ASSISTED_REQUIRED';
    return 'ACTIVATION_ALLOWED';
  }

  private buildCompanyRequiredActions(
    decision: AccountingOfferingCompanyAssessment['decision'],
    checks: AccountingOfferingEligibilityCheck[],
  ): string[] {
    if (decision === 'ACTIVATION_ALLOWED') {
      return [
        'Gerar proposta, contrato e ordem de serviço com auditoria habilitada.',
      ];
    }

    return checks
      .filter((item) => item.status !== 'PASS')
      .map((item) => `${item.label}: ${item.message}`)
      .slice(0, 6);
  }

  private buildOffering(
    offering: (typeof ACCOUNTING_OFFERINGS)[number],
    coverageItems: AccountingPlatformCoverageItem[],
  ): AccountingOffering {
    const linkedItems = coverageItems.filter((item) =>
      offering.coverageItemIds.includes(item.id),
    );
    const requiredCapabilities = [
      ...new Set(linkedItems.flatMap((item) => item.requiredCapabilities)),
    ].sort();
    const blockers = linkedItems.flatMap((item) =>
      (item.readinessGaps ?? []).filter((gap) => gap.severity === 'BLOCKER'),
    );
    const warnings = linkedItems.flatMap((item) =>
      (item.readinessGaps ?? []).filter((gap) => gap.severity === 'WARNING'),
    );
    const avgPriority =
      linkedItems.length > 0
        ? linkedItems.reduce(
            (sum, item) => sum + (item.priorityScore ?? 0),
            0,
          ) / linkedItems.length
        : 0;
    const launchReadinessScore = Math.max(
      0,
      Math.round(
        100 - blockers.length * 25 - warnings.length * 8 - avgPriority * 0.25,
      ),
    );
    const marketStatus = this.resolveMarketStatus({
      blockers: blockers.length,
      warnings: warnings.length,
      launchReadinessScore,
      allActive: linkedItems.every((item) => item.maturity === 'ACTIVE'),
    });
    const activationRequirements = this.buildActivationRequirements(
      requiredCapabilities,
      linkedItems,
      marketStatus,
    );
    const activationPlaybook = this.buildActivationPlaybook(
      offering.id,
      marketStatus,
      activationRequirements,
      linkedItems,
    );

    return {
      ...offering,
      requiredCapabilities,
      launchReadinessScore,
      marketStatus,
      marketGuardrails: this.buildMarketGuardrails(
        marketStatus,
        blockers.length,
        warnings.length,
      ),
      commercialDecision: this.buildCommercialDecision(marketStatus),
      activationRequirements,
      activationSummary: {
        total: activationRequirements.length,
        ready: activationRequirements.filter((item) => item.status === 'READY')
          .length,
        requiresSetup: activationRequirements.filter(
          (item) => item.status === 'REQUIRES_SETUP',
        ).length,
        blocked: activationRequirements.filter(
          (item) => item.status === 'BLOCKED',
        ).length,
      },
      activationPlaybook,
    };
  }

  private resolveMarketStatus(input: {
    blockers: number;
    warnings: number;
    launchReadinessScore: number;
    allActive: boolean;
  }): AccountingOfferingMarketStatus {
    if (input.blockers >= 2) return 'INTERNAL_ROADMAP';
    if (input.blockers === 1) return 'WAITLIST_ONLY';
    if (input.warnings > 0 || !input.allActive) return 'ASSISTED_SELLABLE';
    if (input.launchReadinessScore >= 85) return 'MARKET_READY';
    return 'ASSISTED_SELLABLE';
  }

  private buildMarketGuardrails(
    status: AccountingOfferingMarketStatus,
    blockers: number,
    warnings: number,
  ): string[] {
    if (status === 'MARKET_READY') {
      return [
        'Oferta liberada para comunicação comercial com monitoramento de SLA e evidências.',
      ];
    }

    if (status === 'ASSISTED_SELLABLE') {
      return [
        'Oferta vendável apenas com escopo assistido, onboarding operacional e aceite explícito de condicionantes.',
        `${warnings} aviso(s) operacional(is) exigem checklist antes da ativação.`,
      ];
    }

    if (status === 'WAITLIST_ONLY') {
      return [
        'Oferta deve ficar em lista de espera ou piloto controlado até remover bloqueio principal.',
        `${blockers} bloqueio(s) impedem promessa de disponibilidade plena.`,
      ];
    }

    return [
      'Oferta restrita ao roadmap interno até fechar módulos, parceiros, CRC, credenciais e evidências.',
      `${blockers} bloqueio(s) exigem resolução antes de comunicação comercial.`,
    ];
  }

  private buildCommercialDecision(
    status: AccountingOfferingMarketStatus,
  ): string {
    if (status === 'MARKET_READY') {
      return 'Liberar para proposta comercial padrão, contrato e onboarding digital.';
    }

    if (status === 'ASSISTED_SELLABLE') {
      return 'Liberar apenas com escopo assistido, SLA manual e aceite das condicionantes.';
    }

    if (status === 'WAITLIST_ONLY') {
      return 'Manter em piloto controlado ou lista de espera até remover bloqueio principal.';
    }

    return 'Não ofertar publicamente; manter como roadmap interno com validação de arquitetura.';
  }

  private buildActivationRequirements(
    capabilities: AccountingOffering['requiredCapabilities'],
    linkedItems: AccountingPlatformCoverageItem[],
    marketStatus: AccountingOfferingMarketStatus,
  ): AccountingOfferingActivationRequirement[] {
    const officialEvidence = [
      ...new Set(linkedItems.flatMap((item) => item.officialEvidence)),
    ];

    return capabilities.map((capability) => ({
      code: capability,
      label: this.capabilityActivationLabel(capability),
      owner: this.capabilityOwner(capability),
      status: this.capabilityActivationStatus(capability, marketStatus),
      evidenceRequired: this.capabilityEvidence(capability, officialEvidence),
    }));
  }

  private capabilityActivationLabel(
    capability: AccountingOffering['requiredCapabilities'][number],
  ) {
    const labels: Record<typeof capability, string> = {
      AUDIT_EVIDENCE_STORE: 'Trilha de auditoria e evidências',
      BAAS_PARTNER: 'Parceiro BaaS regulado',
      BACKOFFICE_TEAM: 'Fila operacional e responsáveis',
      CRC_ACCOUNTANT: 'Governança do contador responsável',
      CUSTOMER_PORTAL: 'Portal do cliente e coleta documental',
      DIGITAL_CERTIFICATE:
        'Certificado digital, procuração ou credencial segura',
      MUNICIPAL_COVERAGE: 'Cobertura municipal homologada',
      OFFICIAL_API_PROVIDER: 'Provedor oficial/API homologada',
      OFFICIAL_PORTAL_ACCESS: 'Acesso a portal oficial e recibos',
      OPEN_FINANCE_PROVIDER: 'Provedor Open Finance homologado',
    };

    return labels[capability];
  }

  private capabilityOwner(
    capability: AccountingOffering['requiredCapabilities'][number],
  ): AccountingOfferingActivationRequirement['owner'] {
    if (capability === 'CRC_ACCOUNTANT') return 'CRC';
    if (capability === 'BACKOFFICE_TEAM') return 'BACKOFFICE';
    if (
      capability === 'BAAS_PARTNER' ||
      capability === 'OPEN_FINANCE_PROVIDER'
    ) {
      return 'FINTECH_PARTNERS';
    }
    if (
      capability === 'DIGITAL_CERTIFICATE' ||
      capability === 'MUNICIPAL_COVERAGE' ||
      capability === 'OFFICIAL_API_PROVIDER' ||
      capability === 'OFFICIAL_PORTAL_ACCESS'
    ) {
      return 'GOVERNMENT_INTEGRATIONS';
    }
    if (capability === 'AUDIT_EVIDENCE_STORE') return 'GOVERNANCE';
    return 'PRODUCT';
  }

  private capabilityActivationStatus(
    capability: AccountingOffering['requiredCapabilities'][number],
    marketStatus: AccountingOfferingMarketStatus,
  ): AccountingOfferingActivationStatus {
    const hardDependencies = new Set<
      AccountingOffering['requiredCapabilities'][number]
    >([
      'BAAS_PARTNER',
      'OFFICIAL_API_PROVIDER',
      'MUNICIPAL_COVERAGE',
      'OPEN_FINANCE_PROVIDER',
    ]);

    if (marketStatus === 'INTERNAL_ROADMAP') return 'BLOCKED';
    if (marketStatus === 'WAITLIST_ONLY' && hardDependencies.has(capability))
      return 'BLOCKED';
    if (
      capability === 'AUDIT_EVIDENCE_STORE' ||
      capability === 'CUSTOMER_PORTAL'
    )
      return 'READY';
    if (marketStatus === 'MARKET_READY') return 'READY';
    return 'REQUIRES_SETUP';
  }

  private capabilityEvidence(
    capability: AccountingOffering['requiredCapabilities'][number],
    officialEvidence: string[],
  ): string[] {
    if (capability === 'AUDIT_EVIDENCE_STORE')
      return officialEvidence.slice(0, 4);
    if (capability === 'CRC_ACCOUNTANT')
      return ['Parecer CRC', 'Assinatura técnica', 'Log de revisão'];
    if (capability === 'DIGITAL_CERTIFICATE') {
      return [
        'Procuração eletrônica ou certificado válido',
        'Log de uso da credencial',
      ];
    }
    if (
      capability === 'BAAS_PARTNER' ||
      capability === 'OPEN_FINANCE_PROVIDER'
    ) {
      return [
        'Contrato do parceiro',
        'Sandbox homologado',
        'SLA e evidência de consentimento',
      ];
    }
    if (capability === 'MUNICIPAL_COVERAGE') {
      return [
        'Município homologado',
        'Campos obrigatórios mapeados',
        'Protocolo alternativo',
      ];
    }
    if (
      capability === 'OFFICIAL_API_PROVIDER' ||
      capability === 'OFFICIAL_PORTAL_ACCESS'
    ) {
      return [
        'Credencial oficial',
        'Recibo/protocolo oficial',
        'Teste de homologação',
      ];
    }

    return [
      'Checklist de ativação',
      'Aceite do cliente',
      'Registro operacional',
    ];
  }

  private buildActivationPlaybook(
    offeringId: string,
    marketStatus: AccountingOfferingMarketStatus,
    requirements: AccountingOfferingActivationRequirement[],
    linkedItems: AccountingPlatformCoverageItem[],
  ): AccountingOfferingPlaybookStage[] {
    const blocked = requirements.filter((item) => item.status === 'BLOCKED');
    const setup = requirements.filter(
      (item) => item.status === 'REQUIRES_SETUP',
    );
    const evidence = [
      ...new Set(linkedItems.flatMap((item) => item.officialEvidence)),
    ];

    return [
      {
        id: `${offeringId}-scope`,
        title: 'Qualificar escopo, elegibilidade e aceite comercial',
        owner: 'PRODUCT',
        targetSlaHours: 8,
        entryCriteria: [
          'Lead qualificado',
          'Regime tributário e município informados',
        ],
        exitCriteria: [
          this.buildCommercialDecision(marketStatus),
          'Exclusões apresentadas ao cliente',
        ],
        evidenceRequired: [
          'Registro de aceite de escopo',
          'Checklist de elegibilidade',
        ],
        status: marketStatus === 'INTERNAL_ROADMAP' ? 'BLOCKED' : 'READY',
      },
      {
        id: `${offeringId}-setup`,
        title: 'Preparar credenciais, parceiros, filas e responsáveis',
        owner: blocked.some((item) => item.owner === 'FINTECH_PARTNERS')
          ? 'FINTECH_PARTNERS'
          : 'GOVERNMENT_INTEGRATIONS',
        targetSlaHours: blocked.length > 0 ? 72 : 24,
        entryCriteria: ['Escopo aprovado', 'Documentos mínimos recebidos'],
        exitCriteria: [
          blocked.length > 0
            ? 'Bloqueios removidos ou oferta mantida em piloto/lista de espera'
            : 'Capacidades críticas prontas para execução',
        ],
        evidenceRequired: [
          ...new Set(
            [...blocked, ...setup].flatMap((item) => item.evidenceRequired),
          ),
        ].slice(0, 5),
        status:
          blocked.length > 0
            ? 'BLOCKED'
            : setup.length > 0
              ? 'REQUIRES_SETUP'
              : 'READY',
      },
      {
        id: `${offeringId}-operation`,
        title: 'Executar, revisar e armazenar evidências da entrega',
        owner: requirements.some((item) => item.owner === 'CRC')
          ? 'CRC'
          : 'BACKOFFICE',
        targetSlaHours: 48,
        entryCriteria: [
          'Setup concluído',
          'Credenciais e evidências mínimas disponíveis',
        ],
        exitCriteria: [
          'Entrega registrada',
          'Recibo, protocolo ou parecer anexado',
        ],
        evidenceRequired: evidence.slice(0, 5),
        status:
          blocked.length > 0
            ? 'BLOCKED'
            : setup.length > 0
              ? 'REQUIRES_SETUP'
              : 'READY',
      },
    ];
  }

  private buildSetupReadinessGates(
    operation: AccountingSetupOperation,
    input: AccountingSetupReadinessInput,
  ): AccountingSetupReadinessResponse['gates'] {
    const isOpening = operation === 'COMPANY_OPENING';
    const isMeiMigration = operation === 'MEI_TO_ME_MIGRATION';

    return [
      {
        code: 'CUSTOMER_DOCUMENTS',
        label: 'Documentos do cliente',
        owner: 'CUSTOMER',
        status:
          input.hasPartnerDocuments === true && input.hasAddressProof === true
            ? 'PASS'
            : 'FAIL',
        message:
          input.hasPartnerDocuments === true && input.hasAddressProof === true
            ? 'Documentos pessoais/societários e comprovante de endereço declarados.'
            : 'Coletar documentos dos sócios/titular e comprovante de endereço antes do protocolo.',
      },
      {
        code: 'VIABILITY_REDESIM',
        label: 'Viabilidade Redesim/Junta',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status: input.hasViabilityCheck === true ? 'PASS' : 'WARN',
        message:
          input.hasViabilityCheck === true
            ? 'Consulta de viabilidade declarada para nome, endereço, CNAE e órgão local.'
            : 'Executar consulta de viabilidade antes de prometer prazo de abertura/alteração.',
      },
      {
        code: 'CRC_REVIEW',
        label: 'Validação CRC',
        owner: 'CRC',
        status: input.hasCrcResponsible === true ? 'PASS' : 'FAIL',
        message:
          input.hasCrcResponsible === true
            ? 'Responsável técnico declarado para validação de CNAE, regime e documentos.'
            : 'Definir contador responsável antes de orientar enquadramento ou assinar entrega.',
      },
      {
        code: 'BACKOFFICE_OWNER',
        label: 'Responsável operacional',
        owner: 'BACKOFFICE',
        status: input.hasBackofficeOwner === true ? 'PASS' : 'FAIL',
        message:
          input.hasBackofficeOwner === true
            ? 'Dono operacional declarado para acompanhar órgãos públicos e pendências.'
            : 'Atribuir fila e responsável para protocolo, acompanhamento e comunicação com cliente.',
      },
      {
        code: 'AUDIT_EVIDENCE_STORE',
        label: 'Dossiê de evidências',
        owner: 'BACKOFFICE',
        status: input.hasAuditEvidenceStore === true ? 'PASS' : 'FAIL',
        message:
          input.hasAuditEvidenceStore === true
            ? 'Dossiê de evidências declarado para protocolos, recibos e documentos oficiais.'
            : 'Habilitar guarda auditável antes de executar serviço regulado em produção.',
      },
      {
        code: 'OFFICIAL_PORTAL_ACCESS',
        label: 'Acesso a órgãos oficiais',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status:
          input.hasOfficialPortalAccess === true ||
          input.hasDigitalCertificate === true
            ? 'PASS'
            : 'FAIL',
        message:
          input.hasOfficialPortalAccess === true ||
          input.hasDigitalCertificate === true
            ? 'Acesso oficial ou certificado/procuração declarado.'
            : 'Configurar certificado, procuração ou credencial oficial conforme órgão exigido.',
      },
      {
        code: 'MUNICIPAL_COVERAGE',
        label: 'Cobertura municipal',
        owner: 'GOVERNMENT_INTEGRATIONS',
        status:
          input.hasMunicipalCoverage === true || Boolean(input.municipalityCode)
            ? 'PASS'
            : isOpening
              ? 'WARN'
              : 'FAIL',
        message:
          input.hasMunicipalCoverage === true || Boolean(input.municipalityCode)
            ? 'Município identificado para regras de inscrição, alvará e NFS-e.'
            : 'Mapear prefeitura, inscrição municipal, alvará e portal local antes de escalar.',
      },
      {
        code: 'PREVIOUS_ACCOUNTING_DOSSIER',
        label: 'Dossiê do contador anterior',
        owner: 'CUSTOMER',
        status:
          operation === 'ACCOUNTING_MIGRATION'
            ? input.hasPreviousAccountingDocs === true
              ? 'PASS'
              : 'FAIL'
            : 'PASS',
        message:
          operation === 'ACCOUNTING_MIGRATION'
            ? input.hasPreviousAccountingDocs === true
              ? 'Documentos do contador anterior declarados.'
              : 'Coletar balancetes, declarações, procurações, obrigações e pendências históricas.'
            : 'Não aplicável para esta operação.',
      },
      {
        code: 'MEI_DEREGISTRATION',
        label: 'Desenquadramento MEI',
        owner: 'PUBLIC_AGENCY',
        status: isMeiMigration
          ? input.hasMeiDeregistrationEvidence === true
            ? 'PASS'
            : 'FAIL'
          : 'PASS',
        message: isMeiMigration
          ? input.hasMeiDeregistrationEvidence === true
            ? 'Evidência de desenquadramento/alteração MEI declarada.'
            : 'Registrar e evidenciar desenquadramento MEI antes de ativar operação como ME.'
          : 'Não aplicável para esta operação.',
      },
    ];
  }

  private buildSetupReadinessStages(
    operation: AccountingSetupOperation,
    gates: AccountingSetupReadinessResponse['gates'],
  ): AccountingSetupReadinessResponse['stages'] {
    const hasFailed = (codes: string[]) =>
      gates.some((gate) => codes.includes(gate.code) && gate.status === 'FAIL');
    const hasPending = (codes: string[]) =>
      gates.some((gate) => codes.includes(gate.code) && gate.status !== 'PASS');
    const stageStatus = (codes: string[]) =>
      hasFailed(codes)
        ? 'BLOCKED'
        : hasPending(codes)
          ? 'REQUIRES_ACTION'
          : 'READY';

    return [
      {
        id: `${operation.toLowerCase()}-intake`,
        title: 'Intake, escopo e documentos do cliente',
        owner: 'CUSTOMER',
        automationBoundary: 'ASSISTED_AUTOMATION',
        status: stageStatus([
          'CUSTOMER_DOCUMENTS',
          'PREVIOUS_ACCOUNTING_DOSSIER',
        ]),
        evidenceRequired: [
          'Documentos dos sócios/titular',
          'Comprovante de endereço',
          'Aceite de escopo e condicionantes',
          'Dossiê do contador anterior quando aplicável',
        ],
      },
      {
        id: `${operation.toLowerCase()}-technical-review`,
        title: 'Validação técnica de CNAE, regime e natureza jurídica',
        owner: 'CRC',
        automationBoundary: 'CRC_VALIDATED',
        status: stageStatus(['CRC_REVIEW']),
        evidenceRequired: [
          'Parecer técnico CRC',
          'CNAE e atividades validados',
          'Regime tributário recomendado',
        ],
      },
      {
        id: `${operation.toLowerCase()}-official-protocol`,
        title: 'Protocolo em órgãos oficiais e acompanhamento',
        owner: 'GOVERNMENT_INTEGRATIONS',
        automationBoundary: 'HUMAN_LED',
        status: stageStatus([
          'VIABILITY_REDESIM',
          'OFFICIAL_PORTAL_ACCESS',
          'MUNICIPAL_COVERAGE',
          'MEI_DEREGISTRATION',
        ]),
        evidenceRequired: [
          'Consulta de viabilidade',
          'Protocolo Redesim/Junta',
          'CNPJ ou alteração deferida',
          'Inscrição municipal/estadual quando aplicável',
          'Protocolo de desenquadramento MEI quando aplicável',
        ],
      },
      {
        id: `${operation.toLowerCase()}-activation`,
        title: 'Ativação contábil e dossiê auditável',
        owner: 'BACKOFFICE',
        automationBoundary: 'ASSISTED_AUTOMATION',
        status: stageStatus(['BACKOFFICE_OWNER', 'AUDIT_EVIDENCE_STORE']),
        evidenceRequired: [
          'Checklist de ativação',
          'Protocolos e recibos oficiais',
          'Dossiê de evidências vinculado à empresa',
          'Comunicação final ao cliente',
        ],
      },
    ];
  }

  private setupOfficialDependencies(
    operation: AccountingSetupOperation,
  ): string[] {
    const dependencies = [
      'Receita Federal / CNPJ',
      'Redesim',
      'Junta Comercial ou Cartório competente',
      'Prefeitura / inscrição municipal / alvará quando aplicável',
    ];

    if (operation === 'MEI_TO_ME_MIGRATION') {
      dependencies.push('Portal do Empreendedor / desenquadramento MEI');
    }

    if (operation === 'ACCOUNTING_MIGRATION') {
      dependencies.push(
        'Contabilidade anterior e procurações/obrigações históricas',
      );
    }

    return dependencies;
  }

  private buildSetupNextActions(
    gates: AccountingSetupReadinessResponse['gates'],
    operation: AccountingSetupOperation,
  ): string[] {
    const actions = gates
      .filter((gate) => gate.status !== 'PASS')
      .map((gate) => `${gate.label}: ${gate.message}`);

    if (actions.length > 0) return actions;

    return [
      operation === 'COMPANY_OPENING'
        ? 'Gerar minuta/contrato social assistido, revisar com CRC e protocolar nos órgãos oficiais.'
        : 'Executar migração assistida, reconciliar pendências históricas e ativar operação recorrente.',
      'Registrar protocolos, recibos e documentos finais no dossiê auditável da empresa.',
    ];
  }

  private buildSetupDossier(
    operation: AccountingSetupOperation,
    input: AccountingSetupReadinessInput,
    gates: AccountingSetupReadinessResponse['gates'],
    stages: AccountingSetupReadinessResponse['stages'],
  ): AccountingSetupReadinessResponse['setupDossier'] {
    const getGateStatus = (code: string) =>
      gates.find((gate) => gate.code === code)?.status;
    const artifactStatus = (
      code: string,
      pendingOnWarn = true,
    ): 'READY' | 'PENDING' | 'MISSING' => {
      const status = getGateStatus(code);

      if (status === 'PASS') return 'READY';
      if (status === 'WARN' && pendingOnWarn) return 'PENDING';
      return 'MISSING';
    };
    const requiredArtifacts: AccountingSetupReadinessResponse['setupDossier']['requiredArtifacts'] =
      [
        {
          code: 'CUSTOMER_ID_DOCUMENTS',
          label: 'Documentos dos sócios/titular',
          status: artifactStatus('CUSTOMER_DOCUMENTS'),
          source: 'CUSTOMER',
        },
        {
          code: 'ADDRESS_PROOF',
          label: 'Comprovante de endereço',
          status: artifactStatus('CUSTOMER_DOCUMENTS'),
          source: 'CUSTOMER',
        },
        {
          code: 'SCOPE_ACCEPTANCE',
          label: 'Aceite de escopo e condicionantes',
          status: 'READY',
          source: 'BCOST',
        },
        {
          code: 'CRC_TECHNICAL_REVIEW',
          label: 'Parecer técnico CRC',
          status: artifactStatus('CRC_REVIEW'),
          source: 'CRC',
        },
        {
          code: 'VIABILITY_PROTOCOL',
          label: 'Consulta de viabilidade Redesim/Junta',
          status: artifactStatus('VIABILITY_REDESIM'),
          source: 'GOVERNMENT_PORTAL',
        },
        {
          code: 'OFFICIAL_CREDENTIAL',
          label: 'Certificado, procuração ou credencial oficial',
          status: artifactStatus('OFFICIAL_PORTAL_ACCESS'),
          source: 'CUSTOMER',
        },
        {
          code: 'MUNICIPAL_COVERAGE_MAP',
          label: 'Mapa de prefeitura, inscrição e alvará',
          status: artifactStatus('MUNICIPAL_COVERAGE'),
          source: 'BCOST',
        },
        {
          code: 'PUBLIC_AGENCY_PROTOCOLS',
          label: 'Protocolos oficiais de Receita, Junta e Prefeitura',
          status: stages.some(
            (stage) =>
              stage.id.endsWith('official-protocol') &&
              stage.status === 'READY',
          )
            ? 'READY'
            : 'PENDING',
          source: 'PUBLIC_AGENCY',
        },
        {
          code: 'PREVIOUS_ACCOUNTING_DOCS',
          label: 'Dossiê do contador anterior',
          status:
            operation === 'ACCOUNTING_MIGRATION'
              ? artifactStatus('PREVIOUS_ACCOUNTING_DOSSIER')
              : 'READY',
          source: 'CUSTOMER',
        },
        {
          code: 'MEI_DEREGISTRATION_PROTOCOL',
          label: 'Protocolo de desenquadramento MEI',
          status:
            operation === 'MEI_TO_ME_MIGRATION'
              ? artifactStatus('MEI_DEREGISTRATION')
              : 'READY',
          source: 'PUBLIC_AGENCY',
        },
        {
          code: 'AUDIT_DOSSIER_STORE',
          label: 'Dossiê auditável vinculado à empresa',
          status: artifactStatus('AUDIT_EVIDENCE_STORE'),
          source: 'BCOST',
        },
      ];

    const dossierInput = {
      companyId: input.companyId,
      operation,
      state: input.state,
      municipalityCode: input.municipalityCode,
      legalNature: input.legalNature,
      taxRegime: input.taxRegime,
      gates: gates.map(({ code, status }) => ({ code, status })),
      stages: stages.map(({ id, status, automationBoundary }) => ({
        id,
        status,
        automationBoundary,
      })),
      requiredArtifacts: requiredArtifacts.map(({ code, status, source }) => ({
        code,
        status,
        source,
      })),
    };

    return {
      id: `setup:${operation}:${input.companyId ?? 'prospect'}:${input.municipalityCode ?? 'municipality-pending'}`,
      integrityHash: createHash('sha256')
        .update(JSON.stringify(dossierInput))
        .digest('hex'),
      requiredArtifacts,
    };
  }

  private withReadiness(
    item: AccountingPlatformCoverageItem,
  ): AccountingPlatformCoverageItem {
    const readinessGaps = this.buildReadinessGaps(item);
    const priorityScore = this.calculatePriorityScore(item, readinessGaps);

    return {
      ...item,
      readinessGaps,
      nextActions: this.buildNextActions(item, readinessGaps),
      priorityScore,
      priorityTier: this.resolvePriorityTier(priorityScore),
    };
  }

  private calculatePriorityScore(
    item: AccountingPlatformCoverageItem,
    gaps: AccountingPlatformReadinessGap[],
  ): number {
    let score = 0;

    score += gaps.filter((gap) => gap.severity === 'BLOCKER').length * 30;
    score += gaps.filter((gap) => gap.severity === 'WARNING').length * 12;

    if (item.block === 'RECURRING_ACCOUNTING_TAX') score += 25;
    if (item.block === 'ONBOARDING_LEGALIZATION') score += 20;
    if (item.block === 'FINTECH_VALUE_ADDED') score += 15;

    if (item.maturity === 'REQUIRES_PARTNER') score += 25;
    if (item.maturity === 'PLANNED') score += 20;
    if (item.maturity === 'INTEGRATING') score += 10;

    if (item.requiredCapabilities.includes('CRC_ACCOUNTANT')) score += 12;
    if (item.requiredCapabilities.includes('DIGITAL_CERTIFICATE')) score += 10;
    if (item.requiredCapabilities.includes('MUNICIPAL_COVERAGE')) score += 8;
    if (item.requiredCapabilities.includes('BAAS_PARTNER')) score += 8;

    return Math.min(score, 100);
  }

  private resolvePriorityTier(score: number): AccountingPlatformPriorityTier {
    if (score >= 80) return 'P0';
    if (score >= 55) return 'P1';
    if (score >= 25) return 'P2';
    return 'P3';
  }

  private buildReadinessGaps(
    item: AccountingPlatformCoverageItem,
  ): AccountingPlatformReadinessGap[] {
    const gaps: AccountingPlatformReadinessGap[] = [];

    if (item.maturity === 'PLANNED') {
      gaps.push({
        code: 'MODULE_NOT_IMPLEMENTED',
        severity: 'BLOCKER',
        message:
          'Módulo ainda planejado: não deve ser vendido como serviço operacional em produção.',
      });
    }

    if (item.maturity === 'REQUIRES_PARTNER') {
      gaps.push({
        code: 'PARTNER_REQUIRED',
        severity: 'BLOCKER',
        message:
          'Operação depende de parceiro homologado, provedor oficial, BaaS ou integração regulada.',
      });
    }

    if (item.maturity === 'REQUIRES_HUMAN_OPERATION') {
      gaps.push({
        code: 'BACKOFFICE_REQUIRED',
        severity: 'WARNING',
        message:
          'Operação exige esteira humana, checklist interno, SLA e responsáveis antes de escala comercial.',
      });
    }

    if (item.requiredCapabilities.includes('CRC_ACCOUNTANT')) {
      gaps.push({
        code: 'CRC_GOVERNANCE_REQUIRED',
        severity: item.maturity === 'ACTIVE' ? 'INFO' : 'WARNING',
        message:
          'Serviço exige governança de contador responsável, aprovação técnica e evidência de assinatura/parecer.',
      });
    }

    if (item.requiredCapabilities.includes('DIGITAL_CERTIFICATE')) {
      gaps.push({
        code: 'CERTIFICATE_CREDENTIAL_REQUIRED',
        severity: 'WARNING',
        message:
          'Serviço exige certificado digital, procuração eletrônica ou credencial oficial com guarda segura.',
      });
    }

    if (item.requiredCapabilities.includes('MUNICIPAL_COVERAGE')) {
      gaps.push({
        code: 'MUNICIPAL_COVERAGE_REQUIRED',
        severity: 'WARNING',
        message:
          'Serviço depende de cobertura por município, regras locais, prefeitura digital ou alternativa assistida.',
      });
    }

    return gaps;
  }

  private buildNextActions(
    item: AccountingPlatformCoverageItem,
    gaps: AccountingPlatformReadinessGap[],
  ): string[] {
    const actions = new Set<string>();

    for (const gap of gaps) {
      if (gap.code === 'MODULE_NOT_IMPLEMENTED') {
        actions.add(
          'Priorizar endpoint, workflow, tela, testes e evidências mínimas do módulo.',
        );
      }

      if (gap.code === 'PARTNER_REQUIRED') {
        actions.add(
          'Selecionar parceiro/provedor e definir contrato, sandbox, SLA e homologação.',
        );
      }

      if (gap.code === 'BACKOFFICE_REQUIRED') {
        actions.add(
          'Definir fila operacional, responsáveis, checklist, SLA e trilha de auditoria.',
        );
      }

      if (gap.code === 'CRC_GOVERNANCE_REQUIRED') {
        actions.add(
          'Configurar política de revisão CRC, assinatura técnica e responsabilidades.',
        );
      }

      if (gap.code === 'CERTIFICATE_CREDENTIAL_REQUIRED') {
        actions.add(
          'Implementar cofre seguro de certificados/credenciais e logs de uso.',
        );
      }

      if (gap.code === 'MUNICIPAL_COVERAGE_REQUIRED') {
        actions.add(
          'Mapear cobertura municipal, portal, credenciais, campos e protocolo alternativo.',
        );
      }
    }

    if (actions.size === 0) {
      actions.add(
        `Manter monitoramento, auditoria e testes de regressão para ${item.title}.`,
      );
    }

    return [...actions];
  }
}
