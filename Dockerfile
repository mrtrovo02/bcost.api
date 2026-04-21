# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependência e schema Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instalar todas as dependências (incluindo dev) e gerar cliente Prisma
RUN npm ci
RUN npx prisma generate

# Copiar o restante do código e compilar
COPY . .
RUN npm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS production

WORKDIR /app

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar apenas as dependências de produção
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar build e cliente Prisma do stage builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# (Opcional) Instalar wget para healthcheck, se necessário
RUN apk add --no-cache wget

# Mudar para usuário não-root
USER nodejs

# Expor a porta usada pela aplicação (definida via .env ou 5000)
EXPOSE 5000

# Comando de inicialização (usando node diretamente para produção)
CMD ["node", "dist/src/main.js"]