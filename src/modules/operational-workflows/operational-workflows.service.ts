'use strict';

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EvaluatedMicroService,
  ServiceExecutionEngine,
  ServiceEvaluationInput,
} from '../service-catalog/service-catalog.types.js';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import {
  OperationalWorkflowActor,
  OperationalWorkflowPreview,
  OperationalWorkflowStage,
  OperationalWorkflowStageStatus,
} from './operational-workflow.types.js';

@Injectable()
export class OperationalWorkflowsService {
  constructor(private readonly serviceCatalog: ServiceCatalogService) {}

  preview(input: ServiceEvaluationInput): OperationalWorkflowPreview {
    const result = this.serviceCatalog.evaluate(input);
    const service = result.selectedServices[0];

    if (!service) {
      throw new BadRequestException(
        'Informe ao menos um microservico para gerar o workflow operacional.',
      );
    }

    return this.buildPreview(service);
  }

  previewByServiceId(serviceId: string): OperationalWorkflowPreview {
    return this.preview({ serviceIds: [serviceId] });
  }

  private buildPreview(
    service: EvaluatedMicroService,
  ): OperationalWorkflowPreview {
    return {
      serviceId: service.id,
      serviceName: service.name,
      macroServiceId: service.macroServiceId,
      macroServiceName: service.macroServiceName,
      automationLevel: service.executionProfile.automationLevel,
      productionReadiness: service.executionProfile.productionReadiness,
      operationalRisk: service.executionProfile.operationalRisk,
      stages: this.buildStages(service),
      gates: {
        requiresCrcValidation: service.executionProfile.requiresCrcValidation,
        requiresOfficialCredential:
          service.executionProfile.requiresOfficialCredential,
        requiresCustomerAction: service.executionProfile.requiresCustomerAction,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildStages(service: EvaluatedMicroService): OperationalWorkflowStage[] {
    const stages: OperationalWorkflowStage[] = [
      {
        id: 'request-intake',
        title: 'Captura e classificacao da solicitacao',
        actor: 'BCOST_SOFTWARE',
        status: 'READY',
        executionEngine: 'SOFTWARE_WORKFLOW',
        evidenceRequired: [
          'Empresa, solicitante, plano, competencia/fato gerador e servico selecionado.',
          'Condicionantes comerciais e regulatórias calculadas pelo catalogo.',
        ],
      },
      {
        id: 'scope-validation',
        title: 'Validacao de escopo, bloqueios e documentos',
        actor: 'BACKOFFICE_OPERATOR',
        status:
          service.executionProfile.operationalRisk === 'LOW'
            ? 'READY'
            : 'REQUIRES_BACKOFFICE',
        executionEngine: 'SOFTWARE_WORKFLOW',
        evidenceRequired: [
          'Checklist de documentos, plano contratado, retroatividade e taxas externas.',
        ],
      },
    ];

    for (const engine of service.executionProfile.executionEngines) {
      const stage = this.stageForEngine(engine, service);
      if (stage && !stages.some((item) => item.id === stage.id)) {
        stages.push(stage);
      }
    }

    if (service.executionProfile.requiresCustomerAction) {
      stages.push({
        id: 'customer-action',
        title: 'Acao obrigatoria do cliente',
        actor: 'CUSTOMER',
        status: 'REQUIRES_CUSTOMER',
        executionEngine: 'MANUAL_PROTOCOL',
        evidenceRequired: [
          'Documento, protocolo fisico, assinatura ou comprovante enviado pelo cliente.',
        ],
      });
    }

    if (service.executionProfile.requiresCrcValidation) {
      stages.push({
        id: 'crc-review',
        title: 'Revisao e validacao por contador responsavel',
        actor: 'CRC_ACCOUNTANT',
        status: 'REQUIRES_CRC',
        executionEngine: 'HUMAN_CRC_REVIEW',
        evidenceRequired: [
          'Parecer, aprovacao ou assinatura tecnica do responsavel contabil.',
        ],
      });
    }

    stages.push({
      id: 'evidence-closeout',
      title: 'Encerramento com evidencias e auditoria',
      actor: 'BCOST_SOFTWARE',
      status: 'READY',
      executionEngine: 'SOFTWARE_WORKFLOW',
      evidenceRequired:
        service.executionProfile.evidenceArtifacts.length > 0
          ? service.executionProfile.evidenceArtifacts
          : ['Log final, protocolo, recibo ou comprovante do workflow.'],
    });

    return stages;
  }

  private stageForEngine(
    engine: ServiceExecutionEngine,
    service: EvaluatedMicroService,
  ): OperationalWorkflowStage | null {
    const evidence = service.executionProfile.evidenceArtifacts.slice(0, 3);

    const stageMap: Record<
      ServiceExecutionEngine,
      {
        id: string;
        title: string;
        actor: OperationalWorkflowActor;
        status: OperationalWorkflowStageStatus;
      }
    > = {
      SOFTWARE_WORKFLOW: {
        id: 'software-processing',
        title: 'Processamento interno automatizado',
        actor: 'BCOST_SOFTWARE',
        status: 'READY',
      },
      OFFICIAL_API: {
        id: 'official-api',
        title: 'Execucao via API oficial ou provedor homologado',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
      },
      GOVERNMENT_PORTAL_RPA: {
        id: 'government-rpa',
        title: 'Execucao em portal governamental',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
      },
      MUNICIPAL_RPA: {
        id: 'municipal-rpa',
        title: 'Execucao em prefeitura ou emissor municipal',
        actor: 'PUBLIC_AGENCY',
        status: 'REQUIRES_INTEGRATION',
      },
      CERTIFICATE_AUTH: {
        id: 'certificate-auth',
        title: 'Autenticacao com certificado digital ou credencial oficial',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
      },
      BANKING_AS_A_SERVICE: {
        id: 'baas-partner',
        title: 'Execucao com parceiro financeiro regulado',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
      },
      OPEN_FINANCE: {
        id: 'open-finance-consent',
        title: 'Consentimento e sincronizacao Open Finance',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
      },
      HUMAN_CRC_REVIEW: {
        id: 'crc-review',
        title: 'Revisao e validacao por contador responsavel',
        actor: 'CRC_ACCOUNTANT',
        status: 'REQUIRES_CRC',
      },
      MANUAL_PROTOCOL: {
        id: 'manual-protocol',
        title: 'Protocolo manual, fisico ou assistido',
        actor: 'BACKOFFICE_OPERATOR',
        status: 'REQUIRES_BACKOFFICE',
      },
    };

    const stage = stageMap[engine];
    return {
      ...stage,
      executionEngine: engine,
      evidenceRequired:
        evidence.length > 0
          ? evidence
          : ['Protocolo, recibo, log ou comprovante produzido nesta etapa.'],
    };
  }
}
