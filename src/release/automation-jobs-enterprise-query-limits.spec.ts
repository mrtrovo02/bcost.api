import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('automation jobs enterprise query limits contract', () => {
  const source = readFileSync(
    join(
      __dirname,
      '..',
      'modules',
      'automation',
      'automation-jobs-enterprise.service.ts',
    ),
    'utf8',
  );

  it('keeps automation job list pagination bounded for RPA operations', () => {
    expect(source).toContain(
      'private static readonly PAGE_LIMIT_DEFAULT = 100',
    );
    expect(source).toContain('private static readonly PAGE_LIMIT_MAX = 500');
    expect(source).toContain(
      'AutomationJobsEnterpriseService.PAGE_LIMIT_DEFAULT',
    );
    expect(source).toContain('AutomationJobsEnterpriseService.PAGE_LIMIT_MAX');
    expect(source).not.toContain('Number(query.limit || 100), 1), 500');
  });
});
