# Backend release gates

## Gates bloqueantes

- `npm run predeploy:check`
- `npm run predeploy:full` quando o ambiente local/EC2 tiver memoria suficiente para build
- `npm run predeploy:code` para validar codigo fora do ambiente produtivo sem exigir segredos reais
- `npm run security:scan`
- `npm run prisma:generate`
- `npm run prisma:validate`
- `npm run release:check`
- `npm test -- --runInBand src/release/validate-production-env.spec.ts`
- `npm run test:security`
- `npm test -- --runInBand src/database/prisma.rls.spec.ts`
- CI: `PostgreSQL RLS Integration` com migrations, seed mínimo e `npm run test:rls`
- `npm run test:tax-scenarios`
- `npm run test:observability`
- `npm run typecheck`
- `npm run build`

`predeploy:check` e `predeploy:full` sao os comandos preferenciais para EC2 e ambientes com variaveis produtivas. `predeploy:code` e o comando preferencial para validação local/CI sem segredos reais. A lista detalhada acima permanece como contrato auditorio do que esses comandos cobrem.

## Gates informativos

- `npm audit --audit-level=high`

O audit do backend permanece informativo até a sprint de migração coordenada de Nest/Fastify/Swagger descrita em `docs/security/npm-audit-baseline.md`.

## Smoke de produção

Após deploy na EC2:

```bash
curl -i http://127.0.0.1:5000/api/v1/health
curl -i http://127.0.0.1:5000/api/v1/ready
pm2 logs bcost-api --lines 80
```

Também validar login real, troca de empresa, métricas protegidas por `METRICS_API_KEY` e ausência de dados demo em sessão real.
