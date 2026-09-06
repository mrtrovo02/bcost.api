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

function validateProductionEnvironment() {
  requireEquals('NODE_ENV', 'production', 'deve ser production no ambiente oficial.');
  requireNonEmpty('DATABASE_URL', 'conexão PostgreSQL obrigatória.');
  requireNonEmpty('DIRECT_URL', 'conexão direta obrigatória para Prisma/migrations.');
  requireNonEmpty('JWT_SECRET', 'segredo JWT obrigatório.');

  if (valueOf('JWT_SECRET').length > 0 && valueOf('JWT_SECRET').length < 48) {
    errors.push('JWT_SECRET: use segredo forte com pelo menos 48 caracteres em produção.');
  }

  requireHttpsUrl('FRONTEND_BASE_URL');
  requireHttpsUrl('PUBLIC_APP_URL');
  requireCorsOrigin('https://app.bcost.com.br');
  requireEquals('ENABLE_DEMO_FALLBACK', 'false', 'fallback demo deve ficar desligado em produção.');
  requireEquals('ALLOW_DEMO_SESSION', 'false', 'sessão demo pública deve ficar desligada em produção.');
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

  if (!valueOf('METRICS_API_KEY')) {
    warnings.push('METRICS_API_KEY: recomendado para proteger métricas operacionais.');
  }
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
