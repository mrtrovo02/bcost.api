# Diagnóstico de Estrutura — Macroserviços e Microserviços

## Data: 2026-08-16

## 1. BACKEND (bcost.api) — NestJS + Prisma + PostgreSQL + Redis/BullMQ

### Arquitetura
- **Modular**: 30+ módulos NestJS registrados no `app.module.ts`
- **Infra**: PrismaModule, AuthModule (JWT), HealthModule, CacheModule, ThrottlerModule, BullModule (filas), EventEmitterModule, ScheduleModule (cron)
- **Segurança**: JwtAuthGuard, TenantContextGuard, CompanyAccessGuard, TenantMiddleware, ZodValidationPipe + ValidationPipe
- **Schema Prisma**: 25+ modelos

### Service Catalog (service-catalog.data.ts) — 16 Macroserviços
1. Abertura e Estruturacao de Empresas
2. Contabilidade Recorrente
3. Gestao Tributaria e Fiscal
4. Folha de Pagamento e Obrigacoes Trabalhistas
5. Emissao de Notas e Faturamento
6. Conta Bancaria PJ e Servicos Financeiros
7. Migracao e Troca de Contador
8. Alteracoes Empresariais e Cadastrais
9. Licencas, Alvaras e Regularizacoes
10. Certificado Digital
11. Encerramento e Baixa de Empresa
12. Servicos Societarios e Documentais Avulsos
13. Registro de Marca e Propriedade Intelectual
14. Atendimento e Assessoria Especializada
15. Beneficios de Saude, Protecao e Bem-estar
16. Solucoes Especializadas por Segmento

### Billing/Entitlements
- **Planos**: FREE, PRO, ENTERPRISE
- **Features**: 15 features mapeadas

## 2. FRONTEND (bcost-web) — Next.js App Router + Clean Architecture

### Arquitetura
- **Clean Architecture**: domain → application/use-cases → infrastructure/repositories
- **API Client**: services/api.ts com Axios
- **Lib/API**: Clientes para todos os módulos backend

### Dashboard Pages
- banking, companies, compliance, enterprise, intelligence, invoices, operations, payroll, reconciliation, reports, revenue, settings, xml
- modules/ com 20+ subpáginas

### Use Cases
- generate-dre, generate-balanco, generate-balancete, generate-razao
- calculate-folha, fetch-tax-data, sync-bank-accounts

## 3. GAPS IDENTIFICADOS E CORRIGIDOS

1. ✅ **Contabilidade para o Exterior (Invoice internacional)** — Adicionado ao catálogo
2. ✅ **Inconsistência de nomenclatura de planos** — billing-entitlements alinhado com service-catalog
3. ✅ **Modelos de execução** — Adicionados modelos Prisma: ServiceOrder, Partner, CompanyOpening, ContractAlteration, VirtualOffice, BenefitsEnrollment
4. ✅ **Página de Serviços Avulsos** — Adicionada ao frontend