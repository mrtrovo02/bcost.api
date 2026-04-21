'use strict';

// =============================================================================
// ARQUIVO: prisma.config.ts (raiz do projeto)
// =============================================================================

import 'dotenv/config';
import { defineConfig } from '@prisma/config';

/**
 * Prisma Config — bCost Engine 2026
 *
 * SUPABASE + MIGRATIONS:
 * O Supabase gerencia internamente extensões como hypopg, index_advisor,
 * pg_graphql e supabase_vault. O Prisma detecta essas extensões como "drift"
 * (diferença entre o schema esperado e o banco real) e bloqueia migrations.
 *
 * SOLUÇÃO: usar DIRECT_URL (porta 5432, conexão direta sem PgBouncer) para
 * que o Prisma consiga executar DDL (CREATE TABLE, ALTER, etc.).
 * O PgBouncer na porta 6543 usa transaction mode e não suporta DDL.
 *
 * .env necessário:
 *   DATABASE_URL  → porta 6543 (PgBouncer, runtime da aplicação)
 *   DIRECT_URL    → porta 5432 (conexão direta, migrations)
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    '❌ [prisma.config] DATABASE_URL ou DIRECT_URL não encontrado no .env.\n' +
    'Verifique se o arquivo .env está na raiz do projeto.',
  );
}

export default defineConfig({
  datasource: {
    // Usa DIRECT_URL para migrations — conexão direta ao PostgreSQL
    // sem passar pelo PgBouncer, que bloqueia comandos DDL
    url: migrationUrl,
  },

  migrations: {
    // Comando executado pelo `prisma migrate dev --seed` ou `prisma db seed`
    seed: 'npx tsx prisma/seed.ts',
  },
});