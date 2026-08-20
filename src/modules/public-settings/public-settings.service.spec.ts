'use strict';

import { PublicSettingsService } from './public-settings.service.js';

describe('PublicSettingsService', () => {
  it('exposes only safe runtime settings for frontend compatibility', () => {
    const service = new PublicSettingsService();
    const settings = service.getSettings();
    const serialized = JSON.stringify(settings).toLowerCase();

    expect(settings.status).toBe('OK');
    expect(settings.app.apiVersion).toBe('v2');
    expect(settings.features.accountingPlatform).toBe(true);
    expect(settings.security.exposesSecrets).toBe(false);
    expect(serialized).not.toContain('database_url');
    expect(serialized).not.toContain('jwt_secret');
    expect(serialized).not.toContain('password');
  });
});
