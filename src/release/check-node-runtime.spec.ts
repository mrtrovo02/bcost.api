import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type RuntimeCheckResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

const scriptPath = resolve(process.cwd(), 'scripts', 'check-node-runtime.cjs');

function runRuntimeCheck(version: string): RuntimeCheckResult {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BCOST_NODE_VERSION_OVERRIDE: version,
    },
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('check-node-runtime', () => {
  it('aprova Node 24 ou superior para deploy', () => {
    const result = runRuntimeCheck('24.0.0');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Node runtime aprovado');
  });

  it('bloqueia Node 20 para evitar deploy fora do baseline comercial', () => {
    const result = runRuntimeCheck('20.20.2');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Node runtime reprovado');
    expect(result.stderr).toContain('Node.js 24 LTS');
  });
});
