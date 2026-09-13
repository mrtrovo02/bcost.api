'use strict';

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import {
  PrismaClient,
  TaxRegime,
  CompanyRole,
  Prisma,
  NotificationSeverity,
  ComplianceStatus, // FIX: importado enum correto
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 [Seed] Iniciando população técnica do bCost v2.0...');

  try {
    await prisma.$connect();

    // ------------------------------------------------------------------
    // 1. USUÁRIO OWNER
    // ------------------------------------------------------------------
    const owner = await prisma.user.upsert({
      where: { email: 'contato@bcost.com.br' },
      update: {},
      create: {
        email: 'contato@bcost.com.br',
        name: 'Vinícius Rafael',
        password: 'hash_seguro_seed_2026',
        active: true,
      },
    });

    // ------------------------------------------------------------------
    // 2. EMPRESA MODELO
    // ------------------------------------------------------------------
    const company = await prisma.company.upsert({
      where: { cnpj: '12345678000199' },
      update: { taxRegime: TaxRegime.SIMPLES_NACIONAL },
      create: {
        cnpj: '12345678000199',
        name: 'B-Cost Solutions LTDA',
        taxRegime: TaxRegime.SIMPLES_NACIONAL,
        anexo: 3,
        cnae: '6201-5/00',
        active: true,
      },
    });

    // ------------------------------------------------------------------
    // 3. VÍNCULO
    // ------------------------------------------------------------------
    await prisma.companyUser.upsert({
      where: { userId_companyId: { userId: owner.id, companyId: company.id } },
      update: {},
      create: {
        userId: owner.id,
        companyId: company.id,
        role: CompanyRole.OWNER,
      },
    });

    // ------------------------------------------------------------------
    // 4. HISTÓRICO FINANCEIRO (12 meses)
    // ------------------------------------------------------------------
    console.log('📊 Gerando massa de Analytics (12 meses)...');

    for (let i = 0; i < 12; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const m = date.getMonth() + 1;
      const y = date.getFullYear();
      const revenue = 22_000 + Math.random() * 3_000;

      await prisma.financialSnapshot.create({
        data: {
          companyId: company.id,
          month: m,
          year: y,
          revenue: new Prisma.Decimal(revenue),
          expenses: new Prisma.Decimal(revenue * 0.45),
          taxPayable: new Prisma.Decimal(revenue * 0.06),
          netProfit: new Prisma.Decimal(revenue * 0.49),
          integrityHash: `v2_hash_${y}_${m}_${company.id}`,
          fatorRData: { value: 0.28, eligible: true },
        },
      });
    }

    // ------------------------------------------------------------------
    // 5. COMPLIANCE CHECKS
    // FIX: 'PASS' → ComplianceStatus.RESOLVED
    //      'FAIL' → ComplianceStatus.OPEN
    // ------------------------------------------------------------------
    console.log('⚖️ Gerando diagnósticos de Compliance...');

    await prisma.complianceCheck.createMany({
      data: [
        {
          companyId: company.id,
          checkName: 'Certificado Digital',
          status: ComplianceStatus.RESOLVED, // FIX: era 'PASS'
          severity: NotificationSeverity.INFO,
          description: 'Certificado A1 operando normalmente.',
          resolved: true,
          resolvedAt: new Date(),
        },
        {
          companyId: company.id,
          checkName: 'Fator R',
          status: ComplianceStatus.OPEN, // FIX: era 'FAIL'
          severity: NotificationSeverity.WARNING,
          description:
            'Atenção: Pro-labore abaixo de 28%. Risco de reenquadramento no Anexo V.',
          resolved: false,
        },
        {
          companyId: company.id,
          checkName: 'Divergência Fiscal',
          status: ComplianceStatus.OPEN, // FIX: era 'FAIL'
          severity: NotificationSeverity.CRITICAL,
          description:
            'Notas de entrada detectadas no SEFAZ mas não importadas.',
          resolved: false,
        },
      ],
    });

    console.log('✅ [Seed] Sucesso total!');
  } catch (error) {
    console.error('❌ [Seed Error]:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
