import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('notifications enterprise query limits contract', () => {
  const source = readFileSync(
    join(__dirname, '..', 'modules', 'notifications-enterprise', 'notifications-enterprise.service.ts'),
    'utf8',
  );

  it('keeps bounded pagination for notification and webhook lists', () => {
    expect(source).toContain('private static readonly PAGE_LIMIT_DEFAULT = 100');
    expect(source).toContain('private static readonly PAGE_LIMIT_MAX = 500');
    expect(source).toContain('NotificationsEnterpriseService.PAGE_LIMIT_DEFAULT');
    expect(source).toContain('NotificationsEnterpriseService.PAGE_LIMIT_MAX');
    expect(source).not.toContain('Number(query.limit || 100), 1), 500');
  });

  it('keeps summary and webhook dispatch queries capped', () => {
    expect(source).toContain('private static readonly NOTIFICATION_SUMMARY_LIMIT = 5000');
    expect(source).toContain('private static readonly WEBHOOK_SUMMARY_LIMIT = 1000');
    expect(source).toContain('private static readonly WEBHOOK_DISPATCH_LIMIT = 100');
    expect(source).toContain('take: NotificationsEnterpriseService.NOTIFICATION_SUMMARY_LIMIT');
    expect(source).toContain('take: NotificationsEnterpriseService.WEBHOOK_SUMMARY_LIMIT');
    expect(source).toContain('take: NotificationsEnterpriseService.WEBHOOK_DISPATCH_LIMIT');
  });
});
