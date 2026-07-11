'use strict';

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import {
  PrismaClient,
  TaxRegime,
  CompanyRole,
  Prisma,
  InvoiceStatus,
  InvoiceType,
  ObligationStatus,
  ComplianceStatus,
  TransactionType, // ✅ usado corretamente agora
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import { subDays, addDays } from 'date-fns';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🚀 [Seed] Iniciando população técnica bCost v2.2...');

  try {
    await prisma.$connect();

    const saltRounds = 10;
    const securePassword = await bcrypt.hash('admin_bcost_2026', saltRounds);

    // ------------------------------------------------------------------
    // 1. USUÁRIO OWNER
    // ------------------------------------------------------------------
    const owner = await prisma.user.upsert({
      where: { email: 'contato@bcost.com.br' },
      update: { password: securePassword },
      create: {
        email: 'contato@bcost.com.br',
        name: 'Vinícius Rafael',
        password: securePassword,
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
    // 3. VÍNCULO DE ACESSO
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
    // 4. CLIENTE MODELO
    // ------------------------------------------------------------------
    console.log('👤 Criando cliente para faturamento...');
    const customer = await prisma.customer.upsert({
      where: {
        companyId_document: {
          companyId: company.id,
          document: '99999999000188',
        },
      },
      update: {},
      create: {
        document: '99999999000188',
        name: 'Cliente Global Tech',
        email: 'financeiro@globaltech.com',
        companyId: company.id,
      },
    });

    // ------------------------------------------------------------------
    // 5. CONTA BANCÁRIA
    // ------------------------------------------------------------------
    console.log('🏦 Configurando conta bancária...');
    const bankAccount = await prisma.bankAccount.upsert({
      where: { id: 'seed-bank-account-01' },
      update: {
        balanceCache: new Prisma.Decimal(25_000.0),
      },
      create: {
        id: 'seed-bank-account-01',
        companyId: company.id,
        bankName: 'Nubank Business',
        agency: '0001',
        account: '998877-0',
        balanceCache: new Prisma.Decimal(25_000.0),
      },
    });

    // ------------------------------------------------------------------
    // 6. TRANSAÇÕES
    // ------------------------------------------------------------------
    await prisma.bankTransaction.deleteMany({ where: { companyId: company.id } });

    const transactionData: Prisma.BankTransactionCreateManyInput[] = Array.from(
      { length: 90 },
      (_, i) => ({
        companyId: company.id,
        bankAccountId: bankAccount.id,
        amount: new Prisma.Decimal((1500 + Math.random() * 500).toFixed(2)),
        type: TransactionType.CREDIT, // ✅ enum tipado correto
        description: `Recebimento Ref ${i}`,
        occurredAt: subDays(new Date(), i),
        reconciled: false,
        version: 1,
      }),
    );

    await prisma.bankTransaction.createMany({ data: transactionData });

    // ------------------------------------------------------------------
    // 7. FATURAS
    // ------------------------------------------------------------------
    await prisma.invoice.deleteMany({ where: { companyId: company.id } });

    await prisma.invoice.createMany({
      data: [
        {
          companyId: company.id,
          customerId: customer.id,
          amount: new Prisma.Decimal(12_000.0),
          status: InvoiceStatus.PENDING,
          type: InvoiceType.SERVICE,
          issuedAt: addDays(new Date(), 10),
          reconciled: false,
          version: 1,
        },
      ],
    });

    // ------------------------------------------------------------------
    // 8. SNAPSHOTS FINANCEIROS
    // ------------------------------------------------------------------
    await prisma.financialSnapshot.deleteMany({ where: { companyId: company.id } });

    for (let i = 0; i < 6; i++) {
      const date = subDays(new Date(), i * 30);

      await prisma.financialSnapshot.create({
        data: {
          companyId: company.id,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          revenue: new Prisma.Decimal(35_000),
          expenses: new Prisma.Decimal(12_000),
          taxPayable: new Prisma.Decimal(2_100),
          netProfit: new Prisma.Decimal(20_900),
          integrityHash: `hash_v2_${i}_${company.id}`,
          fatorRData: { value: 0.28, eligible: true },
        },
      });
    }

    // ------------------------------------------------------------------
    // 9. FOLHAS DE PAGAMENTO
    // ------------------------------------------------------------------
    await prisma.payroll.deleteMany({ where: { companyId: company.id } });

    for (let i = 1; i <= 6; i++) {
      const date = subDays(new Date(), i * 30);

      await prisma.payroll.create({
        data: {
          companyId: company.id,
          month: date.getMonth() + 1,
          year: date.getFullYear(),
          salariesAmount: new Prisma.Decimal(6_000.0),
          proLaboreAmount: new Prisma.Decimal(3_000.0),
          totalAmount: new Prisma.Decimal(9_000.0),
        },
      });
    }

    // ------------------------------------------------------------------
    // 10. COMPLIANCE CHECKS
    // ------------------------------------------------------------------
    console.log('🛡️ Populando verificações de compliance...');
    await prisma.complianceCheck.deleteMany({ where: { companyId: company.id } });

    await prisma.complianceCheck.createMany({
      data: [
        {
          companyId: company.id,
          checkName: 'Certidão Negativa de Débitos Federais',
          description: 'Regularidade fiscal perante a Receita Federal.',
          status: ComplianceStatus.RESOLVED,
          resolved: true,
          resolvedAt: new Date(),
        },
        {
          companyId: company.id,
          checkName: 'Regularidade do FGTS (CRF)',
          description: 'Consulta de regularidade junto à Caixa Econômica.',
          status: ComplianceStatus.RESOLVED,
          resolved: true,
          resolvedAt: new Date(),
        },
      ],
    });

    // ------------------------------------------------------------------
    // 11. OBRIGAÇÕES FISCAIS
    // ------------------------------------------------------------------
    console.log('📉 Gerando obrigações fiscais pendentes...');
    await prisma.taxObligation.deleteMany({ where: { companyId: company.id } });

    await prisma.taxObligation.createMany({
      data: [
        {
          companyId: company.id,
          name: 'DAS - Simples Nacional',
          amount: new Prisma.Decimal(2_150.0),
          dueDate: addDays(new Date(), 20),
          status: ObligationStatus.PENDING,
          version: 1,
        },
        {
          companyId: company.id,
          name: 'GPS - INSS Folha',
          amount: new Prisma.Decimal(850.0),
          dueDate: addDays(new Date(), 15),
          status: ObligationStatus.PENDING,
          version: 1,
        },
        {
          companyId: company.id,
          name: 'Folha de Pagamento',
          amount: new Prisma.Decimal(9_000.0),
          dueDate: addDays(new Date(), 5),
          status: ObligationStatus.PENDING,
          version: 1,
        },
      ],
    });

    console.log('✅ [Seed] Banco populado com sucesso e 100% compatível com o schema!');
  } catch (error) {
    console.error('❌ [Seed Error]:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();