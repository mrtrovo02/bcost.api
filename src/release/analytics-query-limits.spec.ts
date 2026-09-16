import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('analytics query limits release contract', () => {
  const forecastingSource = readFileSync(
    join(__dirname, '..', 'modules', 'analytics', 'forecasting.service.ts'),
    'utf8',
  );

  it('limits active contract queries used by the forecasting engine', () => {
    expect(forecastingSource).toContain('ACTIVE_CONTRACTS_FORECAST_LIMIT');
    expect(forecastingSource).toContain('take: ForecastingService.ACTIVE_CONTRACTS_FORECAST_LIMIT');
    expect(forecastingSource).toContain("orderBy: { updatedAt: 'desc' }");
  });
});
