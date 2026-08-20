# --- ESTÁGIO 1: Builder ---
FROM node:20-alpine AS builder

# Instala dependências nativas necessárias para compilação e suporte ao Prisma Engine no Alpine (musl)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copia manifestos de dependências e esquema do Prisma para cache eficiente de camadas
COPY package*.json ./
COPY prisma ./prisma/

# Instala todas as dependências de build
RUN npm ci --legacy-peer-deps

# Gera os artefatos e engines do Prisma Client
RUN npx prisma generate

# Copia o código-fonte e compila a aplicação NestJS
COPY . .
RUN npm run build

# Remove dependências de desenvolvimento para manter apenas o necessário em node_modules
RUN npm prune --production --legacy-peer-deps && npm cache clean --force


# --- ESTÁGIO 2: Runner (Produção) ---
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=5000

WORKDIR /app

# Biblioteca OpenSSL exigida pela Query Engine do Prisma no Alpine em tempo de execução
RUN apk add --no-cache openssl

# Princípio do menor privilégio: cria usuário e grupo não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copia apenas os artefatos compilados e dependências tratadas do estágio builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Atribui a propriedade dos arquivos ao usuário não-root
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 5000

# Healthcheck nativo sem dependência de curl/wget, direcionado para a rota /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => { r.statusCode < 400 ? process.exit(0) : process.exit(1); }).on('error', () => process.exit(1))"

# Inicialização resiliente via exec (propagação direta de sinais de SO ao V8)
CMD ["sh", "-c", "if [ -f dist/src/main.js ]; then exec node --max-old-space-size=450 dist/src/main.js; elif [ -f dist/main.js ]; then exec node --max-old-space-size=450 dist/main.js; else echo 'Erro: main.js não encontrado em dist/'; exit 1; fi"]