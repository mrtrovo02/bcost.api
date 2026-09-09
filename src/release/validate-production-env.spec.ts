import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type ReleaseCheckResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

const scriptPath = resolve(process.cwd(), 'scripts', 'validate-production-env.cjs');

const baseEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://bcost_app:bcost@localhost:5432/bcost',
  DIRECT_URL: 'postgresql://bcost:bcost@localhost:5432/bcost',
  JWT_SECRET: 'bcost-release-check-secret-with-more-than-forty-eight-characters',
  JWT_EXPIRES_IN: '15m',
  FRONTEND_BASE_URL: 'https://app.bcost.com.br',
  PUBLIC_APP_URL: 'https://app.bcost.com.br',
  CORS_ORIGINS: 'https://bcost.com.br,https://www.bcost.com.br,https://app.bcost.com.br',
  ENABLE_DEMO_FALLBACK: 'false',
  ALLOW_DEMO_SESSION: 'false',
  ALLOW_SETUP_ADMIN: 'false',
  ENABLE_SWAGGER: 'false',
  STRIPE_SECRET_KEY: 'stripe___fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_release_check',
  STRIPE_PRICE_PRO: 'price_release_check_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_release_check_enterprise',
  METRICS_API_KEY: 'release-check-metrics-key',
};

function runReleaseCheck(overrides: Partial<NodeJS.ProcessEnv> = {}): ReleaseCheckResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...baseEnv,
      ...overrides,
    },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('validate-production-env release gate', () => {
  it('aprova um ambiente produtivo com controles críticos ativos', () => {
    const result = runReleaseCheck();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release check aprovado');
  });

  it('bloqueia JWT com validade maior que uma hora', () => {
    const result = runReleaseCheck({ JWT_EXPIRES_IN: '2h' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_EXPIRES_IN');
    expect(result.stderr).toContain('no máximo 1 hora');
  });

  it('bloqueia setup admin ligado em produção', () => {
    const result = runReleaseCheck({ ALLOW_SETUP_ADMIN: 'true' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ALLOW_SETUP_ADMIN');
  });

  it('bloqueia Swagger público em produção', () => {
    const result = runReleaseCheck({ ENABLE_SWAGGER: 'true' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENABLE_SWAGGER');
  });

  it('aceita o usuário bcost_app com sufixo de projeto do pooler Supabase', () => {
    const result = runReleaseCheck({
      DATABASE_URL:
        'postgresql://bcost_app.fwzwaacloubaabmcdpik:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release check aprovado');
  });

  it('rejeita usuários administrativos na DATABASE_URL', () => {
    const result = runReleaseCheck({
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/bcost',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stderr).toContain('postgres');
  });

  it('rejeita DIRECT_URL igual a DATABASE_URL para evitar migrations pelo runtime pooler', () => {
    const url =
      'postgresql://bcost_app.fwzwaacloubaabmcdpik:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
    const result = runReleaseCheck({
      DATABASE_URL: url,
      DIRECT_URL: url,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DIRECT_URL');
    expect(result.stderr).toContain('diferente da DATABASE_URL');
  });

  it('rejeita DIRECT_URL no transaction pooler do Supabase', () => {
    const result = runReleaseCheck({
      DIRECT_URL:
        'postgresql://postgres.fwzwaacloubaabmcdpik:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DIRECT_URL');
    expect(result.stderr).toContain('Session Pooler na porta 5432');
  });

  it('permite beta controlado sem Stripe live mantendo os demais gates criticos', () => {
    const result = runReleaseCheck({
      RELEASE_STAGE: 'beta',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_PRO: '',
      STRIPE_PRICE_ENTERPRISE: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Release check aprovado');
    expect(result.stderr).toContain('RELEASE_STAGE=beta');
  });

  it('rejeita RELEASE_STAGE desconhecido para evitar deploy com gate ambiguo', () => {
    const result = runReleaseCheck({ RELEASE_STAGE: 'preview' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RELEASE_STAGE');
    expect(result.stderr).toContain('official');
    expect(result.stderr).toContain('beta');
  });

  it('rejeita chave publicavel pk_live como segredo Stripe do backend', () => {
    const result = runReleaseCheck({
      STRIPE_SECRET_KEY: 'stripe___fixture',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STRIPE_SECRET_KEY');
    expect(result.stderr).toContain('sk_live_');
  });

  it('rejeita configuracao demo parcial para evitar ambiente misto', () => {
    const result = runReleaseCheck({
      ENABLE_DEMO_FALLBACK: 'true',
      ALLOW_DEMO_SESSION: 'false',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DEMO');
    expect(result.stderr).toContain('devem ser habilitados ou desabilitados juntos');
  });

  it('nao permite que o beta controlado enfraqueca a role de runtime', () => {
    const result = runReleaseCheck({
      RELEASE_STAGE: 'beta',
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/bcost',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_PRO: '',
      STRIPE_PRICE_ENTERPRISE: '',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stderr).toContain('postgres');
  });
});
