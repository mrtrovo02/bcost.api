'use strict';

import { AccountingOffering } from './accounting-offerings.types.js';

export const ACCOUNTING_OFFERINGS: Omit<
  AccountingOffering,
  | 'requiredCapabilities'
  | 'marketStatus'
  | 'marketGuardrails'
  | 'launchReadinessScore'
  | 'commercialDecision'
  | 'activationRequirements'
  | 'activationSummary'
>[] = [
  {
    id: 'bcost-start',
    name: 'bCost Start',
    headline: 'Entrada assistida para abrir, migrar ou regularizar a operação contábil.',
    targetCustomers: ['ME', 'EPP', 'Prestadores de serviços', 'Profissionais liberais'],
    blocks: ['ONBOARDING_LEGALIZATION'],
    coverageItemIds: ['company-formation-engine', 'migration-traditional-accounting'],
    includedServices: [
      'Checklist de abertura ou migração',
      'Coleta de documentos',
      'Classificação de pendências',
      'Workflow de protocolo e evidências',
    ],
    excludedServices: [
      'Taxas públicas, cartórios e deslocamentos',
      'Promessa de deferimento por órgão público',
      'Regularizações retroativas sem diagnóstico',
    ],
  },
  {
    id: 'bcost-core',
    name: 'bCost Core',
    headline: 'Rotina recorrente fiscal, contábil e financeira para empresas de serviço.',
    targetCustomers: ['ME', 'EPP', 'Simples Nacional', 'Lucro Presumido em integração'],
    blocks: ['RECURRING_ACCOUNTING_TAX', 'SERVICE_ARCHITECTURE'],
    coverageItemIds: [
      'simples-tax-engine',
      'accessory-obligations-robot',
      'official-statements-engine',
      'service-delivery-matrix',
    ],
    includedServices: [
      'Apuração e controle de impostos',
      'Agenda de obrigações',
      'Demonstrações contábeis com revisão técnica',
      'Esteira de evidências e auditoria',
    ],
    excludedServices: [
      'Entrega automática sem certificado/credencial válida',
      'Assinatura técnica sem contador responsável',
      'Obrigação acessória fora do regime ou sem evento aplicável',
    ],
  },
  {
    id: 'bcost-people',
    name: 'bCost People',
    headline: 'Pró-labore, folha básica e encargos com governança trabalhista.',
    targetCustomers: ['Sócios administradores', 'Empresas com folha básica', 'Prestadores com pró-labore'],
    blocks: ['RECURRING_ACCOUNTING_TAX'],
    coverageItemIds: ['payroll-prolabore-engine'],
    includedServices: [
      'Cálculo de pró-labore',
      'Folha básica',
      'INSS, IRRF e FGTS quando aplicável',
      'Eventos eSocial/DCTFWeb em esteira assistida',
    ],
    excludedServices: [
      'SST complexo sem documentação específica',
      'Acordos coletivos não parametrizados',
      'Passivo trabalhista retroativo sem diagnóstico',
    ],
  },
  {
    id: 'bcost-issue',
    name: 'bCost Issue',
    headline: 'Emissão fiscal e documentos eletrônicos com cobertura municipal/SEFAZ.',
    targetCustomers: ['Prestadores de serviços', 'Comércio em integração', 'Empresas com NFS-e recorrente'],
    blocks: ['FINTECH_VALUE_ADDED'],
    coverageItemIds: ['universal-nfse-issuer'],
    includedServices: [
      'Cadastro fiscal do emissor',
      'Integração NFS-e/NF-e por cobertura',
      'XML, protocolo e eventos fiscais',
      'Cancelamento/substituição quando suportado',
    ],
    excludedServices: [
      'Municípios sem cobertura digital ou sem protocolo definido',
      'Emissão sem certificado/credencial exigida',
      'Configurações fiscais sem validação técnica',
    ],
  },
  {
    id: 'bcost-fintech',
    name: 'bCost Fintech',
    headline: 'Conta PJ, Open Finance e conciliação como extensão da contabilidade.',
    targetCustomers: ['Empresas com alto volume bancário', 'Prestadores recorrentes', 'Operações multi-conta'],
    blocks: ['FINTECH_VALUE_ADDED'],
    coverageItemIds: ['embedded-pj-account'],
    includedServices: [
      'Consentimento Open Finance',
      'Importação e conciliação bancária',
      'Base para conta PJ via parceiro regulado',
      'Trilha de auditoria financeira',
    ],
    excludedServices: [
      'Serviços financeiros sem parceiro regulado',
      'Crédito, câmbio ou produto bancário sem autorização específica',
      'Garantia de aprovação KYC/KYB',
    ],
  },
  {
    id: 'bcost-office',
    name: 'bCost Office',
    headline: 'Endereço fiscal e escritório virtual com elegibilidade municipal.',
    targetCustomers: ['Prestadores de serviços', 'Empresas remotas', 'Profissionais liberais'],
    blocks: ['FINTECH_VALUE_ADDED', 'ONBOARDING_LEGALIZATION'],
    coverageItemIds: ['virtual-office-fiscal-address'],
    includedServices: [
      'Análise de elegibilidade municipal',
      'Contrato e documentação de endereço fiscal',
      'Acompanhamento de inscrição/alvará quando aplicável',
      'Backoffice de protocolo',
    ],
    excludedServices: [
      'Município sem permissão para a atividade',
      'Uso como estabelecimento físico sem contrato compatível',
      'Licenças especiais sem análise separada',
    ],
  },
];
