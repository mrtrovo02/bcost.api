'use strict';

import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import { OperationalWorkflowsController } from './operational-workflows.controller.js';
import { OperationalWorkflowsService } from './operational-workflows.service.js';

describe('OperationalWorkflowsController', () => {
  const reflector = new Reflector();

  function buildController() {
    return new OperationalWorkflowsController(
      new OperationalWorkflowsService(new ServiceCatalogService()),
    );
  }

  it('mantem endpoints protegidos pelos guards globais de autenticacao e tenant', () => {
    const controllerTargets = [
      OperationalWorkflowsController,
      OperationalWorkflowsController.prototype.capabilities,
      OperationalWorkflowsController.prototype.previewByServiceId,
      OperationalWorkflowsController.prototype.preview,
    ];

    for (const target of controllerTargets) {
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          target,
          OperationalWorkflowsController,
        ]),
      ).toBeUndefined();
    }
  });

  it('retorna capabilities com contrato estavel para a camada enterprise', () => {
    const controller = buildController();
    const response = controller.capabilities();

    expect(response.status).toBe('OK');
    expect(response.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AUDIT_EVIDENCE_STORE',
          criticality: 'CRITICAL',
        }),
      ]),
    );
    expect(response.generatedAt).toEqual(expect.any(String));
  });

  it('gera preview por serviceId sem fallback demonstrativo', () => {
    const controller = buildController();
    const response = controller.previewByServiceId('dctfweb');

    expect(response).toMatchObject({
      status: 'OK',
      workflow: {
        serviceId: 'dctfweb',
        gates: {
          requiresCrcValidation: true,
          requiresOfficialCredential: true,
        },
      },
    });
  });
});
