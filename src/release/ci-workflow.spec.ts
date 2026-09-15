import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ciWorkflowSource = readFileSync(
  resolve(process.cwd(), '.github', 'workflows', 'ci.yml'),
  'utf8',
);

describe('backend CI workflow release contract', () => {
  it('executes the complete release gate suite instead of a fragile spec allowlist', () => {
    expect(ciWorkflowSource).toContain('npm run test:release-gates');
    expect(ciWorkflowSource).not.toContain('src/release/validate-production-env.spec.ts');
    expect(ciWorkflowSource).not.toContain('src/release/payroll-enterprise-query-limits.spec.ts');
  });

  it('keeps production CI on Node 24 with predeploy before business tests', () => {
    const nodeVersionIndex = ciWorkflowSource.indexOf('node-version: 24');
    const predeployIndex = ciWorkflowSource.indexOf('npm run predeploy:full');
    const releaseGateIndex = ciWorkflowSource.indexOf('npm run test:release-gates');
    const securityTestsIndex = ciWorkflowSource.indexOf('npm run test:security');

    expect(nodeVersionIndex).toBeGreaterThan(-1);
    expect(predeployIndex).toBeGreaterThan(-1);
    expect(releaseGateIndex).toBeGreaterThan(-1);
    expect(securityTestsIndex).toBeGreaterThan(-1);
    expect(nodeVersionIndex).toBeLessThan(predeployIndex);
    expect(predeployIndex).toBeLessThan(releaseGateIndex);
    expect(releaseGateIndex).toBeLessThan(securityTestsIndex);
  });
});
