'use strict';

import { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import { OperationalWorkflowsService } from './operational-workflows.service.js';

describe('OperationalWorkflowsService', () => {
  let service: OperationalWorkflowsService;

  beforeEach(() => {
    service = new OperationalWorkflowsService(new ServiceCatalogService());
  });

  it('gera workflow oficial com revisao CRC para DCTFWeb', () => {
    const preview = service.preview({ serviceIds: ['dctfweb'] });

    expect(preview).toMatchObject({
      serviceId: 'dctfweb',
      automationLevel: 'HUMAN_VALIDATED',
      productionReadiness: 'BACKOFFICE_REQUIRED',
      operationalRisk: 'CRITICAL',
      operationalSummary: {
        dependencyStages: expect.any(Number),
        evidenceArtifacts: expect.any(Number),
        humanStages: expect.any(Number),
        readyStages: expect.any(Number),
        totalStages: expect.any(Number),
      },
      gates: {
        requiresCrcValidation: true,
        requiresOfficialCredential: true,
      },
    });
    expect(preview.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'government-rpa',
          actor: 'OFFICIAL_INTEGRATION',
          status: 'REQUIRES_INTEGRATION',
          runtimeStatus: 'WAITING_PUBLIC_AGENCY',
        }),
        expect.objectContaining({
          id: 'crc-review',
          actor: 'CRC_ACCOUNTANT',
          status: 'REQUIRES_CRC',
          runtimeStatus: 'WAITING_CRC_REVIEW',
        }),
      ]),
    );
    expect(preview.operationalSummary.humanStages).toBeGreaterThan(0);
    expect(preview.operationalSummary.evidenceArtifacts).toBeGreaterThan(0);
  });

  it('gera workflow assistido para servico municipal com protocolo fisico', () => {
    const preview = service.preview({
      serviceIds: ['business-license-issue-renewal'],
      municipalityDigital: false,
      physicalProtocolRequired: true,
    });

    expect(preview.gates.requiresCustomerAction).toBe(true);
    expect(preview.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'municipal-rpa',
          actor: 'PUBLIC_AGENCY',
        }),
        expect.objectContaining({
          id: 'manual-protocol',
          actor: 'BACKOFFICE_OPERATOR',
        }),
        expect.objectContaining({
          id: 'customer-action',
          actor: 'CUSTOMER',
          status: 'REQUIRES_CUSTOMER',
          runtimeStatus: 'WAITING_CUSTOMER',
        }),
      ]),
    );
  });
});
