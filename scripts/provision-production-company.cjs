'use strict';

const { createHash } = require('node:crypto');
const { PrismaClient, CompanyRole, TaxRegime } = require('@prisma/client');
const dotenv = require('dotenv');

dotenv.config();

const CONFIRMATION_VALUE = 'LINK_COMPANY';

function provisioningDatabaseUrl() {
  return process.env.BCOST_PROVISION_DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim() || null;
}

function createPrismaClient() {
  const url = provisioningDatabaseUrl();

  if (!url) {
    return new PrismaClient();
  }

  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

function databaseMode() {
  const url = provisioningDatabaseUrl();

  if (!url) {
    return 'runtime';
  }

  const username = new URL(url).username;
  return username.startsWith('bcost_app') ? 'runtime-override' : 'provisioning';
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calculateDigit = (base, weights) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cnpj.endsWith(`${firstDigit}${secondDigit}`);
}

function enumValue(enumObject, value, fallback) {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(enumObject, normalized)) {
    return enumObject[normalized];
  }
  return enumObject[fallback];
}

function formatUuidFromBytes(bytes) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function deterministicCompanyId(cnpj) {
  const bytes = createHash('sha256')
    .update(`bcost:company:${cnpj}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuidFromBytes(bytes);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} obrigatório.`);
  }
  return value;
}

async function main() {
  const userEmail = requiredEnv('BCOST_PROVISION_USER_EMAIL').toLowerCase();
  const companyName = requiredEnv('BCOST_PROVISION_COMPANY_NAME');
  const cnpj = onlyDigits(requiredEnv('BCOST_PROVISION_COMPANY_CNPJ'));
  const confirm = process.env.BCOST_PROVISION_CONFIRM?.trim();
  const shouldRevokeSessions = process.env.BCOST_PROVISION_REVOKE_SESSIONS === 'true';
  const role = enumValue(CompanyRole, process.env.BCOST_PROVISION_COMPANY_ROLE, 'OWNER');
  const taxRegime = enumValue(TaxRegime, process.env.BCOST_PROVISION_TAX_REGIME, 'SIMPLES_NACIONAL');
  const cnae = process.env.BCOST_PROVISION_CNAE?.trim() || null;
  const anexoValue = Number(process.env.BCOST_PROVISION_ANEXO ?? 3);
  const anexo = Number.isInteger(anexoValue) && anexoValue >= 1 && anexoValue <= 5 ? anexoValue : 3;

  if (!isValidCnpj(cnpj)) {
    throw new Error('BCOST_PROVISION_COMPANY_CNPJ inválido.');
  }

  const prisma = createPrismaClient();

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, email: true, active: true, name: true },
    });

    if (!user || !user.active) {
      throw new Error('Usuário não encontrado ou inativo.');
    }

    const existingCompany = await prisma.company.findUnique({
      where: { cnpj },
      select: { id: true, name: true, active: true, deletedAt: true },
    });
    const targetCompanyId = existingCompany?.id ?? deterministicCompanyId(cnpj);

    const preview = {
      mode: confirm === CONFIRMATION_VALUE ? 'apply' : 'dry-run',
      user: { id: user.id, email: user.email, name: user.name },
      company: {
        id: targetCompanyId,
        existingId: existingCompany?.id ?? null,
        name: companyName,
        cnpjSuffix: cnpj.slice(-6),
        taxRegime,
        role,
      },
      shouldRevokeSessions,
      databaseMode: databaseMode(),
    };

    console.log(JSON.stringify(preview, null, 2));

    if (confirm !== CONFIRMATION_VALUE) {
      console.log(`Dry-run concluído. Para aplicar, defina BCOST_PROVISION_CONFIRM=${CONFIRMATION_VALUE}.`);
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_company_id', ${targetCompanyId}, true)
      `;

      const company = await tx.company.upsert({
        where: { cnpj },
        update: {
          name: companyName,
          taxRegime,
          cnae,
          anexo,
          active: true,
          deletedAt: null,
        },
        create: {
          id: targetCompanyId,
          name: companyName,
          cnpj,
          taxRegime,
          cnae,
          anexo,
          active: true,
        },
        select: { id: true, name: true, cnpj: true, taxRegime: true },
      });

      await tx.companyUser.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: company.id,
          },
        },
        update: {
          role,
          deletedAt: null,
        },
        create: {
          userId: user.id,
          companyId: company.id,
          role,
        },
      });

      let revokedSessions = 0;
      if (shouldRevokeSessions) {
        const deleted = await tx.userSession.deleteMany({ where: { userId: user.id } });
        revokedSessions = deleted.count;
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          companyId: company.id,
          action: 'PRODUCTION_COMPANY_PROVISIONED',
          module: 'AUTH',
          entity: 'CompanyUser',
          entityId: `${user.id}:${company.id}`,
          payload: {
            userEmail: user.email,
            companyName: company.name,
            cnpjSuffix: company.cnpj.slice(-6),
            role,
            taxRegime,
            revokedSessions,
          },
          statusCode: 200,
        },
      });

      return { company, revokedSessions };
    });

    console.log(
      JSON.stringify(
        {
          status: 'OK',
          companyId: result.company.id,
          companyName: result.company.name,
          revokedSessions: result.revokedSessions,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
