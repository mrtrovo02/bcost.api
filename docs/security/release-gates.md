# Backend release gates

## Gates bloqueantes

- `npm run predeploy:check`
- `npm run predeploy:full` quando o ambiente local/EC2 tiver memoria suficiente para build
- `npm run predeploy:code` para validar codigo fora do ambiente produtivo sem exigir segredos reais
- `npm run security:scan`
- `npm run prisma:generate`
- `npm run prisma:validate`
- `npm run release:check`
- `npm run test:release-gates`
- `npm run test:security`
- `npm test -- --runInBand src/database/prisma.rls.spec.ts`
- CI: `PostgreSQL RLS Integration` com migrations, seed mínimo e `npm run test:rls`
- `npm run test:tax-scenarios`
- `npm run test:observability`
- `npm run typecheck`
- `npm run build`
- `npm run deploy:verify`

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
O smoke público reprova se a API deixar de expor `x-bcost-trace-id` no health
externo, pois esse header é obrigatório para correlação de incidentes.
Também valida preflight CORS do app oficial, exigindo origem
`https://app.bcost.com.br` e bloqueando retorno do header legado
`x-demo-session`.

Para beta pago ou demonstração com empresa real, torne o smoke autenticado obrigatório:

```bash
BCOST_SMOKE_AUTH_PASSWORD_FILE="$HOME/.bcost-smoke-auth-password"
read -rsp "Senha do usuario de smoke: " BCOST_SMOKE_SECRET
printf '%s' "$BCOST_SMOKE_SECRET" > "$BCOST_SMOKE_AUTH_PASSWORD_FILE"
unset BCOST_SMOKE_SECRET
chmod 600 "$BCOST_SMOKE_AUTH_PASSWORD_FILE"

cat >> .env <<'EOF'
BCOST_SMOKE_AUTH_EMAIL="usuario-real@bcost.com.br"
BCOST_SMOKE_AUTH_PASSWORD_FILE="$HOME/.bcost-smoke-auth-password"
BCOST_SMOKE_EXPECTED_COMPANY_NAME="Amel"
BCOST_SMOKE_FORBIDDEN_COMPANY_NAME="demo"
BCOST_DEPLOY_REQUIRE_AUTH_SMOKE=true
EOF

npm run deploy:verify
```

O arquivo indicado em `BCOST_SMOKE_AUTH_PASSWORD_FILE` deve existir somente na EC2,
com permissão `600` ou mais restritiva, e nunca deve ser versionado. O smoke
autenticado reprova arquivos legiveis ou gravaveis por grupo/outros em Linux.
Arquivo vazio tambem reprova o gate para evitar falso positivo operacional.
Os scripts de smoke carregam `.env` explicitamente via `dotenv`, então as variáveis
podem ficar no arquivo local da instância sem serem exportadas a cada deploy.
