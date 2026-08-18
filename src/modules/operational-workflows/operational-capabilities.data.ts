'use strict';

import {
  OperationalCapability,
  OperationalCapabilityDefinition,
} from './operational-workflow.types.js';

export const OPERATIONAL_CAPABILITIES: Record<
  OperationalCapability,
  OperationalCapabilityDefinition
> = {
  CUSTOMER_PORTAL: {
    code: 'CUSTOMER_PORTAL',
    label: 'Portal do cliente',
    description:
      'Área autenticada para coletar documentos, autorizações, assinaturas e ações pendentes do cliente.',
    category: 'PLATFORM',
    criticality: 'HIGH',
  },
  BACKOFFICE_TEAM: {
    code: 'BACKOFFICE_TEAM',
    label: 'Backoffice operacional',
    description:
      'Equipe interna para revisar escopo, conduzir protocolos, acompanhar órgãos públicos e tratar exceções.',
    category: 'BACKOFFICE',
    criticality: 'CRITICAL',
  },
  CRC_ACCOUNTANT: {
    code: 'CRC_ACCOUNTANT',
    label: 'Contador responsável CRC',
    description:
      'Profissional habilitado para validação técnica, assinatura e responsabilidade contábil/fiscal.',
    category: 'REGULATORY',
    criticality: 'CRITICAL',
  },
  DIGITAL_CERTIFICATE: {
    code: 'DIGITAL_CERTIFICATE',
    label: 'Certificado digital',
    description:
      'Certificado A1/A3, procuração eletrônica ou credencial equivalente para operar portais oficiais.',
    category: 'GOVERNMENT',
    criticality: 'CRITICAL',
  },
  OFFICIAL_PORTAL_ACCESS: {
    code: 'OFFICIAL_PORTAL_ACCESS',
    label: 'Acesso a portal oficial',
    description:
      'Acesso controlado a Receita Federal, Simples Nacional, SPED, eSocial, FGTS Digital, SEFAZ ou prefeitura.',
    category: 'GOVERNMENT',
    criticality: 'CRITICAL',
  },
  OFFICIAL_API_PROVIDER: {
    code: 'OFFICIAL_API_PROVIDER',
    label: 'API/provedor homologado',
    description:
      'Integração oficial ou provedor homologado para emissão, transmissão, consulta ou baixa de documentos.',
    category: 'GOVERNMENT',
    criticality: 'HIGH',
  },
  MUNICIPAL_COVERAGE: {
    code: 'MUNICIPAL_COVERAGE',
    label: 'Cobertura municipal',
    description:
      'Mapeamento de prefeitura, emissor NFS-e, regras locais, credenciais e alternativa de protocolo.',
    category: 'GOVERNMENT',
    criticality: 'HIGH',
  },
  BAAS_PARTNER: {
    code: 'BAAS_PARTNER',
    label: 'Parceiro BaaS regulado',
    description:
      'Parceiro financeiro autorizado para conta PJ, pagamentos, boletos, KYC/KYB e liquidação.',
    category: 'FINTECH',
    criticality: 'CRITICAL',
  },
  OPEN_FINANCE_PROVIDER: {
    code: 'OPEN_FINANCE_PROVIDER',
    label: 'Open Finance',
    description:
      'Integração de consentimento, sincronização bancária e conciliação com instituição participante.',
    category: 'FINTECH',
    criticality: 'HIGH',
  },
  AUDIT_EVIDENCE_STORE: {
    code: 'AUDIT_EVIDENCE_STORE',
    label: 'Cofre de evidências',
    description:
      'Armazenamento auditável de recibos, protocolos, XMLs, guias, pareceres, logs e anexos.',
    category: 'AUDIT',
    criticality: 'CRITICAL',
  },
};

export function listOperationalCapabilities(): OperationalCapabilityDefinition[] {
  return Object.values(OPERATIONAL_CAPABILITIES);
}
