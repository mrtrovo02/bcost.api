# Auditoria Tecnica Arquitetural Tax by Design

## 1. COMPLIANCE BY DESIGN & MOTORES DE CALCULO

### Auditoria de isolamento matematico

- Cada motor fiscal deve expor uma API pura de calculo, sem acesso direto a controller, request HTTP, cache, banco ou estado de sessao.
- Funcoes de Fator R, Simples Nacional, IRPF, Lucro Presumido, CBS/IBS e limites de elegibilidade devem viver em dominios isolados, com contratos de entrada/saida imutaveis e tipados.
- Stored procedures, quando existirem, devem ser auditadas como artefatos versionados: nome, checksum, migration, fixtures de entrada e resultados esperados.
- O calculo oficial e a simulacao comercial devem ser separados por contrato. Simuladores retornam `officialAssessment=false`; apuracoes oficiais exigem documento fiscal, periodo, regime, responsavel tecnico e trilha de auditoria.
- Toda formula deve gerar memoria de calculo: identificador da regra, versao normativa, parametros, base, aliquota, parcela a deduzir, resultado e evidencias usadas.

### Estrategia para alteracao rapida de Nota Tecnica

- Regras fiscais devem ser carregadas por versao efetiva, com `validFrom`, `validUntil`, `legalBasis`, `ruleVersion` e `featureFlag`.
- Mudanca normativa nao deve alterar controllers ou UI diretamente; deve entrar como pacote de regra com testes regressivos e fixtures.
- CI/CD precisa rodar testes matematicos por regime antes do deploy: Fator R, anexos do Simples, CBS/IBS 2026, limites de MEI/EPP, IRPF e Lucro Presumido.
- Deploy deve permitir canary por tenant, municipio, CNAE ou modulo, evitando impacto simultaneo em toda base.
- Rollback deve ser de regra e de codigo. Se uma Nota Tecnica for revertida, a versao anterior da regra deve ser reativavel sem restaurar banco.

## 2. RESILIENCIA DE RPA E INTEGRABILIDADE (HYPERAUTOMATION)

### Auditoria da camada de robos

- Cada robo deve ter contrato explicito de entrada, saida, credencial, portal alvo, layout esperado, SLA, retries e politica de segredo.
- Mudancas de layout devem ser detectadas por smoke tests diarios com seletores monitorados, hash de tela e validacao semantica do documento retornado.
- Robos nao devem gravar resultado final sem validar CNPJ, competencia, numero de protocolo, data de emissao e assinatura/hash do documento quando disponivel.
- Toda execucao deve registrar `tenantId`, `companyId`, `jobId`, portal, tentativa, duracao, status, erro normalizado e evidencias coletadas.
- Credenciais de governo e prefeitura devem ficar fora do codigo e fora de logs, com rotacao e segregacao por tenant/empresa.

### Circuit breakers e filas

- Cada integracao governamental deve ter circuit breaker por portal e por municipio, com estados `CLOSED`, `OPEN`, `HALF_OPEN`.
- Falhas transientes entram em retry exponencial com jitter; falhas de layout, login, captcha ou regra de negocio entram em fila de excecao operacional.
- Dead Letter Queue deve guardar payload minimo, erro normalizado, numero de tentativas, proxima acao e responsavel.
- Quedas de portais nao podem bloquear filas globais. O particionamento deve ser por fornecedor/portal/municipio para preservar throughput dos demais clientes.
- Dashboards internos devem expor backlog por portal, idade media dos jobs, taxa de sucesso, taxa de retry, DLQ e impacto financeiro/tributario por competencia.

## 3. ARQUITETURA DE MICROSSERVICOS E ESCALA DE DADOS

- Motores fiscais devem ser separados de modulos de atendimento, billing, dashboards e emissores. A regra tributaria nao pode depender da tela executiva.
- Eventos fiscais devem ser append-only para trilha: documento importado, calculo executado, regra aplicada, revisao CRC, guia gerada, protocolo entregue.
- CQRS deve separar escrita operacional de leitura executiva. Telas em tempo real consultam read models otimizados, nao tabelas transacionais pesadas.
- Event Sourcing deve ser usado onde historico e reprocessamento importam: XML, NFS-e, apuracao, conciliacao, retificacao e mudanca de regime.
- Idempotencia e obrigatoria em importacao de XML, webhooks, billing, RPA e geracao de guias. Chaves recomendadas: `tenantId + companyId + source + documentKey + competence`.
- Multi-tenancy deve ser aplicado em todas as queries e filas. Nenhum worker pode processar job sem `tenantId` e `companyId` validados.
- Read models devem ter TTL e invalidacao por evento. Cache de dado fiscal nao pode sobreviver a retificacao, troca de regime, novo XML ou fechamento de periodo.

## 4. MATRIZ DE TESTES E MODELO EM V (QA TRIBUTARIO)

### Estrategia regressiva

- Unidade: testar cada formula pura com cenarios limite, arredondamento, aliquota, parcela a deduzir e inelegibilidade.
- Contrato: validar DTOs, tipos de response, campos obrigatorios e compatibilidade com clients antigos.
- Integracao: simular fluxo completo por tenant: importacao, classificacao, calculo, revisao, proposta, bloqueio comercial e auditoria.
- End-to-end: validar rotas criticas em ambiente staging com dados anonimizados e portais mockados.
- Regressao legal: toda mudanca normativa deve trazer fixture antes/depois e laudo tecnico de impacto.

### Ecossistema de mocks fiscais

- Criar biblioteca de fixtures por CFOP, NCM, NBS, CST, CClassTrib, CNAE, municipio, regime, competencia e tipo de documento.
- Cada fixture deve ter entrada bruta, entrada normalizada, resultado esperado, base legal, regra aplicada e margem de arredondamento permitida.
- Gerar combinacoes por property-based testing para limites: RBT12 perto de faixas do Simples, Fator R perto de 28%, MEI perto de R$ 81.000, EPP perto de R$ 4.800.000.
- Mocks de RPA devem simular indisponibilidade, timeout, captcha, layout alterado, documento inexistente, credencial expirada e protocolo divergente.
- Pipeline de deploy deve bloquear merge quando qualquer fixture fiscal critica divergir sem aprovacoes tecnica, fiscal e produto.

## 5. CHECKLIST DE VULNERABILIDADES DE NEGOCIO (SQUAD LOGBOOK)

1. A squad consegue provar, por teste automatizado, que a regra alterada nao muda calculos de outros regimes, competencias ou municipios?
2. O endpoint novo respeita `tenantId`, `companyId`, roles, entitlements, idempotencia e audit log em todos os caminhos de sucesso e erro?
3. Existe separacao clara entre simulacao comercial, proposta assistida e apuracao oficial assinavel por responsavel tecnico?
4. O modulo possui DLQ, retry, timeout, circuit breaker e erro normalizado para integracoes externas ou processamento assincrono?
5. A tela executiva mostra origem, validade, versao da regra, bloqueios e evidencias pendentes antes de permitir decisao comercial ou operacional?
