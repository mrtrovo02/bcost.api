# bCost API — Diretrizes Mestras para Agentes Codex

## Missao do Produto

Transformar a bCost em uma plataforma SaaS contabil, fiscal e financeira vendavel e monetizavel, competindo com Contabilizei, Dominio, Contimatic e Conta Azul com postura juridicamente defensavel. A bCost vende eficiencia, inteligencia fiscal e operacao assistida; nunca promete apuracao oficial automatica quando o processo depende de portal publico, prefeitura, PGDAS-D, eSocial, SPED, certificado digital, Junta Comercial ou contador responsavel.

A meta do backend e operar como produto vendavel: multi-tenant, auditavel, com modulos reais, contratos de API claros, fallback controlado e trilhas de evidencia.

## Classificacao Obrigatoria de Modulos

Antes de alterar modulo fiscal, contabil, financeiro, comercial ou operacional, classifique o comportamento:

- Operacional por software: API, banco, regra, teste, auditoria e contrato completos.
- Operacao assistida: depende de contador/CRC, certificado, portal publico, RPA, prefeitura, Receita ou validacao documental. Deve gerar workflow, checklist, evidencia, SLA e revisao humana.
- Bloqueado para venda: sem evidencia tecnica, legal ou operacional suficiente. Deve ficar desabilitado, somente leitura ou marcado como homologacao no contrato retornado ao frontend.

Nada pode prometer automacao oficial sem lastro. Onde nao ha automacao oficial, o sistema deve abrir workflow assistido.

## Arquitetura Backend

- NestJS, TypeScript strict, SWC, Prisma e PostgreSQL.
- Nunca relaxar `strict`, `noImplicitAny` ou `strictNullChecks`.
- Prisma/PostgreSQL com RLS forcado em tabelas tenant-scoped; producao deve usar usuario restrito, sem bypass.
- Guards em camadas: `AuthGuard`, `TenantGuard`, `CompanyAccessGuard`, `RolesGuard`. Respeitar `@SkipCompanyCheck` apenas onde fizer sentido arquitetural.
- JWT de acesso curto e evolucao para refresh token em cookie HttpOnly/SameSite=Strict com rotacao e revogacao.
- Modulos autocontidos: controller, service, repository/prisma, DTOs, testes.
- Validar toda entrada de API com DTO/class-validator ou schema equivalente ja adotado no modulo.
- Endpoints criticos de escrita devem considerar idempotencia: billing, webhooks, fechamento fiscal, obrigacoes, pagamentos e workflows.
- Metricas protegidas por `METRICS_API_KEY`; Swagger em producao deve ficar desligado; logs precisam preservar correlation/trace id.

## Prioridades Da Esteira

P0 — Bloqueadores de vendabilidade:
- Sessao enterprise robusta: refresh token, rotacao/revogacao, logout global, MFA/TOTP.
- Eliminar dependencia de token real em `localStorage`; sessao produtiva deve convergir para cookie HttpOnly/Secure/SameSite=Strict e storage do navegador deve guardar apenas contexto nao sensivel.
- Observabilidade antes de Stripe: metricas HTTP 5xx/latencia, trace id ponta a ponta, health/readiness, alertas 5xx e metricas protegidas. Avaliar Sentry/OpenTelemetry somente depois de verificar dependencias e variaveis.
- Limpeza de repositorio: remover backups/dumps soltos, proteger `.env`, certificados e artefatos.
- Testes e2e de isolamento tenant: provar que empresa A nao le nem escreve dados da empresa B via API e RLS.
- Smoke autenticado em producao deve ser obrigatorio antes de venda beta paga: validar usuario real, empresa esperada e ausencia de vazamento demo.

P1 — Fechamento mensal:
- Checklist de fechamento por competencia, periodo travavel, memoria de calculo imutavel, snapshot com hash, aprovacao CRC e dossie de evidencias exportavel.
- Evoluir DAS, Fator R, obrigacoes, snapshots, protocolos auditaveis e recibos oficiais quando disponiveis.

P2 — Entregas fiscais reais:
- Priorizar geradores reais e defensaveis de PGDAS-D e SPED Contribuicoes, com aviso de limitacao e versao de regra.
- Separar explicitamente simulacao e apuracao oficial. Calculo tributario sem base legal, versao de regra, evidencias e revisao CRC nao deve ser tratado como entrega oficial.

P3 — Monetizacao:
- Suportar checkout, portal, webhooks Stripe, assinaturas, entitlements, paywall, trial e bloqueio real de usuarios inadimplentes.
- Nao alterar Stripe enquanto P0/P1 de seguranca, observabilidade, tenant e fechamento nao estiverem estabilizados. Stripe Live fica por ultimo.

P4 — Escalabilidade:
- Paginar listagens, eliminar N+1, usar cache em catalogos estaveis e evitar duplicidade entre modulos basicos e enterprise.

P5 — Pre-producao comercial rapida:
- Antes de novos modulos comerciais, priorizar deploy repetivel, smoke test pos-deploy, rollback documentado, CI completo com cobertura medida e higiene operacional.
- Concluir migracao para sessao baseada em cookie HttpOnly/Secure/SameSite=Strict; token real nao deve depender de `localStorage`.
- Endurecer CSP gradualmente e manter Swagger, demo publica e metricas protegidas/desabilitadas conforme ambiente produtivo.
- Definir estrategia de LICENSE/visibilidade dos repositorios antes de venda publica ampla.
- Documentar runbooks de incidente, LGPD basica, SLO beta, backup/restore e contatos de escalacao.
- Trilha enterprise pos-beta: IaC, pinagem SHA de GitHub Actions, assinatura/attestation de imagem, cliente OpenAPI gerado e refatoracao gradual de services grandes.

## Gates De Lancamento

Beta pago/controlado exige:

- `predeploy:full` e `deploy:verify` aprovados no backend publicado.
- Smoke publico e smoke autenticado contra EC2, com empresa real esperada e demo leak bloqueado.
- RLS real validado em PostgreSQL com role de aplicacao sem `BYPASSRLS`.
- Stripe/billing em modo coerente com o stage: beta pode operar com restricao explicita; venda oficial exige chaves live, webhooks idempotentes e entitlements server-side.
- Runbook minimo de incidente, backup/restore e rollback PM2 documentado.

Venda enterprise ampla exige adicionalmente:

- CI/CD com rollback automatizado ou procedimento reversivel testado.
- Cobertura medida com threshold inicial e suite completa em agenda noturna.
- CSP endurecida, sem `unsafe-eval` e com plano de nonce/hash para reduzir `unsafe-inline`.
- Actions pinadas por SHA, SBOM versionado e estrategia de assinatura/attestation quando houver imagem/container.
- Plano formal de LGPD, DR, ownership por modulo e reducao de bus factor.

## Regras De Engenharia

- Mudancas incrementais, pequenas e separadas por repo.
- Nunca enfraquecer seguranca para "fazer funcionar": RLS, guards, CORS restrito e throttling permanecem.
- Nunca misturar demo com producao. Dados demo somente em sessao/ambiente explicitamente demo.
- Alteracao em auth, guards, cookies, RLS, billing ou fechamento exige teste de regressao focado antes de commit.
- SDD obrigatorio: conferir `prisma/schema.prisma`, DTOs e contratos antes de ler/gravar qualquer campo novo.
- TDD obrigatorio em imposto, simulador, nota fiscal, pagamento, assinatura, webhook, banking, folha e fechamento mensal.
- Reuso antes de criacao: procurar guard, service, controller, repository, decorator ou client existente antes de criar outro.
- Toda resposta de API deve ser tipada; mudanca de contrato exige atualizar client frontend na mesma rodada quando aplicavel.
- Toda tabela nova tenant-scoped no schema exige GRANT, ENABLE ROW LEVEL SECURITY e policies na mesma migration.
- Commits convencionais e com um contexto por commit.
- Nao fazer commit ou push sem solicitacao explicita do usuario na conversa atual.

## Definition Of Done

- `npm run typecheck`
- `npm run lint` quando viavel no repo
- Teste unitario/direcionado do modulo tocado
- `npm run build`
- `npm run release:check` quando a alteracao impactar producao/env
- Teste de fluxo critico quando tocar auth, tenant, billing ou fechamento
- Commit e push separado por repo
- Nota de deploy EC2 com comandos exatos

## Deploy EC2 Backend

```bash
cd ~/bcost.api
git pull origin main
npm ci --include=dev
npx prisma migrate deploy
npx prisma generate
RELEASE_STAGE=beta npm run predeploy:full
pm2 restart bcost-api --update-env
npm run deploy:verify
pm2 logs bcost-api --lines 80
```

Variaveis produtivas obrigatorias incluem `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `METRICS_API_KEY`, `FRONTEND_BASE_URL`, `PUBLIC_APP_URL`, chaves Stripe e `CORS_ORIGINS`.
