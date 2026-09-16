'use strict';

import { NotFoundException } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service.js';

describe('ServiceCatalogService', () => {
  let service: ServiceCatalogService;

  beforeEach(() => {
    service = new ServiceCatalogService();
  });

  it('retorna os 16 macroservicos do catalogo', () => {
    expect(service.getCatalog()).toHaveLength(16);
  });

  it('mantem ids de macro e microservicos unicos', () => {
    const catalog = service.getCatalog();
    const macroIds = catalog.map((macro) => macro.id);
    const microIds = catalog.flatMap((macro) =>
      macro.microServices.map((micro) => micro.id),
    );

    expect(new Set(macroIds).size).toBe(macroIds.length);
    expect(new Set(microIds).size).toBe(microIds.length);
  });

  it('mantem fontes oficiais rastreaveis para servicos regulados', () => {
    const regulatedServices = service
      .getCatalog()
      .flatMap((macro) => macro.microServices)
      .filter((micro) => (micro.complianceTags?.length ?? 0) > 0);

    expect(regulatedServices.length).toBeGreaterThan(0);

    for (const micro of regulatedServices) {
      expect(micro.officialSources?.length).toBeGreaterThan(0);
      expect(micro.officialSources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: expect.any(String),
            url: expect.stringMatching(/^https:\/\/.+/),
          }),
        ]),
      );
    }
  });

  it('nao carrega nomes de concorrentes no catalogo operacional', () => {
    const text = JSON.stringify(service.getCatalog()).toLowerCase();

    expect(text).not.toContain('contabilizei');
    expect(text).not.toContain('dominio');
    expect(text).not.toContain('alterdata');
    expect(text).not.toContain('conta azul');
  });

  it('sinaliza taxas publicas fora da gratuidade na abertura de empresa', () => {
    const result = service.evaluate({
      serviceIds: ['company-opening'],
      plan: 'Padrao',
    });

    expect(result.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GOVERNMENT_FEES_NOT_INCLUDED',
          severity: 'WARNING',
        }),
      ]),
    );
  });

  it('bloqueia servico avulso quando a empresa nao esta ativa na base', () => {
    const result = service.evaluate({
      serviceIds: ['company-name-address-change'],
      activeCustomer: false,
    });

    expect(result.summary.blockers).toBe(1);
    expect(result.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ACTIVE_CUSTOMERS_ONLY',
          severity: 'BLOCKER',
        }),
      ]),
    );
  });

  it('aplica aviso de retroatividade e nao concede isencao Experts retroativa', () => {
    const result = service.evaluate({
      serviceIds: ['fiscal-pendency-regularization'],
      plan: 'Experts',
      contractedAt: '2026-08-01',
      periodStart: '2026-07-01',
    });

    expect(result.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RETROACTIVE_PERIOD_NOT_INCLUDED' }),
        expect.objectContaining({ code: 'EXPERTS_NO_RETROACTIVE_WAIVER' }),
      ]),
    );
  });

  it('alerta dependencia municipal e protocolo fisico', () => {
    const result = service.evaluate({
      serviceIds: ['business-license-issue-renewal'],
      municipalityDigital: false,
    });

    expect(result.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MUNICIPAL_DIGITAL_DEPENDENCY' }),
        expect.objectContaining({ code: 'PHYSICAL_PROTOCOL_CUSTOMER_ACTION' }),
      ]),
    );
  });

  it('exige revisao de fonte oficial para obrigacao tributaria regulada', () => {
    const result = service.evaluate({
      serviceIds: ['dctfweb'],
    });

    expect(result.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'OFFICIAL_RULE_REVIEW_REQUIRED',
          severity: 'INFO',
          serviceId: 'dctfweb',
        }),
      ]),
    );
  });

  it('classifica obrigacoes oficiais como workflow com credencial oficial e validacao CRC', () => {
    const result = service.evaluate({
      serviceIds: ['dctfweb'],
    });
    const dctfweb = result.selectedServices[0];

    expect(dctfweb.executionProfile).toMatchObject({
      automationLevel: 'HUMAN_VALIDATED',
      productionReadiness: 'BACKOFFICE_REQUIRED',
      operationalRisk: 'CRITICAL',
      requiresCrcValidation: true,
      requiresOfficialCredential: true,
    });
    expect(dctfweb.executionProfile.executionEngines).toEqual(
      expect.arrayContaining([
        'SOFTWARE_WORKFLOW',
        'GOVERNMENT_PORTAL_RPA',
        'CERTIFICATE_AUTH',
        'HUMAN_CRC_REVIEW',
      ]),
    );
    expect(result.summary.crcValidationServices).toBe(1);
    expect(result.summary.officialCredentialServices).toBe(1);
  });

  it('classifica dependencia municipal com protocolo fisico como operacao humana assistida', () => {
    const result = service.evaluate({
      serviceIds: ['business-license-issue-renewal'],
      municipalityDigital: false,
    });
    const serviceItem = result.selectedServices[0];

    expect(serviceItem.executionProfile).toMatchObject({
      automationLevel: 'HUMAN_LED',
      productionReadiness: 'BACKOFFICE_REQUIRED',
      requiresCustomerAction: true,
      requiresOfficialCredential: true,
    });
    expect(serviceItem.executionProfile.executionEngines).toEqual(
      expect.arrayContaining(['MUNICIPAL_RPA', 'MANUAL_PROTOCOL']),
    );
    expect(result.summary.customerActionServices).toBe(1);
  });

  it('falha quando nenhum servico corresponde ao filtro', () => {
    expect(() =>
      service.evaluate({
        serviceIds: ['unknown-service'],
      }),
    ).toThrow(NotFoundException);
  });
});
