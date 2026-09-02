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

Backend:

```bash
cd ~/bcost.api
git status --short
git fetch --all --prune
git checkout main
git pull origin main
npm ci
npx prisma generate
npx prisma migrate deploy
npm run test:tax-scenarios
npm run build
pm2 restart bcost-api --update-env
pm2 logs bcost-api --lines 80
```

Frontend:

```bash
cd ~/bcost.web/bcost-web
git status --short
git fetch --all --prune
git checkout main
git pull origin main
npm ci
rm -rf .next
npm run test:tax-scenarios
npm run build
pm2 restart bcost-web --update-env
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
cd bcost.api && npm ci && npx prisma migrate deploy && npm run test:tax-scenarios && npm run build
cd ../bcost-web && npm ci && rm -rf .next && npm run test:tax-scenarios && npm run build
pm2 restart all
```
