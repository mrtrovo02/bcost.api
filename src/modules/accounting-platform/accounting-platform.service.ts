'use strict';

import { Injectable } from '@nestjs/common';
import { ACCOUNTING_OFFERINGS } from './accounting-offerings.data.js';
import {
  AccountingOffering,
  AccountingOfferingActivationRequirement,
  AccountingOfferingActivationStatus,
  AccountingOfferingMarketStatus,
  AccountingOfferingsResponse,
} from './accounting-offerings.types.js';
import { ACCOUNTING_PLATFORM_COVERAGE } from './accounting-platform.data.js';
import {
  AccountingPlatformCoverageItem,
  AccountingPlatformCoverageResponse,
  AccountingPlatformPriorityTier,
  AccountingPlatformReadinessGap,
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
        marketReady: offerings.filter((item) => item.marketStatus === 'MARKET_READY')
          .length,
        assistedSellable: offerings.filter(
          (item) => item.marketStatus === 'ASSISTED_SELLABLE',
        ).length,
        waitlistOnly: offerings.filter((item) => item.marketStatus === 'WAITLIST_ONLY')
          .length,
        internalRoadmap: offerings.filter(
          (item) => item.marketStatus === 'INTERNAL_ROADMAP',
        ).length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildSummary(items: AccountingPlatformCoverageItem[]) {
    const gaps = items.flatMap((item) => item.readinessGaps ?? []);

    return {
      total: items.length,
      active: items.filter((item) => item.maturity === 'ACTIVE').length,
      integrating: items.filter((item) => item.maturity === 'INTEGRATING').length,
      planned: items.filter((item) => item.maturity === 'PLANNED').length,
      requiresPartner: items.filter((item) => item.maturity === 'REQUIRES_PARTNER')
        .length,
      requiresHumanOperation: items.filter(
        (item) => item.maturity === 'REQUIRES_HUMAN_OPERATION',
      ).length,
      crcValidated: items.filter((item) => item.automationBoundary === 'CRC_VALIDATED')
        .length,
      blockers: gaps.filter((gap) => gap.severity === 'BLOCKER').length,
      warnings: gaps.filter((gap) => gap.severity === 'WARNING').length,
      p0: items.filter((item) => item.priorityTier === 'P0').length,
      p1: items.filter((item) => item.priorityTier === 'P1').length,
    };
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
        ? linkedItems.reduce((sum, item) => sum + (item.priorityScore ?? 0), 0) /
          linkedItems.length
        : 0;
    const launchReadinessScore = Math.max(
      0,
      Math.round(100 - blockers.length * 25 - warnings.length * 8 - avgPriority * 0.25),
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

    return {
      ...offering,
      requiredCapabilities,
      launchReadinessScore,
      marketStatus,
      marketGuardrails: this.buildMarketGuardrails(marketStatus, blockers.length, warnings.length),
      commercialDecision: this.buildCommercialDecision(marketStatus),
      activationRequirements,
      activationSummary: {
        total: activationRequirements.length,
        ready: activationRequirements.filter((item) => item.status === 'READY').length,
        requiresSetup: activationRequirements.filter((item) => item.status === 'REQUIRES_SETUP')
          .length,
        blocked: activationRequirements.filter((item) => item.status === 'BLOCKED').length,
      },
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
      return ['Oferta liberada para comunicação comercial com monitoramento de SLA e evidências.'];
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

  private buildCommercialDecision(status: AccountingOfferingMarketStatus): string {
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
    const officialEvidence = [...new Set(linkedItems.flatMap((item) => item.officialEvidence))];

    return capabilities.map((capability) => ({
      code: capability,
      label: this.capabilityActivationLabel(capability),
      owner: this.capabilityOwner(capability),
      status: this.capabilityActivationStatus(capability, marketStatus),
      evidenceRequired: this.capabilityEvidence(capability, officialEvidence),
    }));
  }

  private capabilityActivationLabel(capability: AccountingOffering['requiredCapabilities'][number]) {
    const labels: Record<typeof capability, string> = {
      AUDIT_EVIDENCE_STORE: 'Trilha de auditoria e evidências',
      BAAS_PARTNER: 'Parceiro BaaS regulado',
      BACKOFFICE_TEAM: 'Fila operacional e responsáveis',
      CRC_ACCOUNTANT: 'Governança do contador responsável',
      CUSTOMER_PORTAL: 'Portal do cliente e coleta documental',
      DIGITAL_CERTIFICATE: 'Certificado digital, procuração ou credencial segura',
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
    if (capability === 'BAAS_PARTNER' || capability === 'OPEN_FINANCE_PROVIDER') {
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
    const hardDependencies = new Set<AccountingOffering['requiredCapabilities'][number]>([
      'BAAS_PARTNER',
      'OFFICIAL_API_PROVIDER',
      'MUNICIPAL_COVERAGE',
      'OPEN_FINANCE_PROVIDER',
    ]);

    if (marketStatus === 'INTERNAL_ROADMAP') return 'BLOCKED';
    if (marketStatus === 'WAITLIST_ONLY' && hardDependencies.has(capability)) return 'BLOCKED';
    if (capability === 'AUDIT_EVIDENCE_STORE' || capability === 'CUSTOMER_PORTAL') return 'READY';
    if (marketStatus === 'MARKET_READY') return 'READY';
    return 'REQUIRES_SETUP';
  }

  private capabilityEvidence(
    capability: AccountingOffering['requiredCapabilities'][number],
    officialEvidence: string[],
  ): string[] {
    if (capability === 'AUDIT_EVIDENCE_STORE') return officialEvidence.slice(0, 4);
    if (capability === 'CRC_ACCOUNTANT') return ['Parecer CRC', 'Assinatura técnica', 'Log de revisão'];
    if (capability === 'DIGITAL_CERTIFICATE') {
      return ['Procuração eletrônica ou certificado válido', 'Log de uso da credencial'];
    }
    if (capability === 'BAAS_PARTNER' || capability === 'OPEN_FINANCE_PROVIDER') {
      return ['Contrato do parceiro', 'Sandbox homologado', 'SLA e evidência de consentimento'];
    }
    if (capability === 'MUNICIPAL_COVERAGE') {
      return ['Município homologado', 'Campos obrigatórios mapeados', 'Protocolo alternativo'];
    }
    if (capability === 'OFFICIAL_API_PROVIDER' || capability === 'OFFICIAL_PORTAL_ACCESS') {
      return ['Credencial oficial', 'Recibo/protocolo oficial', 'Teste de homologação'];
    }

    return ['Checklist de ativação', 'Aceite do cliente', 'Registro operacional'];
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
        actions.add('Priorizar endpoint, workflow, tela, testes e evidências mínimas do módulo.');
      }

      if (gap.code === 'PARTNER_REQUIRED') {
        actions.add('Selecionar parceiro/provedor e definir contrato, sandbox, SLA e homologação.');
      }

      if (gap.code === 'BACKOFFICE_REQUIRED') {
        actions.add('Definir fila operacional, responsáveis, checklist, SLA e trilha de auditoria.');
      }

      if (gap.code === 'CRC_GOVERNANCE_REQUIRED') {
        actions.add('Configurar política de revisão CRC, assinatura técnica e responsabilidades.');
      }

      if (gap.code === 'CERTIFICATE_CREDENTIAL_REQUIRED') {
        actions.add('Implementar cofre seguro de certificados/credenciais e logs de uso.');
      }

      if (gap.code === 'MUNICIPAL_COVERAGE_REQUIRED') {
        actions.add('Mapear cobertura municipal, portal, credenciais, campos e protocolo alternativo.');
      }
    }

    if (actions.size === 0) {
      actions.add(`Manter monitoramento, auditoria e testes de regressão para ${item.title}.`);
    }

    return [...actions];
  }
}
