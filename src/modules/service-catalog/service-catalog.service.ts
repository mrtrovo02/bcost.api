'use strict';

import { Injectable, NotFoundException } from '@nestjs/common';
import { BCOST_SERVICE_CATALOG } from './service-catalog.data.js';
import {
  BcostPlan,
  EvaluatedMicroService,
  MacroServiceDefinition,
  ServiceCondition,
  ServiceEvaluationInput,
  ServiceEvaluationResult,
} from './service-catalog.types.js';

@Injectable()
export class ServiceCatalogService {
  getCatalog(): MacroServiceDefinition[] {
    return BCOST_SERVICE_CATALOG;
  }

  getMacroService(id: number): MacroServiceDefinition {
    const service = BCOST_SERVICE_CATALOG.find((item) => item.id === id);

    if (!service) {
      throw new NotFoundException(`Macroservico nao encontrado: ${id}`);
    }

    return service;
  }

  evaluate(input: ServiceEvaluationInput): ServiceEvaluationResult {
    const plan = this.normalizePlan(input.plan);
    const selectedServices = this.selectServices(input);
    const conditions = this.buildConditions(input, plan, selectedServices);
    const blockers = conditions.filter((item) => item.severity === 'BLOCKER').length;
    const warnings = conditions.filter((item) => item.severity === 'WARNING').length;
    const infos = conditions.filter((item) => item.severity === 'INFO').length;

    return {
      status: 'OK',
      plan,
      selectedServices,
      conditions,
      summary: {
        totalServices: selectedServices.length,
        blockers,
        warnings,
        infos,
        requiresHumanReview: blockers > 0 || warnings > 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private normalizePlan(plan?: string): BcostPlan {
    const normalized = String(plan || 'UNKNOWN')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '_');

    if (['PADRAO', 'STANDARD'].includes(normalized)) return 'STANDARD';
    if (['EXPERT', 'EXPERTS'].includes(normalized)) return 'EXPERTS';
    if (['MULTIBENEFICIOS', 'MULTIBENEFITS'].includes(normalized)) {
      return 'MULTIBENEFITS';
    }
    if (['BASICO', 'BASIC'].includes(normalized)) return 'BASIC';
    if (normalized === 'FREE') return 'FREE';
    if (normalized === 'PRO') return 'PRO';
    if (normalized === 'ENTERPRISE') return 'ENTERPRISE';

    return 'UNKNOWN';
  }

  private selectServices(input: ServiceEvaluationInput): EvaluatedMicroService[] {
    const serviceIdSet = new Set(input.serviceIds ?? []);
    const macroIdSet = new Set(input.macroServiceIds ?? []);
    const selectAll = serviceIdSet.size === 0 && macroIdSet.size === 0;
    const selected: EvaluatedMicroService[] = [];

    for (const macroService of BCOST_SERVICE_CATALOG) {
      if (!selectAll && macroIdSet.size > 0 && !macroIdSet.has(macroService.id)) {
        continue;
      }

      for (const microService of macroService.microServices) {
        const matchesService = serviceIdSet.size === 0 || serviceIdSet.has(microService.id);

        if (matchesService) {
          selected.push({
            ...microService,
            macroServiceId: macroService.id,
            macroServiceName: macroService.name,
          });
        }
      }
    }

    if (selected.length === 0) {
      throw new NotFoundException('Nenhum servico do catalogo corresponde aos filtros informados.');
    }

    return selected;
  }

  private buildConditions(
    input: ServiceEvaluationInput,
    plan: BcostPlan,
    services: EvaluatedMicroService[],
  ): ServiceCondition[] {
    const conditions: ServiceCondition[] = [];
    const activeCustomer = input.activeCustomer ?? true;
    const eventDate = this.parseDate(input.eventDate);
    const periodStart = this.parseDate(input.periodStart);
    const contractedAt = this.parseDate(input.contractedAt);
    const referenceDate = periodStart ?? eventDate;
    const isRetroactive =
      Boolean(contractedAt && referenceDate && referenceDate.getTime() < contractedAt.getTime());

    for (const service of services) {
      if (service.governmentFeesMayApply) {
        conditions.push({
          code: 'GOVERNMENT_FEES_NOT_INCLUDED',
          severity: 'WARNING',
          serviceId: service.id,
          message:
            'Taxas publicas, cartorio, correios, certificado avulso e custos de orgaos publicos nao fazem parte da gratuidade nem da mensalidade base.',
        });
      }

      if (service.addOnService) {
        conditions.push({
          code: 'ADDON_NOT_IN_BASE_MONTHLY_FEE',
          severity: 'WARNING',
          serviceId: service.id,
          message:
            'Servico avulso nao incluso na mensalidade padrao, salvo isencao expressa do plano contratado.',
        });
      }

      if (service.activeCustomersOnly && !activeCustomer) {
        conditions.push({
          code: 'ACTIVE_CUSTOMERS_ONLY',
          severity: 'BLOCKER',
          serviceId: service.id,
          message: 'Servicos avulsos sao prestados apenas para empresas ativas na base de clientes.',
        });
      }

      if (service.retroactiveSensitive && isRetroactive) {
        conditions.push({
          code: 'RETROACTIVE_PERIOD_NOT_INCLUDED',
          severity: 'WARNING',
          serviceId: service.id,
          message:
            'Periodos anteriores a contratacao nao fazem parte do plano padrao e exigem analise/orcamento separado.',
        });
      }

      if (service.expertsHonorariumWaivable && plan === 'EXPERTS') {
        conditions.push({
          code: isRetroactive
            ? 'EXPERTS_NO_RETROACTIVE_WAIVER'
            : 'EXPERTS_HONORARIUM_WAIVER',
          severity: isRetroactive ? 'WARNING' : 'INFO',
          serviceId: service.id,
          message: isRetroactive
            ? 'A isencao do Experts nao cobre pendencias retroativas ou fatos geradores anteriores a adesao.'
            : 'No Experts, os honorarios deste servico podem ser isentos durante a vigencia do plano.',
        });
      }

      if (service.municipalDependency && input.municipalityDigital === false) {
        conditions.push({
          code: 'MUNICIPAL_DIGITAL_DEPENDENCY',
          severity: 'WARNING',
          serviceId: service.id,
          message:
            'A execucao depende da legislacao local e do nivel de digitalizacao da prefeitura do municipio.',
        });
      }

      if (
        service.physicalProtocolMayApply &&
        (input.physicalProtocolRequired || input.municipalityDigital === false)
      ) {
        conditions.push({
          code: 'PHYSICAL_PROTOCOL_CUSTOMER_ACTION',
          severity: 'WARNING',
          serviceId: service.id,
          message:
            'Quando houver protocolo presencial/fisico, a plataforma fornece a documentacao e o cliente pode precisar protocolar localmente.',
        });
      }
    }

    return this.dedupeConditions(conditions);
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dedupeConditions(conditions: ServiceCondition[]): ServiceCondition[] {
    const seen = new Set<string>();
    const output: ServiceCondition[] = [];

    for (const condition of conditions) {
      const key = `${condition.serviceId || 'global'}:${condition.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(condition);
    }

    return output;
  }
}
