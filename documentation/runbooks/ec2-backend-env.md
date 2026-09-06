# Runbook EC2 - Backend Environment

Use este checklist antes de reiniciar o `bcost-api` em produção.

## Variáveis críticas

```bash
NODE_ENV=production
PORT=5000
FRONTEND_BASE_URL=https://app.bcost.com.br
PUBLIC_APP_URL=https://app.bcost.com.br
CORS_ORIGINS=https://bcost.com.br,https://www.bcost.com.br,https://app.bcost.com.br
ENABLE_SWAGGER=false
ENABLE_DEMO_FALLBACK=false
ALLOW_DEMO_SESSION=false
ALLOW_SETUP_ADMIN=false
```

## Regras de segurança

- `JWT_SECRET` deve ter no mínimo 32 caracteres e não deve ser reutilizado em desenvolvimento.
- `DATABASE_URL` deve apontar para a conexão transacional da aplicação.
- `DIRECT_URL` deve apontar para a conexão usada por Prisma/migrations.
- Em produção, origens CORS com `http://` são descartadas pelo bootstrap.
- Sessão demo em produção exige token demo e `x-demo-session=true`; não use em ambiente com clientes reais sem segregação validada.

## Deploy

```bash
cd ~/bcost.api
git pull origin main
npm ci
npx prisma generate
npm run release:check
npm run build
pm2 restart bcost-api --update-env
pm2 logs bcost-api --lines 80
```

## Smoke test

```bash
curl -i http://127.0.0.1:5000/api/v1/health
pm2 status
```
