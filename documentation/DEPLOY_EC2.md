# Deploy EC2 bCost

Procedimento operacional para atualizar o EC2 com segurança.

## Caminho recomendado: Git pull no servidor

```bash
ssh -i ./ssh-nestjs-prod.pem ec2-user@54.233.128.78
cd /home/ec2-user/bcost
```

Backend:

```bash
cd bcost.api
git pull origin main
npm ci
npx prisma migrate deploy
npm run build
```

Frontend:

```bash
cd ../bcost-web
git pull origin main
npm ci
npm run build
```

Reinicie conforme o gerenciador usado no EC2:

```bash
pm2 restart all
pm2 status
```

ou:

```bash
docker compose up -d --build
docker compose ps
```

## Pacote ZIP local

Na raiz local `Projeto- Dev`, execute:

```powershell
.\deploy-ec2.ps1
```

O script gera um `deploy-YYYYMMDDHHMMSS.zip` sem `.git`, `node_modules`, `.next`, `dist`,
logs ou arquivos `.env`.

Depois envie e aplique no EC2:

```bash
scp -i ./ssh-nestjs-prod.pem deploy-YYYYMMDDHHMMSS.zip ec2-user@54.233.128.78:/home/ec2-user/bcost/
ssh -i ./ssh-nestjs-prod.pem ec2-user@54.233.128.78
cd /home/ec2-user/bcost
unzip -o deploy-YYYYMMDDHHMMSS.zip
cd bcost.api && npm ci && npx prisma migrate deploy && npm run build
cd ../bcost-web && npm ci && npm run build
pm2 restart all
```

## Validação rápida

```bash
curl -f http://localhost:5000/api/v1/health
curl -I http://localhost:3000
```

Se houver Nginx ou domínio apontando para a instância, valide também pela URL pública.
