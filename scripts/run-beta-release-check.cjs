'use strict';

const betaDefaults = {
  BCOST_NODE_VERSION_OVERRIDE: '24.0.0',
  RELEASE_STAGE: 'beta',
  NODE_ENV: 'production',
  DATABASE_URL:
    'postgresql://bcost_app.fwzwaacloubaabmcdpik:placeholder@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
  DIRECT_URL:
    'postgresql://postgres.fwzwaacloubaabmcdpik:placeholder@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  JWT_SECRET: 'local-beta-release-check-placeholder-with-at-least-forty-eight-characters',
  JWT_EXPIRES_IN: '15m',
  FRONTEND_BASE_URL: 'https://app.bcost.com.br',
  PUBLIC_APP_URL: 'https://app.bcost.com.br',
  CORS_ORIGINS: 'https://app.bcost.com.br,https://bcost.com.br,https://www.bcost.com.br',
  ENABLE_DEMO_FALLBACK: 'false',
  ALLOW_DEMO_SESSION: 'false',
  ALLOW_SETUP_ADMIN: 'false',
  ENABLE_SWAGGER: 'false',
  METRICS_API_KEY: 'local-beta-release-check-metrics-key-32-chars-minimum',
};

for (const [key, value] of Object.entries(betaDefaults)) {
  process.env[key] = value;
}

require('./validate-production-env.cjs');
