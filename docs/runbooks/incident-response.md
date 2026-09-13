# bCost API Incident Response Runbook

Runbook operacional para incidentes da API em producao. Use este fluxo para falhas de login, tenant isolation, billing, fiscal engines, jobs, banco de dados, Stripe, RLS, CORS, throttling e deploy.

## Severidade

| Nivel | Criterio | Exemplo |
| --- | --- | --- |
| SEV-1 | Indisponibilidade ou risco de vazamento entre tenants | API fora, RLS falhando, sessao real carregando empresa errada |
| SEV-2 | Fluxo comercial ou fiscal bloqueado sem vazamento | Billing indisponivel, simulador fiscal com erro, upload XML parado |
| SEV-3 | Degradacao localizada com alternativa operacional | Relatorio lento, pagina parcial, exportacao indisponivel |

## Primeiros 10 minutos

1. Confirmar saude publica:

```bash
curl -i https://api.bcost.com.br/api/v1/health
```

2. Confirmar processo:

```bash
pm2 status
pm2 logs bcost-api --lines 120
```

3. Coletar `x-bcost-trace-id` do erro reportado e correlacionar nos logs.
4. Classificar a severidade.
5. Se houver risco de tenant isolation, interromper a rota afetada por feature flag, regra de gateway ou rollback.

## Diagnostico padrao

```bash
cd ~/bcost.api
git status --short
git log --oneline -5
npm run release:check
npm run smoke:production
```

Para falhas de banco:

```bash
node -e "require('dotenv').config(); for (const k of ['DATABASE_URL','DIRECT_URL']) { const raw=process.env[k] || ''; const u=new URL(raw); console.log(k, { user:u.username, host:u.hostname, port:u.port, db:u.pathname, params:u.search }) }"
npx prisma validate
```

Nunca imprima senhas, tokens, chaves Stripe, URLs completas de banco ou dados fiscais de clientes.

## Rollback

Use rollback quando o erro surgiu logo apos deploy e afeta login, sessao, pagamentos, dados fiscais, RLS, CORS ou calculos.

```bash
cd ~/bcost.api
git log --oneline -5
git checkout <commit_anterior_estavel>
npm ci
npx prisma generate
npm run release:check
npm run build
pm2 restart bcost-api --update-env
npm run smoke:production
```

Se o rollback envolver migration aplicada, nao reverta schema manualmente sem plano de dados. Abra incidente SEV-1/SEV-2 e prepare migration corretiva.

## Criterios de encerramento

- `health` retorna 200.
- `release:check` passa.
- `smoke:production` passa.
- Logs nao mostram erro recorrente em auth, tenant, RLS, billing ou fiscal engines.
- Incidente possui causa raiz, commit corretivo e impacto registrado.

