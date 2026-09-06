'use strict';

import { MacroServiceDefinition } from './service-catalog.types.js';

export const BCOST_SERVICE_CATALOG: MacroServiceDefinition[] = [
  {
    id: 1,
    name: 'Abertura e Estruturação de Empresas',
    description:
      'Criação do CNPJ e definição inicial da estrutura empresarial.',
    microServices: [
      {
        id: 'company-opening',
        name: 'Abertura de empresa',
        governmentFeesMayApply: true,
        notes: [
          'A gratuidade cobre honorários contábeis da plataforma, não taxas públicas.',
        ],
      },
      {
        id: 'cnpj-registration',
        name: 'Registro de CNPJ',
        governmentFeesMayApply: true,
      },
      { id: 'legal-nature-definition', name: 'Definição de natureza jurídica' },
      { id: 'cnae-framing', name: 'Escolha e enquadramento de CNAEs' },
      { id: 'tax-regime-guidance', name: 'Orientação sobre regime tributário' },
      {
        id: 'constitutive-acts',
        name: 'Elaboração e registro dos atos constitutivos',
        governmentFeesMayApply: true,
      },
      {
        id: 'municipal-state-registrations',
        name: 'Inscrições municipais e estaduais',
        governmentFeesMayApply: true,
        municipalDependency: true,
      },
      {
        id: 'government-fee-guidance',
        name: 'Orientação sobre taxas governamentais',
        governmentFeesMayApply: true,
      },
      { id: 'opening-onboarding', name: 'Reunião coletiva de integração' },
      {
        id: 'opening-tracking',
        name: 'Acompanhamento digital do processo de abertura',
      },
      {
        id: 'mei-to-me-migration',
        name: 'Desenquadramento/Migração de MEI para ME',
        governmentFeesMayApply: true,
        addOnService: true,
        expertsHonorariumWaivable: true,
      },
      {
        id: 'ltda-ei-to-mei',
        name: 'Transformação de Limitada/EI em MEI',
        governmentFeesMayApply: true,
        addOnService: true,
        expertsHonorariumWaivable: true,
      },
      { id: 'virtual-office', name: 'Escritório Virtual', addOnService: true },
    ],
  },
  {
    id: 2,
    name: 'Contabilidade Recorrente',
    description:
      'Núcleo operacional dos planos mensais para manutenção da conformidade.',
    microServices: [
      {
        id: 'accounting-bookkeeping',
        name: 'Escrituração contábil diária/mensal',
      },
      {
        id: 'financial-classification',
        name: 'Classificação e lançamento de movimentações financeiras',
      },
      { id: 'periodic-accounting', name: 'Apuração contábil periódica' },
      { id: 'financial-statements', name: 'Balanço Patrimonial e DRE' },
      { id: 'accounting-books', name: 'Emissão e guarda de livros contábeis' },
      {
        id: 'accounting-obligations',
        name: 'Entrega de obrigações acessórias contábeis',
        complianceTags: ['ECD', 'ECF', 'SPED'],
        officialSources: [
          { label: 'Portal SPED - ECD/ECF', url: 'https://sped.rfb.gov.br/' },
        ],
        notes: [
          'ECD e ECF devem observar leiautes, manuais e validadores vigentes publicados no Portal SPED.',
        ],
      },
      {
        id: 'ecd-bookkeeping',
        name: 'ECD - Escrituração Contábil Digital',
        complianceTags: ['ECD', 'SPED', 'Contábil'],
        officialSources: [
          { label: 'Portal SPED - ECD', url: 'https://sped.rfb.gov.br/' },
        ],
        notes: [
          'Obrigação digital sujeita ao leiaute e ao programa validador vigente no ano-calendário/situação especial.',
        ],
      },
      {
        id: 'ecf-tax-accounting',
        name: 'ECF - Escrituração Contábil Fiscal',
        complianceTags: ['ECF', 'IRPJ', 'CSLL', 'SPED'],
        officialSources: [
          { label: 'Portal SPED - ECF', url: 'https://sped.rfb.gov.br/' },
        ],
        notes: [
          'A ECF deve seguir o manual e leiaute aplicável ao ano-calendário, inclusive regras de IRPJ/CSLL e situações especiais.',
        ],
      },
      {
        id: 'routine-guidance',
        name: 'Orientação sobre rotinas e documentação exigida',
      },
      {
        id: 'daily-compliance',
        name: 'Regularização e manutenção da conformidade diária',
      },
      {
        id: 'platform-alerts',
        name: 'Acompanhamento via plataforma digital e alertas',
      },
      {
        id: 'accounting-specialist-support',
        name: 'Atendimento por especialistas em contabilidade',
      },
    ],
  },
  {
    id: 3,
    name: 'Gestão Tributária e Fiscal',
    description:
      'Cálculo, emissão, planejamento e controle de obrigações tributárias.',
    microServices: [
      {
        id: 'tax-planning',
        name: 'Planejamento tributário para elisão fiscal',
      },
      {
        id: 'tax-assessment',
        name: 'Apuração de impostos federais, estaduais e municipais',
        complianceTags: [
          'IRPJ',
          'CSLL',
          'PIS',
          'COFINS',
          'ICMS',
          'ISS',
          'CBS',
          'IBS',
        ],
        officialSources: [
          {
            label: 'Receita Federal - Reforma Tributária do Consumo',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo',
          },
          {
            label: 'LC 214/2025 - Senado Federal',
            url: 'https://legis.senado.gov.br/norma/40180341',
          },
        ],
        notes: [
          'Para 2026, CBS e IBS entram em ambiente de teste com destaque em documentos fiscais conforme orientações e notas técnicas oficiais.',
        ],
      },
      { id: 'tax-guides', name: 'Emissão e controle de guias tributárias' },
      {
        id: 'fiscal-accessory-obligations',
        name: 'Envio de declarações e obrigações fiscais acessórias',
        complianceTags: [
          'SPED',
          'DCTFWeb',
          'EFD-Reinf',
          'EFD ICMS IPI',
          'EFD Contribuições',
        ],
        officialSources: [
          { label: 'Portal SPED', url: 'https://sped.rfb.gov.br/' },
          {
            label: 'Receita Federal - EFD-Reinf',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/',
          },
        ],
        notes: [
          'A obrigação deve ser validada por regime tributário, atividade, UF/município, período de apuração e eventos efetivamente ocorridos.',
        ],
      },
      {
        id: 'pgdas-d-das',
        name: 'PGDAS-D e emissão do DAS do Simples Nacional',
        complianceTags: ['Simples Nacional', 'PGDAS-D', 'DAS'],
        officialSources: [
          {
            label: 'Portal do Simples Nacional',
            url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
          },
        ],
        notes: [
          'Aplicável a optantes do Simples Nacional, condicionado à receita, anexos, segregação de atividades e regras vigentes do período.',
        ],
      },
      {
        id: 'defis',
        name: 'DEFIS - Declaração de Informações Socioeconômicas e Fiscais',
        complianceTags: ['Simples Nacional', 'DEFIS'],
        officialSources: [
          {
            label: 'Portal do Simples Nacional',
            url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/',
          },
        ],
        notes: [
          'Obrigação anual de empresas optantes pelo Simples Nacional, sujeita ao prazo e às regras publicadas no Portal do Simples Nacional.',
        ],
      },
      {
        id: 'dctfweb',
        name: 'DCTFWeb e emissão de DARF previdenciário/tributário',
        complianceTags: ['DCTFWeb', 'eSocial', 'EFD-Reinf', 'DARF'],
        officialSources: [
          {
            label: 'Receita Federal - EFD-Reinf/DCTFWeb',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/',
          },
        ],
        notes: [
          'A DCTFWeb consolida apurações recebidas de eSocial e/ou EFD-Reinf após encerramento das escriturações.',
        ],
      },
      {
        id: 'efd-reinf',
        name: 'EFD-Reinf - retenções e informações fiscais previdenciárias',
        complianceTags: ['EFD-Reinf', 'SPED', 'Retenções'],
        officialSources: [
          {
            label: 'Receita Federal - EFD-Reinf',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/',
          },
        ],
        notes: [
          'Na ausência de fatos a informar no período, a orientação oficial dispensa eventos sem movimento enquanto persistir essa situação.',
        ],
      },
      {
        id: 'efd-icms-ipi',
        name: 'EFD ICMS/IPI',
        complianceTags: ['SPED', 'ICMS', 'IPI', 'EFD ICMS IPI'],
        officialSources: [
          {
            label: 'Portal SPED - EFD ICMS/IPI',
            url: 'https://sped.rfb.gov.br/',
          },
        ],
        notes: [
          'Obrigação condicionada a UF, perfil do contribuinte, operações com mercadorias/industrialização e guia prático vigente.',
        ],
      },
      {
        id: 'efd-contributions',
        name: 'EFD Contribuições',
        complianceTags: [
          'SPED',
          'PIS',
          'COFINS',
          'Contribuição Previdenciária',
        ],
        officialSources: [
          {
            label: 'Portal SPED - EFD Contribuições',
            url: 'https://sped.rfb.gov.br/',
          },
        ],
        notes: [
          'A escrituração deve observar regime de apuração, incidência de PIS/Cofins e leiaute vigente publicado no SPED.',
        ],
      },
      {
        id: 'rtc-2026-readiness',
        name: 'Adequação à Reforma Tributária do Consumo 2026',
        complianceTags: ['CBS', 'IBS', 'IS', 'LC 214/2025', 'EC 132/2023'],
        officialSources: [
          {
            label: 'Receita Federal - Orientações RTC 2026',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026',
          },
          {
            label: 'LC 214/2025 - Senado Federal',
            url: 'https://legis.senado.gov.br/norma/40180341',
          },
        ],
        notes: [
          'A partir de 2026, documentos fiscais eletrônicos devem destacar CBS e IBS conforme notas técnicas específicas; 2026 é ano de teste conforme orientação oficial.',
        ],
      },
      {
        id: 'withholding-guidance',
        name: 'Orientação sobre retenções tributárias',
      },
      {
        id: 'fiscal-pendency-regularization',
        name: 'Consulta e regularização de pendências fiscais',
        addOnService: true,
        expertsHonorariumWaivable: true,
        retroactiveSensitive: true,
        activeCustomersOnly: true,
      },
      {
        id: 'tax-auto-debit',
        name: 'Debito automatico de impostos via conta PJ integrada',
      },
      {
        id: 'fiscal-registration-update',
        name: 'Atualizacao cadastral perante Receita Federal e Prefeituras',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        activeCustomersOnly: true,
      },
      {
        id: 'cpom-cepom',
        name: 'Cadastro CPOM/CEPOM',
        addOnService: true,
        municipalDependency: true,
        physicalProtocolMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'no-revenue-declaration',
        name: 'Declaracao de Ausencia de Faturamento',
        addOnService: true,
        expertsHonorariumWaivable: true,
        activeCustomersOnly: true,
      },
      {
        id: 'fiscal-certificates',
        name: 'Emissão de certidões e documentos fiscais/cadastrais',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        activeCustomersOnly: true,
      },
    ],
  },
  {
    id: 4,
    name: 'Folha de Pagamento e Obrigações Trabalhistas',
    description: 'Gestão de colaboradores, sócios e encargos sociais.',
    microServices: [
      { id: 'payroll-processing', name: 'Processamento de folha e holerites' },
      { id: 'prolabore-guides', name: 'Cálculo e guias de pró-labore' },
      { id: 'labor-charges', name: 'INSS, FGTS e IRRF' },
      {
        id: 'employee-lifecycle',
        name: 'Admissao, ferias, 13o salario e desligamento',
        addOnService: true,
        activeCustomersOnly: true,
      },
      {
        id: 'labor-obligations',
        name: 'eSocial, DCTFWeb, FGTS Digital e obrigações trabalhistas',
        complianceTags: ['eSocial', 'DCTFWeb', 'FGTS Digital', 'INSS', 'IRRF'],
        officialSources: [
          {
            label: 'Receita Federal - EFD-Reinf/DCTFWeb',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/',
          },
          { label: 'Portal eSocial', url: 'https://www.gov.br/esocial/' },
        ],
        notes: [
          'Eventos trabalhistas e fiscais devem observar tabelas, leiautes e cronogramas oficiais do eSocial/DCTFWeb/FGTS Digital.',
        ],
      },
      {
        id: 'prolabore-profit-guidance',
        name: 'Consultoria sobre pro-labore e distribuicao de lucros',
      },
    ],
  },
  {
    id: 5,
    name: 'Emissão de Notas e Faturamento',
    description: 'Suporte e automacao do ciclo de faturamento e recebimentos.',
    microServices: [
      {
        id: 'nfse-guidance',
        name: 'Orientação técnica para NFS-e',
        municipalDependency: true,
        complianceTags: ['NFS-e', 'ISS', 'CBS', 'IBS'],
        officialSources: [
          {
            label: 'Receita Federal - Documentos Fiscais RTC 2026',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026',
          },
        ],
        notes: [
          'NFS-e depende de regras municipais e, em 2026, deve considerar destaque de CBS/IBS quando aplicável às notas técnicas vigentes.',
        ],
      },
      {
        id: 'invoice-management',
        name: 'Emissão e gerenciamento de notas pela plataforma',
        municipalDependency: true,
        complianceTags: ['NF-e', 'NFC-e', 'NFS-e', 'CT-e', 'CBS', 'IBS'],
        officialSources: [
          {
            label: 'Receita Federal - Orientações RTC 2026',
            url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-2026',
          },
        ],
        notes: [
          'Documentos fiscais eletrônicos devem seguir leiautes e notas técnicas oficiais, incluindo campos de CBS/IBS na transição da reforma.',
        ],
      },
      {
        id: 'revenue-history',
        name: 'Controle mensal do historico de faturamento',
      },
      { id: 'online-collection', name: 'Cobranca online por link/pix' },
      { id: 'installment-sales', name: 'Parcelamento de vendas em ate 12x' },
      {
        id: 'receivable-advance',
        name: 'Recebimento antecipado sujeito a aprovacao financeira',
      },
      {
        id: 'automatic-reconciliation-dre',
        name: 'Conciliação automática entre extrato e DRE',
      },
    ],
  },
  {
    id: 6,
    name: 'Conta Bancária PJ e Serviços Financeiros',
    description: 'Infraestrutura bancária digital integrada à contabilidade.',
    microServices: [
      {
        id: 'free-pj-account',
        name: 'Abertura e manutenção de Conta Digital PJ gratuita',
      },
      {
        id: 'free-pix',
        name: 'Pix ilimitado e isento de tarifas operacionais',
      },
      {
        id: 'automatic-tax-monthly-fee-debit',
        name: 'Débito automático de impostos e mensalidade',
      },
      {
        id: 'automatic-bank-statement-flow',
        name: 'Automação de extratos sem OFX manual',
      },
      { id: 'payment-links', name: 'Gestão de cobranças e links de pagamento' },
    ],
  },
  {
    id: 7,
    name: 'Migração e Troca de Contador',
    description:
      'Transição de responsabilidade técnica para empresas existentes.',
    microServices: [
      {
        id: 'technical-responsibility-transfer',
        name: 'Troca de responsabilidade técnica',
      },
      {
        id: 'prior-accountant-documents',
        name: 'Coleta e análise de documentos do contador anterior',
      },
      {
        id: 'initial-regularity-diagnosis',
        name: 'Diagnóstico inicial de regularidade contábil e fiscal',
      },
      {
        id: 'history-import',
        name: 'Importação de histórico cadastral e financeiro',
      },
      {
        id: 'prior-period-pendency-guidance',
        name: 'Orientação para pendências anteriores',
        retroactiveSensitive: true,
        addOnService: true,
        activeCustomersOnly: true,
      },
    ],
  },
  {
    id: 8,
    name: 'Alteracoes Empresariais e Cadastrais',
    description:
      'Eventos contratuais e cadastrais geralmente tarifados como avulsos.',
    microServices: [
      {
        id: 'company-name-address-change',
        name: 'Alteração de razão social, fantasia ou endereço',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        activeCustomersOnly: true,
      },
      {
        id: 'partner-change',
        name: 'Inclusão, remoção ou substituição de sócios',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'capital-cnae-change',
        name: 'Capital social e CNAEs/atividades',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'legal-nature-change',
        name: 'Mudança de natureza jurídica',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'multi-agency-registration-update',
        name: 'Atualização simultânea Junta, Receita e Prefeituras',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        activeCustomersOnly: true,
      },
      {
        id: 'business-license-update',
        name: 'Regularização e atualização de Alvará',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        physicalProtocolMayApply: true,
        activeCustomersOnly: true,
      },
    ],
  },
  {
    id: 9,
    name: 'Licenças, Alvarás e Regularizações',
    description:
      'Adequação operacional perante órgãos municipais e reguladores.',
    microServices: [
      {
        id: 'business-license-issue-renewal',
        name: 'Emissão e renovação de Alvará',
        addOnService: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        physicalProtocolMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'sanitary-license',
        name: 'Licenciamento sanitario e dispensa municipal',
        addOnService: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        physicalProtocolMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'municipal-provider-registration',
        name: 'Inscricao em cadastros municipais de prestadores',
        addOnService: true,
        municipalDependency: true,
        physicalProtocolMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'municipal-registration-divergence',
        name: 'Saneamento de divergencias cadastrais',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        activeCustomersOnly: true,
      },
    ],
  },
  {
    id: 10,
    name: 'Certificado Digital',
    description: 'Identidade digital para assinaturas e obrigações fiscais.',
    microServices: [
      { id: 'ecnpj-in-plan', name: 'Inclusao de e-CNPJ em planos elegiveis' },
      {
        id: 'certificate-validation-scheduling',
        name: 'Agendamento e validacao presencial ou por video',
      },
      {
        id: 'certificate-technical-support',
        name: 'Suporte tecnico de instalacao e uso',
      },
    ],
  },
  {
    id: 11,
    name: 'Encerramento e Baixa de Empresa',
    description: 'Distrato social e encerramento do CNPJ em órgãos públicos.',
    microServices: [
      {
        id: 'dissolution-document',
        name: 'Elaboração do Distrato Social',
        addOnService: true,
        expertsHonorariumWaivable: true,
        activeCustomersOnly: true,
      },
      {
        id: 'company-closure-agencies',
        name: 'Baixa na Junta, Receita e Prefeitura',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        municipalDependency: true,
        activeCustomersOnly: true,
      },
      {
        id: 'closure-tenure-treatment',
        name: 'Tratamento por tempo de casa',
        addOnService: true,
        activeCustomersOnly: true,
      },
      {
        id: 'recurring-billing-cancellation',
        name: 'Cancelamento da recorrencia apos marco contratual',
      },
    ],
  },
  {
    id: 12,
    name: 'Serviços Societários e Documentais Avulsos',
    description: 'Documentos oficiais sob demanda com assinatura do contador.',
    microServices: [
      {
        id: 'revenue-declaration',
        name: 'Declaracao de Faturamento',
        addOnService: true,
        expertsHonorariumWaivable: true,
        activeCustomersOnly: true,
      },
      {
        id: 'no-revenue-document-declaration',
        name: 'Declaracao de Ausencia de Faturamento',
        addOnService: true,
        expertsHonorariumWaivable: true,
        activeCustomersOnly: true,
      },
      {
        id: 'commercial-board-certificates',
        name: 'Certidões Simplificadas e Inteiro Teor',
        addOnService: true,
        expertsHonorariumWaivable: true,
        governmentFeesMayApply: true,
        activeCustomersOnly: true,
      },
      {
        id: 'registry-pendency-opinion',
        name: 'Parecer sobre pendências cadastrais',
        addOnService: true,
        expertsHonorariumWaivable: true,
        retroactiveSensitive: true,
        activeCustomersOnly: true,
      },
    ],
  },
  {
    id: 13,
    name: 'Registro de Marca e Propriedade Intelectual',
    description: 'Protecao de ativos intangiveis.',
    microServices: [
      {
        id: 'brand-viability-guidance',
        name: 'Orientação inicial sobre registro no INPI',
        addOnService: true,
      },
      {
        id: 'brand-process-guidance',
        name: 'Apoio explicativo sobre processo administrativo',
      },
      {
        id: 'brand-specialized-partner',
        name: 'Encaminhamento para parceiro especializado',
        addOnService: true,
      },
    ],
  },
  {
    id: 14,
    name: 'Atendimento e Assessoria Especializada',
    description: 'Canais e niveis de suporte tecnico conforme plano.',
    microServices: [
      {
        id: 'ticket-email-chat-support',
        name: 'Atendimento via Ticket, E-mail e Chat',
      },
      {
        id: 'whatsapp-phone-support',
        name: 'WhatsApp e Telefone em planos avancados/Experts',
      },
      { id: 'extended-support-hours', name: 'Atendimento estendido ate 22h' },
      { id: 'segment-specialists', name: 'Especialistas setorizados' },
      {
        id: 'dedicated-advisor',
        name: 'Assessor dedicado exclusivo no Experts',
      },
      {
        id: 'experts-addon-honorarium-waiver',
        name: 'Isenção de honorários em serviços avulsos no Experts',
      },
    ],
  },
  {
    id: 15,
    name: 'Beneficios de Saude, Protecao e Bem-estar',
    description: 'Pacote corporativo integrado para socios e colaboradores.',
    microServices: [
      { id: 'life-insurance', name: 'Seguro de Vida e Assistencia Funeral' },
      { id: 'dental-plan', name: 'Plano Odontologico' },
      { id: 'telemedicine', name: 'Telemedicina 24/7' },
      { id: 'psychology-nutrition', name: 'Psicologia e Nutricao online' },
      { id: 'gym-pass', name: 'Passe de Academias' },
      {
        id: 'health-plan-brokerage',
        name: 'Intermediacao de Planos de Saude Empresariais',
      },
    ],
  },
  {
    id: 16,
    name: 'Solucoes Especializadas por Segmento',
    description: 'Personalizacao por CNAE e rotina fiscal do segmento.',
    microServices: [
      { id: 'services-segment', name: 'Prestadores de Serviços' },
      { id: 'health-segment', name: 'Saude' },
      {
        id: 'regulated-professions-segment',
        name: 'Advocacia, Engenharia e Arquitetura',
      },
      {
        id: 'commerce-ecommerce-segment',
        name: 'Comercio e E-commerce',
        municipalDependency: true,
      },
      {
        id: 'individual-professionals-segment',
        name: 'Freelancers, PJs e Autonomos',
      },
    ],
  },
];
