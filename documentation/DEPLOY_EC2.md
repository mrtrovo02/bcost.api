# Deploy EC2 bCost

Procedimento operacional para atualizar o EC2 com segurança.

## Diagnóstico do último deploy

Os logs indicaram:

- Backend subiu corretamente em `0.0.0.0:5000`.
- Frontend subiu corretamente em `localhost:3000`.
- O erro `Failed to find Server Action` no Next.js é compatível com navegador usando bundle antigo após deploy. Force refresh no cliente e build limpo no EC2 resolvem o sintoma.
- O erro real corrigido no código foi `Called end on pool more than once`, causado por encerramento duplicado do pool PostgreSQL em restart/shutdown.
- Os `401` em rotas protegidas indicam chamadas sem token válido, não falha de deploy.

## Caminho recomendado: Git pull no servidor

```bash
ssh -i ./ssh-nestjs-prod.pem ec2-user@18.118.161.27
```

Pré-checagem obrigatória de runtime:

```bash
node -v
npm -v
```

Para venda enterprise ampla, a EC2 deve rodar Node 24 LTS. Se `node -v` retornar `v20.*`, atualize o runtime via NVM antes do deploy:

```bash
nvm install 24
nvm alias default 24
nvm use 24
node -v
npm -v
pm2 update
```

Backend:

```bash
cd ~/bcost.api
git status --short
git fetch --all --prune
git checkout main
git pull origin main
npm ci --engine-strict --include=dev
npx prisma generate
npx prisma migrate deploy
RELEASE_STAGE=beta npm run predeploy:full
pm2 restart bcost-api --update-env
npm run deploy:verify
pm2 logs bcost-api --lines 80
```

### Smoke autenticado obrigatório

Para beta pago, demonstração comercial com cliente real ou lançamento oficial, o
deploy do backend deve validar login real, vínculo de empresa, ausência de vazamento
de empresa demo e logout efetivo.

Configure as variáveis somente no ambiente da EC2, nunca no Git:

```bash
export BCOST_SMOKE_AUTH_EMAIL="usuario-real@bcost.com.br"
install -m 600 /dev/null ~/.bcost-smoke-auth-password
nano ~/.bcost-smoke-auth-password
export BCOST_SMOKE_AUTH_PASSWORD_FILE="$HOME/.bcost-smoke-auth-password"
export BCOST_SMOKE_EXPECTED_COMPANY_NAME="Amel Contabilidade Digital"
export BCOST_SMOKE_FORBIDDEN_COMPANY_NAME="demo"
export BCOST_DEPLOY_REQUIRE_AUTH_SMOKE=true
npm run deploy:verify
```

Se o usuário tiver MFA obrigatório, crie um usuário técnico de smoke com escopo
mínimo, empresa controlada e senha guardada no cofre operacional. O gate deve
falhar se a empresa esperada não aparecer, se empresa demo vazar para a sessão
real ou se o logout não invalidar o token.

Para beta controlado antes do Stripe live, substitua `npm run release:check` por `RELEASE_STAGE=beta npm run release:check`. Esse modo libera somente as chaves live do Stripe; os gates de role `bcost_app`, `DIRECT_URL`, CORS, demo desligada, Swagger desligado, JWT e `METRICS_API_KEY` continuam obrigatórios.

Frontend:

```bash
cd ~/bcost.web/bcost-web
git status --short
git fetch --all --prune
git checkout main
git pull origin main
npm ci --engine-strict --include=dev
export BUILD_VERSION="$(git rev-parse --short HEAD)"
export NEXT_PUBLIC_BUILD_VERSION="$BUILD_VERSION"
pm2 stop bcost-web || true
rm -rf .next
npm run predeploy:full
pm2 restart bcost-web --update-env
npm run deploy:verify
pm2 logs bcost-web --lines 80
```

Se `git status --short` mostrar arquivos alterados no EC2 antes do pull, pare e confira com `git diff`. Nao use `reset --hard` em producao sem saber exatamente o que sera descartado.

## Validação rápida

```bash
pm2 status
curl -f http://127.0.0.1:5000/health
curl -f http://127.0.0.1:5000/ready
curl -I http://127.0.0.1:3000
```

Se houver Nginx ou dominio apontando para a instancia, valide tambem pela URL publica. Apos atualizar o front, faca hard refresh no navegador para descartar bundles antigos.

## Pacote ZIP local

Na raiz local `Projeto- Dev`, execute:

```powershell
.\deploy-ec2.ps1
```

O script gera um `deploy-YYYYMMDDHHMMSS.zip` sem `.git`, `node_modules`, `.next`, `dist`,
logs ou arquivos `.env`.

Depois envie e aplique no EC2:

```bash
scp -i ./ssh-nestjs-prod.pem deploy-YYYYMMDDHHMMSS.zip ec2-user@18.118.161.27:/home/ec2-user/bcost/
ssh -i ./ssh-nestjs-prod.pem ec2-user@18.118.161.27
cd /home/ec2-user/bcost
unzip -o deploy-YYYYMMDDHHMMSS.zip
cd bcost.api && npm ci --engine-strict --include=dev && npx prisma generate && npx prisma migrate deploy && RELEASE_STAGE=beta npm run release:check && npm run test:tax-scenarios && npm run build
cd ../bcost-web
npm ci --engine-strict
pm2 stop bcost-web || true
rm -rf .next
npm run test:tax-scenarios
npm run build
pm2 restart all
```
