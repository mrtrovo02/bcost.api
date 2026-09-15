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
