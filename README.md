# bCost API

API fiscal/financeira com NestJS, Prisma e PostgreSQL. Suporta automação de DFe, conciliação bancária, faturamento, compliance e notificações em tempo real.

**Stack**
- Node.js + NestJS (Fastify)
- Prisma + PostgreSQL
- Redis (BullMQ)
- WebSocket (Socket.io)

**Setup**
1. Copie e ajuste variáveis de ambiente:

```bash
cp .env.example .env
```

2. Instale dependências:

```bash
npm install
```

3. Para desenvolvimento local com Postgres/pgvector e Redis:

```bash
copy .env.local.example .env
npm run infra:local
```

4. Execute migrations/seed (se aplicável):

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

5. Suba o servidor:

```bash
npm run start:dev
```

**Scripts úteis**
- `npm run start:dev`
- `npm run build`
- `npm run test`
- `npm run infra:local`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:seed`

**Endpoints**
- `GET /health`
- `GET /docs` (se `ENABLE_SWAGGER=true`)

**Notas de segurança**
- `ALLOW_SETUP_ADMIN` deve ficar `false` em produção.
- Configure `CORS_ORIGINS` com as origens oficiais do frontend.
