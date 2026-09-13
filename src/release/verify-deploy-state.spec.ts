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

describe('deploy verification release contract', () => {
  it('keeps authenticated smoke after public smoke and before deploy success', () => {
    const publicSmokeIndex = deployVerifySource.indexOf("runNpmScript('smoke:production')");
    const authenticatedSmokeIndex = deployVerifySource.indexOf("runNpmScript(\n    'smoke:authenticated'");
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
