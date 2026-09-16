import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SecurityScanResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

const scriptPath = resolve(process.cwd(), 'scripts', 'check-versioned-secrets.cjs');
const scriptSource = readFileSync(scriptPath, 'utf8');
const pullRequestTemplateSource = readFileSync(
  resolve(process.cwd(), '.github', 'pull_request_template.md'),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  readonly scripts?: Record<string, string>;
};

function runSecurityScan(): SecurityScanResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('check-versioned-secrets', () => {
  it('expoe aliases npm estaveis para a varredura de segredos versionados', () => {
    expect(packageJson.scripts?.['security:scan']).toBe('node scripts/check-versioned-secrets.cjs');
    expect(packageJson.scripts?.['check:versioned-secrets']).toBe(
      'node scripts/check-versioned-secrets.cjs',
    );
  });

  it('mantem checklist de PR apontando para o scanner operacional de segredos', () => {
    expect(pullRequestTemplateSource).toContain('npm run check:versioned-secrets');
    expect(pullRequestTemplateSource).toContain('npm run security:scan');
  });

  it('mantem bloqueio para arquivos .env reais versionados', () => {
    expect(scriptSource).toContain('isForbiddenTrackedEnvFile');
    expect(scriptSource).toContain('arquivo de ambiente real nao deve ser versionado');
    expect(scriptSource).toContain("fileName.endsWith('.example')");
  });

  it('mantem bloqueio para chaves e certificados versionados', () => {
    expect(scriptSource).toContain('isForbiddenTrackedSecretArtifact');
    expect(scriptSource).toContain("'.pem'");
    expect(scriptSource).toContain("'.p12'");
    expect(scriptSource).toContain("'id_rsa'");
    expect(scriptSource).toContain('artefato criptografico nao deve ser versionado');
  });

  it('aprova o estado atual do repositorio sem segredos versionados', () => {
    const result = runSecurityScan();

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Security scan aprovado');
  });
});
