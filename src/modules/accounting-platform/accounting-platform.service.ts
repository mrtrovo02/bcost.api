'use strict';

import { Injectable } from '@nestjs/common';
import { ACCOUNTING_PLATFORM_COVERAGE } from './accounting-platform.data.js';
import {
  AccountingPlatformCoverageItem,
  AccountingPlatformCoverageResponse,
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
    };
  }

  private withReadiness(
    item: AccountingPlatformCoverageItem,
  ): AccountingPlatformCoverageItem {
    const readinessGaps = this.buildReadinessGaps(item);

    return {
      ...item,
      readinessGaps,
      nextActions: this.buildNextActions(item, readinessGaps),
    };
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
