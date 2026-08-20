'use strict';

import { AccountingPlatformCoverageItem } from './accounting-platform.types.js';

export const ACCOUNTING_PLATFORM_COVERAGE: AccountingPlatformCoverageItem[] = [
  {
    id: 'company-formation-engine',
    block: 'ONBOARDING_LEGALIZATION',
    title: 'Motor de abertura de empresas',
    objective:
      'Conduzir viabilidade, contrato social, CNAE, natureza jurídica, Redesim/Junta, CNPJ e inscrições locais.',
    engineeringExecution:
      'Workflow documental, geração de minutas, RPA/API de órgãos públicos quando disponível, backoffice societário e evidência de protocolo/deferimento.',
    bcostModules: ['company-formation', 'companies', 'document-management', 'service-catalog'],
    serviceCatalogIds: ['company-opening', 'constitutive-acts', 'municipal-state-registrations'],
    requiredCapabilities: [
      'CUSTOMER_PORTAL',
      'BACKOFFICE_TEAM',
      'MUNICIPAL_COVERAGE',
      'OFFICIAL_PORTAL_ACCESS',
      'AUDIT_EVIDENCE_STORE',
    ],
    automationBoundary: 'HUMAN_LED',
    maturity: 'PLANNED',
    officialEvidence: ['Protocolo Redesim/Junta', 'CNPJ deferido', 'Inscrição municipal/estadual'],
  },
  {
    id: 'migration-traditional-accounting',
    block: 'ONBOARDING_LEGALIZATION',
    title: 'Migração de contabilidade e MEI para ME',
    objective:
      'Receber documentos, validar pendências, importar histórico, regularizar competências e formalizar transição operacional.',
    engineeringExecution:
      'Checklist de documentos, importação de XML/guias/relatórios, conciliação inicial, avaliação de retroatividade e revisão por contador.',
    bcostModules: ['document-management', 'accounting-office', 'compliance-checks', 'audit-intelligence'],
    serviceCatalogIds: ['mei-to-me-migration', 'fiscal-pendency-regularization'],
    requiredCapabilities: ['CUSTOMER_PORTAL', 'BACKOFFICE_TEAM', 'CRC_ACCOUNTANT', 'AUDIT_EVIDENCE_STORE'],
    automationBoundary: 'CRC_VALIDATED',
    maturity: 'REQUIRES_HUMAN_OPERATION',
    officialEvidence: ['Termo de migração', 'Checklist documental', 'Parecer de pendências'],
  },
  {
    id: 'simples-tax-engine',
    block: 'RECURRING_ACCOUNTING_TAX',
    title: 'Apuração Simples Nacional, DAS e fator R',
    objective:
      'Calcular receita por competência/caixa, anexos, fator R, imposto estimado e emissão/controle do DAS.',
    engineeringExecution:
      'Motor fiscal parametrizado por regime, CNAE, anexo, folha, receita, PGDAS-D e evidência de guia/recibo oficial.',
    bcostModules: ['tax-calculations', 'tax-obligations', 'revenue', 'payrolls'],
    serviceCatalogIds: ['pgdas-d-das', 'tax-assessment', 'tax-guides'],
    requiredCapabilities: [
      'DIGITAL_CERTIFICATE',
      'OFFICIAL_PORTAL_ACCESS',
      'CRC_ACCOUNTANT',
      'AUDIT_EVIDENCE_STORE',
    ],
    automationBoundary: 'CRC_VALIDATED',
    maturity: 'INTEGRATING',
    officialEvidence: ['Recibo PGDAS-D', 'Guia DAS', 'Memória de cálculo do fator R'],
  },
  {
    id: 'accessory-obligations-robot',
    block: 'RECURRING_ACCOUNTING_TAX',
    title: 'Robôs de obrigações acessórias',
    objective:
      'Controlar e transmitir DEFIS, DCTFWeb, EFD-Reinf, SPED, ECD/ECF, eSocial e FGTS Digital quando aplicável.',
    engineeringExecution:
      'Agenda fiscal, geração de arquivos/eventos, validação de leiaute, transmissão via portal/API/RPA, recibos oficiais e revisão CRC.',
    bcostModules: ['fiscal-obligations', 'obligations-enterprise', 'automation-jobs', 'notifications'],
    serviceCatalogIds: ['defis', 'dctfweb', 'efd-reinf', 'efd-icms-ipi', 'efd-contributions'],
    requiredCapabilities: [
      'DIGITAL_CERTIFICATE',
      'OFFICIAL_PORTAL_ACCESS',
      'BACKOFFICE_TEAM',
      'CRC_ACCOUNTANT',
      'AUDIT_EVIDENCE_STORE',
    ],
    automationBoundary: 'CRC_VALIDATED',
    maturity: 'INTEGRATING',
    officialEvidence: ['Arquivo validado', 'Recibo de transmissão', 'Protocolo oficial'],
  },
  {
    id: 'official-statements-engine',
    block: 'RECURRING_ACCOUNTING_TAX',
    title: 'Demonstrações oficiais e livros',
    objective:
      'Gerar BP, DRE, Livro Caixa, razão, balancete, ECD/ECF e documentos assinados por responsável técnico.',
    engineeringExecution:
      'Plano de contas, lançamentos automáticos revisáveis, travas de competência, fechamento contábil e assinatura CRC.',
    bcostModules: ['account-plan', 'accounting-entries', 'balance-sheet', 'income-statement'],
    serviceCatalogIds: ['financial-statements', 'accounting-books', 'ecd-bookkeeping', 'ecf-tax-accounting'],
    requiredCapabilities: ['CRC_ACCOUNTANT', 'AUDIT_EVIDENCE_STORE', 'BACKOFFICE_TEAM'],
    automationBoundary: 'CRC_VALIDATED',
    maturity: 'INTEGRATING',
    officialEvidence: ['BP/DRE assinados', 'Livro Caixa', 'Trava de competência', 'Termo de abertura/encerramento'],
  },
  {
    id: 'payroll-prolabore-engine',
    block: 'RECURRING_ACCOUNTING_TAX',
    title: 'Departamento pessoal e pró-labore',
    objective:
      'Gerar pró-labore, folha básica, INSS, IRRF, FGTS, eventos eSocial e DCTFWeb previdenciária.',
    engineeringExecution:
      'Motor de folha, tabelas oficiais vigentes, eventos eSocial, FGTS Digital, DCTFWeb e revisão trabalhista/contábil.',
    bcostModules: ['employees', 'payrolls', 'payroll-entries', 'payroll-lifecycle'],
    serviceCatalogIds: ['payroll-processing', 'labor-charges', 'esocial-dctfweb-fgts'],
    requiredCapabilities: [
      'DIGITAL_CERTIFICATE',
      'OFFICIAL_PORTAL_ACCESS',
      'CRC_ACCOUNTANT',
      'AUDIT_EVIDENCE_STORE',
    ],
    automationBoundary: 'CRC_VALIDATED',
    maturity: 'INTEGRATING',
    officialEvidence: ['Folha fechada', 'DARF/INSS', 'FGTS Digital', 'Recibos eSocial'],
  },
  {
    id: 'universal-nfse-issuer',
    block: 'FINTECH_VALUE_ADDED',
    title: 'Emissor universal de NFS-e',
    objective:
      'Emitir NFS-e/NF-e pelo painel bCost com suporte a município, tomador, serviço, impostos, cancelamento e substituição.',
    engineeringExecution:
      'Adaptador por prefeitura/emissor nacional, API quando existir, RPA quando inevitável, certificado digital e XML/protocolo.',
    bcostModules: ['invoices', 'sefaz-events', 'digital-certificates', 'automation-jobs'],
    serviceCatalogIds: ['nfse-guidance', 'invoice-issue-control'],
    requiredCapabilities: [
      'DIGITAL_CERTIFICATE',
      'OFFICIAL_API_PROVIDER',
      'MUNICIPAL_COVERAGE',
      'OFFICIAL_PORTAL_ACCESS',
      'AUDIT_EVIDENCE_STORE',
    ],
    automationBoundary: 'ASSISTED_AUTOMATION',
    maturity: 'REQUIRES_PARTNER',
    officialEvidence: ['XML autorizado', 'Protocolo de emissão', 'Evento de cancelamento/substituição'],
  },
  {
    id: 'embedded-pj-account',
    block: 'FINTECH_VALUE_ADDED',
    title: 'Conta PJ embarcada e conciliação',
    objective:
      'Oferecer conta PJ/parceiro financeiro, importar extratos, conciliar receitas, guias, folha e documentos fiscais.',
    engineeringExecution:
      'BaaS regulado, KYC/KYB, webhooks bancários, Open Finance, conciliação automática e trilha de auditoria.',
    bcostModules: ['bank-accounts', 'bank-transactions', 'reconciliation', 'banking-products'],
    serviceCatalogIds: ['banking-conciliation', 'cash-management'],
    requiredCapabilities: ['BAAS_PARTNER', 'OPEN_FINANCE_PROVIDER', 'AUDIT_EVIDENCE_STORE'],
    automationBoundary: 'ASSISTED_AUTOMATION',
    maturity: 'REQUIRES_PARTNER',
    officialEvidence: ['Consentimento Open Finance', 'Extrato sincronizado', 'Evento de conciliação'],
  },
  {
    id: 'virtual-office-fiscal-address',
    block: 'FINTECH_VALUE_ADDED',
    title: 'Endereço fiscal e escritório virtual',
    objective:
      'Oferecer domicílio fiscal oficial para prestadores de serviço conforme município, contrato e restrições locais.',
    engineeringExecution:
      'Gestão contratual, elegibilidade municipal, documentos, autorizações, backoffice e acompanhamento de inscrição/alvará.',
    bcostModules: ['accounting-office', 'contracts', 'document-management', 'company-formation'],
    serviceCatalogIds: ['virtual-office', 'business-license-issue-renewal'],
    requiredCapabilities: ['BACKOFFICE_TEAM', 'MUNICIPAL_COVERAGE', 'CUSTOMER_PORTAL', 'AUDIT_EVIDENCE_STORE'],
    automationBoundary: 'HUMAN_LED',
    maturity: 'PLANNED',
    officialEvidence: ['Contrato de endereço fiscal', 'Comprovante de inscrição', 'Alvará quando aplicável'],
  },
  {
    id: 'service-delivery-matrix',
    block: 'SERVICE_ARCHITECTURE',
    title: 'Matriz plataforma versus operação humana',
    objective:
      'Controlar quais serviços são software-only, automação assistida, validação CRC ou operação humana.',
    engineeringExecution:
      'Service catalog, operational workflows, capabilities registry, SLA, auditoria, evidências e RBAC por empresa.',
    bcostModules: ['service-catalog', 'operational-workflows', 'audit-logs', 'command-center'],
    serviceCatalogIds: [],
    requiredCapabilities: ['BACKOFFICE_TEAM', 'CRC_ACCOUNTANT', 'AUDIT_EVIDENCE_STORE'],
    automationBoundary: 'ASSISTED_AUTOMATION',
    maturity: 'ACTIVE',
    officialEvidence: ['Matriz de escopo', 'Workflow operacional', 'Log de auditoria'],
  },
];
