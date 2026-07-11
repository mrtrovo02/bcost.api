# --- ESTÁGIO 1: Build ---
FROM node:20-alpine AS builder

# Instala dependências nativas (libc6-compat) e openssl (crítico para o Prisma no Alpine)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copia arquivos de pacotes e definição do Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instala dependências com legacy-peer-deps para resolver conflitos NestJS
RUN npm install --legacy-peer-deps

# Com o openssl instalado no SO, o Prisma detecta a arquitetura (musl) automaticamente
RUN npx prisma generate

# Copia o código e realiza o build
COPY . .
RUN npm run build

# --- ESTÁGIO 2: Runner (Produção) ---
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

# O openssl também é necessário no ambiente de execução para a engine conectar ao banco
RUN apk add --no-cache openssl

# Segurança: usuário não-root
RUN addgroup --system --gid 1001 nodejs &&     adduser --system --uid 1001 nestjs

# Copia apenas o estritamente necessário do builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Remove pacotes de desenvolvimento e limpa o cache
RUN npm prune --production --legacy-peer-deps && npm cache clean --force

# Recopia os binários gerados do Prisma para o ambiente final
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Permissões de diretório
RUN chown -R nestjs:nodejs /app
USER nestjs

# Healthcheck robusto (aguarda 40s para o Bootstrap do Fastify completar)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3   CMD node -e "require('http').get('http://localhost:5000/health', (r) => {r.statusCode < 400 ? process.exit(0) : process.exit(1)})" || exit 1

# Inicialização com controle rigoroso de memória
CMD ["sh", "-c", "if [ -f dist/src/main.js ]; then node --max-old-space-size=450 dist/src/main.js; elif [ -f dist/main.js ]; then node --max-old-space-size=450 dist/main.js; else echo 'Erro: main.js não encontrado'; exit 1; fi"]

EXPOSE 5000
