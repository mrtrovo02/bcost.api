import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const deployVerifySource = readFileSync(
  resolve(process.cwd(), 'scripts', 'verify-deploy-state.cjs'),
  'utf8',
);
const authenticatedSmokeSource = readFileSync(
  resolve(process.cwd(), 'scripts', 'smoke-authenticated.cjs'),
  'utf8',
);
const publicSmokeSource = readFileSync(
  resolve(process.cwd(), 'scripts', 'smoke-production.cjs'),
  'utf8',
);
const ec2OperationalCheckSource = readFileSync(
  resolve(process.cwd(), 'scripts', 'ec2-operational-check.cjs'),
  'utf8',
);
const agentsSource = readFileSync(resolve(process.cwd(), 'AGENTS.md'), 'utf8');

describe('deploy verification release contract', () => {
  it('keeps authenticated smoke after public smoke and before deploy success', () => {
    const publicSmokeIndex = deployVerifySource.indexOf("runNpmScript('smoke:production')");
    const authenticatedSmokeIndex = deployVerifySource.indexOf("'smoke:authenticated'");
    const successIndex = deployVerifySource.indexOf('Deploy verificado: git e smoke de producao aprovados.');

    expect(publicSmokeIndex).toBeGreaterThan(-1);
    expect(authenticatedSmokeIndex).toBeGreaterThan(-1);
    expect(successIndex).toBeGreaterThan(-1);
    expect(publicSmokeIndex).toBeLessThan(authenticatedSmokeIndex);
    expect(authenticatedSmokeIndex).toBeLessThan(successIndex);
  });

  it('can require authenticated smoke for paid beta and official stages', () => {
    expect(deployVerifySource).toContain('BCOST_DEPLOY_REQUIRE_AUTH_SMOKE');
    expect(deployVerifySource).toContain('RELEASE_STAGE');
    expect(deployVerifySource).toContain("BCOST_SMOKE_AUTH_REQUIRED: 'true'");
    expect(deployVerifySource).toContain('Authenticated smoke obrigatorio neste deploy.');
    expect(deployVerifySource).toContain('Authenticated smoke opcional neste deploy');
  });

  it('keeps authenticated company smoke compatible with paginated company responses', () => {
    expect(authenticatedSmokeSource).toContain('Array.isArray(payload.data)');
    expect(authenticatedSmokeSource).toContain('Array.isArray(payload.items)');
    expect(authenticatedSmokeSource).toContain('Array.isArray(payload.records)');
    expect(authenticatedSmokeSource).toContain('assertNoDemoCompanyLeak(companyList)');
  });

  it('requires trace id on public API smoke checks', () => {
    expect(publicSmokeSource).toContain('expectTraceId: true');
    expect(publicSmokeSource).toContain("response.headers.get('x-bcost-trace-id')");
    expect(publicSmokeSource).toContain('x-bcost-trace-id ausente');
  });

  it('validates API build version drift when deploy exports BUILD_VERSION', () => {
    expect(publicSmokeSource).toContain("expectBuildVersion: process.env.BUILD_VERSION || ''");
    expect(publicSmokeSource).toContain('buildVersion esperado');
  });

  it('validates EC2 API health build version against the deployed git head', () => {
    expect(ec2OperationalCheckSource).toContain('function currentGitShortSha');
    expect(ec2OperationalCheckSource).toContain('git rev-parse --short HEAD');
    expect(ec2OperationalCheckSource).toContain("expectedService === 'bcost-api'");
    expect(ec2OperationalCheckSource).toContain(
      'buildVersionMatches(body.buildVersion, expectedBuildVersion)',
    );
  });

  it('documents deterministic BUILD_VERSION injection before PM2 restart', () => {
    expect(agentsSource).toContain('BUILD_VERSION');
    expect(agentsSource).toContain('git rev-parse --short HEAD');
    expect(agentsSource).toContain('pm2 restart bcost-api --update-env');
  });

  it('documents the EC2 operational check after backend deploy verification', () => {
    expect(agentsSource).toMatch(/npm run deploy:verify\s+npm run ops:ec2-check/);
  });

  it('validates production CORS preflight without legacy demo headers', () => {
    expect(publicSmokeSource).toContain("name: 'api-cors-preflight'");
    expect(publicSmokeSource).toContain("method: 'OPTIONS'");
    expect(publicSmokeSource).toContain("expectCorsOrigin: 'https://app.bcost.com.br'");
    expect(publicSmokeSource).toContain("forbidCorsHeader: 'x-demo-session'");
    expect(publicSmokeSource).toContain('Access-Control-Allow-Headers contem header proibido');
  });

  it('requires secure permissions for file based authenticated smoke secrets', () => {
    expect(authenticatedSmokeSource).toContain('function assertSecretFilePermissions');
    expect(authenticatedSmokeSource).toContain('function resolveSecretPath');
    expect(authenticatedSmokeSource).toContain("secretPath.startsWith('$HOME/')");
    expect(authenticatedSmokeSource).toContain("secretPath.startsWith('~/')");
    expect(authenticatedSmokeSource).toContain('stat.mode & 0o044');
    expect(authenticatedSmokeSource).toContain('stat.mode & 0o022');
    expect(authenticatedSmokeSource).toContain('permissao 600 ou mais restritiva');
    expect(authenticatedSmokeSource).toContain('arquivo de segredo esta vazio');
  });

  it('retries authenticated login only for throttling responses', () => {
    expect(authenticatedSmokeSource).toContain('function numericEnv');
    expect(authenticatedSmokeSource).toContain('async function loginWithRetry');
    expect(authenticatedSmokeSource).toContain('BCOST_SMOKE_AUTH_LOGIN_RETRIES');
    expect(authenticatedSmokeSource).toContain('BCOST_SMOKE_AUTH_LOGIN_RETRY_DELAY_MS');
    expect(authenticatedSmokeSource).toContain('login.status !== 429');
    expect(authenticatedSmokeSource).toContain('WARN login autenticado recebeu HTTP 429');
  });
});
