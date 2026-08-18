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
  OperationalWorkflowRuntimeStatus,
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
    const stages = this.buildStages(service);

    return {
      serviceId: service.id,
      serviceName: service.name,
      macroServiceId: service.macroServiceId,
      macroServiceName: service.macroServiceName,
      automationLevel: service.executionProfile.automationLevel,
      productionReadiness: service.executionProfile.productionReadiness,
      operationalRisk: service.executionProfile.operationalRisk,
      stages,
      operationalSummary: this.buildOperationalSummary(stages),
      gates: {
        requiresCrcValidation: service.executionProfile.requiresCrcValidation,
        requiresOfficialCredential:
          service.executionProfile.requiresOfficialCredential,
        requiresCustomerAction: service.executionProfile.requiresCustomerAction,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private buildStages(
    service: EvaluatedMicroService,
  ): OperationalWorkflowStage[] {
    const stages: OperationalWorkflowStage[] = [
      {
        id: 'request-intake',
        title: 'Captura e classificacao da solicitacao',
        actor: 'BCOST_SOFTWARE',
        status: 'READY',
        runtimeStatus: 'READY_TO_RUN',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
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
        runtimeStatus:
          service.executionProfile.operationalRisk === 'LOW'
            ? 'READY_TO_RUN'
            : 'WAITING_DEPENDENCY',
        allowedTransitions:
          service.executionProfile.operationalRisk === 'LOW'
            ? ['IN_PROGRESS', 'DONE', 'BLOCKED']
            : ['IN_PROGRESS', 'BLOCKED'],
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
        runtimeStatus: 'WAITING_CUSTOMER',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
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
        runtimeStatus: 'WAITING_CRC_REVIEW',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
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
      runtimeStatus: 'READY_TO_RUN',
      allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
      executionEngine: 'SOFTWARE_WORKFLOW',
      evidenceRequired:
        service.executionProfile.evidenceArtifacts.length > 0
          ? service.executionProfile.evidenceArtifacts
          : ['Log final, protocolo, recibo ou comprovante do workflow.'],
    });

    return stages;
  }

  private buildOperationalSummary(stages: OperationalWorkflowStage[]) {
    return {
      totalStages: stages.length,
      readyStages: stages.filter(
        (stage) => stage.runtimeStatus === 'READY_TO_RUN',
      ).length,
      dependencyStages: stages.filter((stage) =>
        [
          'WAITING_DEPENDENCY',
          'WAITING_CUSTOMER',
          'WAITING_PUBLIC_AGENCY',
          'WAITING_CRC_REVIEW',
        ].includes(stage.runtimeStatus),
      ).length,
      humanStages: stages.filter((stage) =>
        ['BACKOFFICE_OPERATOR', 'CRC_ACCOUNTANT', 'CUSTOMER'].includes(
          stage.actor,
        ),
      ).length,
      evidenceArtifacts: stages.reduce(
        (total, stage) => total + stage.evidenceRequired.length,
        0,
      ),
    };
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
        runtimeStatus: OperationalWorkflowRuntimeStatus;
        allowedTransitions: OperationalWorkflowRuntimeStatus[];
        blockingReason?: string;
      }
    > = {
      SOFTWARE_WORKFLOW: {
        id: 'software-processing',
        title: 'Processamento interno automatizado',
        actor: 'BCOST_SOFTWARE',
        status: 'READY',
        runtimeStatus: 'READY_TO_RUN',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
      },
      OFFICIAL_API: {
        id: 'official-api',
        title: 'Execucao via API oficial ou provedor homologado',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_DEPENDENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de API oficial, provedor homologado ou credencial configurada.',
      },
      GOVERNMENT_PORTAL_RPA: {
        id: 'government-rpa',
        title: 'Execucao em portal governamental',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_PUBLIC_AGENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de disponibilidade do portal publico, credencial e leiaute vigente.',
      },
      MUNICIPAL_RPA: {
        id: 'municipal-rpa',
        title: 'Execucao em prefeitura ou emissor municipal',
        actor: 'PUBLIC_AGENCY',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_PUBLIC_AGENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de regra municipal, portal local ou emissor nacional aplicavel.',
      },
      CERTIFICATE_AUTH: {
        id: 'certificate-auth',
        title: 'Autenticacao com certificado digital ou credencial oficial',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_DEPENDENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de certificado digital valido, procuração eletronica ou credencial oficial.',
      },
      BANKING_AS_A_SERVICE: {
        id: 'baas-partner',
        title: 'Execucao com parceiro financeiro regulado',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_DEPENDENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de parceiro regulado, KYC/KYB e contrato de integracao.',
      },
      OPEN_FINANCE: {
        id: 'open-finance-consent',
        title: 'Consentimento e sincronizacao Open Finance',
        actor: 'OFFICIAL_INTEGRATION',
        status: 'REQUIRES_INTEGRATION',
        runtimeStatus: 'WAITING_CUSTOMER',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason: 'Depende de consentimento ativo do cliente.',
      },
      HUMAN_CRC_REVIEW: {
        id: 'crc-review',
        title: 'Revisao e validacao por contador responsavel',
        actor: 'CRC_ACCOUNTANT',
        status: 'REQUIRES_CRC',
        runtimeStatus: 'WAITING_CRC_REVIEW',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de contador responsavel e registro de aprovacao tecnica.',
      },
      MANUAL_PROTOCOL: {
        id: 'manual-protocol',
        title: 'Protocolo manual, fisico ou assistido',
        actor: 'BACKOFFICE_OPERATOR',
        status: 'REQUIRES_BACKOFFICE',
        runtimeStatus: 'WAITING_DEPENDENCY',
        allowedTransitions: ['IN_PROGRESS', 'DONE', 'BLOCKED'],
        blockingReason:
          'Depende de documentacao, protocolo assistido ou atendimento operacional.',
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
