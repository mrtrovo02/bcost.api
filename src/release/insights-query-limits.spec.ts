import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('insights query limits release contract', () => {
  const insightsServiceSource = readFileSync(
    join(__dirname, '..', 'insights', 'insights.service.ts'),
    'utf8',
  );
  const cashFlowServiceSource = readFileSync(
    join(
      __dirname,
      '..',
      'insights',
      'cash-flow-projection',
      'cash-flow-projection.service.ts',
    ),
    'utf8',
  );
  const anomalyServiceSource = readFileSync(
    join(
      __dirname,
      '..',
      'insights',
      'anomaly-detection',
      'anomaly-detection.service.ts',
    ),
    'utf8',
  );

  it('caps batch insights processing by active company count', () => {
    expect(insightsServiceSource).toContain('ACTIVE_COMPANIES_BATCH_LIMIT');
    expect(insightsServiceSource).toContain(
      'take: InsightsService.ACTIVE_COMPANIES_BATCH_LIMIT',
    );
    expect(insightsServiceSource).toContain("orderBy: { updatedAt: 'desc' }");
  });

  it('caps pending tax alert queries', () => {
    expect(insightsServiceSource).toContain('PENDING_TAX_ALERT_LIMIT');
    expect(insightsServiceSource).toContain(
      'take: InsightsService.PENDING_TAX_ALERT_LIMIT',
    );
    expect(insightsServiceSource).toContain("orderBy: { dueDate: 'asc' }");
  });

  it('caps cash-flow projection inputs by source type', () => {
    expect(cashFlowServiceSource).toContain('BANK_ACCOUNT_BALANCE_LIMIT');
    expect(cashFlowServiceSource).toContain('HISTORICAL_TRANSACTION_LIMIT');
    expect(cashFlowServiceSource).toContain(
      'PENDING_INVOICE_PROJECTION_LIMIT',
    );
    expect(cashFlowServiceSource).toContain(
      'TAX_OBLIGATION_PROJECTION_LIMIT',
    );
    expect(cashFlowServiceSource).toContain(
      'take: CashFlowProjectionService.BANK_ACCOUNT_BALANCE_LIMIT',
    );
    expect(cashFlowServiceSource).toContain(
      'take: CashFlowProjectionService.HISTORICAL_TRANSACTION_LIMIT',
    );
    expect(cashFlowServiceSource).toContain(
      'take: CashFlowProjectionService.PENDING_INVOICE_PROJECTION_LIMIT',
    );
    expect(cashFlowServiceSource).toContain(
      'take: CashFlowProjectionService.TAX_OBLIGATION_PROJECTION_LIMIT',
    );
  });

  it('caps anomaly and invoice integrity audit samples', () => {
    expect(anomalyServiceSource).toContain('TRANSACTION_ANOMALY_SAMPLE_LIMIT');
    expect(anomalyServiceSource).toContain('INVOICE_INTEGRITY_AUDIT_LIMIT');
    expect(anomalyServiceSource).toContain(
      'take: AnomalyDetectionService.TRANSACTION_ANOMALY_SAMPLE_LIMIT',
    );
    expect(anomalyServiceSource).toContain(
      'take: AnomalyDetectionService.INVOICE_INTEGRITY_AUDIT_LIMIT',
    );
  });
});
