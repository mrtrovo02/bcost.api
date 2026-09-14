import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('provision-production-company script contract', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'scripts', 'provision-production-company.cjs'),
    'utf8',
  );

  it('blocks production apply with the runtime RLS role', () => {
    expect(source).toContain('function assertProvisioningDatabaseRole()');
    expect(source).toContain("mode === 'runtime-override'");
    expect(source).toContain('Provisionamento produtivo bloqueado');
    expect(source).toContain(
      'a conexão informada usa a role runtime bcost_app',
    );
  });

  it('keeps runtime and provisioning database responsibilities separated', () => {
    expect(source).toContain(
      'A aplicação deve continuar usando DATABASE_URL com bcost_app',
    );
    expect(source).toContain('Use BCOST_PROVISION_DATABASE_URL ou DIRECT_URL');
    expect(source).toContain('if (confirm === CONFIRMATION_VALUE)');
    expect(source).toContain('assertProvisioningDatabaseRole();');
  });

  it('translates PostgreSQL RLS failures into an actionable provisioning hint', () => {
    expect(source).toContain('function normalizeProvisioningError');
    expect(source).toContain('violates row-level security policy');
    expect(source).toContain('code: "42501"');
    expect(source).toContain(
      'Use BCOST_PROVISION_DATABASE_URL com uma role administrativa',
    );
    expect(source).toContain('normalizeProvisioningError(error)');
  });
});
