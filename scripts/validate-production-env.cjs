'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(process.cwd(), '.env');

if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const errors = [];
const warnings = [];

function valueOf(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function requireNonEmpty(name, message) {
  if (!valueOf(name)) {
    errors.push(`${name}: ${message}`);
  }
}

function requireHttpsUrl(name) {
  const value = valueOf(name);
  if (!value) {
    errors.push(`${name}: URL obrigatória para produção.`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      errors.push(`${name}: deve usar HTTPS em produção.`);
    }
  } catch {
    errors.push(`${name}: URL inválida.`);
  }
}

function requireRuntimeDatabaseRole() {
  const value = valueOf('DATABASE_URL');

  if (!value) return;

  try {
    const username = decodeURIComponent(new URL(value).username);
    if (username !== 'bcost_app') {
      errors.push(
        `DATABASE_URL: use a role de runtime bcost_app sem BYPASSRLS; usuário atual: ${username || '(ausente)'}.`,
      );
    }
  } catch {
    errors.push('DATABASE_URL: URL inválida para validar a role de runtime.');
  }
}

function parseOrigins(raw) {
  return raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function requireCorsOrigin(expectedOrigin) {
  const origins = parseOrigins(valueOf('CORS_ORIGINS'));
  if (!origins.includes(expectedOrigin)) {
    errors.push(`CORS_ORIGINS: deve conter ${expectedOrigin}.`);
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:') {
        errors.push(`CORS_ORIGINS: origem ${origin} deve usar HTTPS.`);
      }
    } catch {
      errors.push(`CORS_ORIGINS: origem inválida ${origin}.`);
    }
  }
}

function requireEquals(name, expected, message) {
  if (valueOf(name) !== expected) {
    errors.push(`${name}: ${message}`);
  }
}

function requirePrefix(name, prefix, message) {
  const value = valueOf(name);
  if (!value.startsWith(prefix)) {
    errors.push(`${name}: ${message}`);
  }
}

function durationToSeconds(value) {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(value);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    ms: 0.001,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
    y: 31536000,
  };

  return amount * multipliers[unit];
}

function requireMaxDuration(name, maxSeconds, message) {
  const value = valueOf(name);
  if (!value) {
    errors.push(`${name}: duração obrigatória para produção.`);
    return;
  }

  const seconds = durationToSeconds(value);
  if (seconds === null) {
    errors.push(`${name}: use formatos como 15m, 1h, 3600s.`);
    return;
  }

  if (seconds > maxSeconds) {
    errors.push(`${name}: ${message}`);
  }
}

function validateProductionEnvironment() {
  requireEquals('NODE_ENV', 'production', 'deve ser production no ambiente oficial.');
  requireNonEmpty('DATABASE_URL', 'conexão PostgreSQL obrigatória.');
  requireNonEmpty('DIRECT_URL', 'conexão direta obrigatória para Prisma/migrations.');
  requireRuntimeDatabaseRole();
  requireNonEmpty('JWT_SECRET', 'segredo JWT obrigatório.');

  if (valueOf('JWT_SECRET').length > 0 && valueOf('JWT_SECRET').length < 48) {
    errors.push('JWT_SECRET: use segredo forte com pelo menos 48 caracteres em produção.');
  }

  requireMaxDuration(
    'JWT_EXPIRES_IN',
    3600,
    'access token deve expirar em no máximo 1 hora em produção.',
  );

  requireHttpsUrl('FRONTEND_BASE_URL');
  requireHttpsUrl('PUBLIC_APP_URL');
  requireCorsOrigin('https://app.bcost.com.br');
  requireEquals('ENABLE_DEMO_FALLBACK', 'false', 'fallback demo deve ficar desligado em produção.');
  requireEquals('ALLOW_DEMO_SESSION', 'false', 'sessão demo pública deve ficar desligada em produção.');
  requireEquals('ALLOW_SETUP_ADMIN', 'false', 'setup admin deve ficar desligado em produção.');
  requireEquals('ENABLE_SWAGGER', 'false', 'Swagger público deve ficar desligado em produção.');

  requirePrefix(
    'STRIPE_SECRET_KEY',
    'sk_live_',
    'use uma chave live do Stripe para monetização oficial.',
  );
  requirePrefix(
    'STRIPE_WEBHOOK_SECRET',
    'whsec_',
    'use o signing secret do endpoint webhook do Stripe.',
  );
  requirePrefix('STRIPE_PRICE_PRO', 'price_', 'price id do plano PRO obrigatório.');
  requirePrefix('STRIPE_PRICE_ENTERPRISE', 'price_', 'price id do plano ENTERPRISE obrigatório.');
  requireNonEmpty(
    'METRICS_API_KEY',
    'obrigatório para proteger /metrics e sustentar observabilidade/SLA em produção.',
  );
}

validateProductionEnvironment();

if (warnings.length > 0) {
  console.warn('Avisos de produção:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('Release check reprovado:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Release check aprovado: ambiente backend pronto para deploy produtivo.');
