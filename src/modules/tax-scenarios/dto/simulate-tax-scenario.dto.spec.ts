'use strict';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SimulateTaxScenarioDto } from './simulate-tax-scenario.dto.js';

const BASE_PAYLOAD = {
  activity: 'SERVICE_PROVIDER',
  monthlyRevenue: 220_000,
  monthlyDeductibleExpenses: 35_000,
  monthlyPayroll: 50_000,
  dependents: 1,
  currentModel: 'PF',
};

function validatePayload(companyId: string) {
  return validateSync(
    plainToInstance(SimulateTaxScenarioDto, {
      ...BASE_PAYLOAD,
      companyId,
    }),
  );
}

describe('SimulateTaxScenarioDto', () => {
  it('accepts real UUID company IDs for authenticated simulations', () => {
    const errors = validatePayload('6befc33e-95cd-4ef4-b111-4bc779f8d4f5');

    expect(errors).toHaveLength(0);
  });

  it('accepts controlled demo company IDs for demo simulations', () => {
    const errors = validatePayload('demo-001');

    expect(errors).toHaveLength(0);
  });

  it('rejects arbitrary company IDs', () => {
    const errors = validatePayload('company-123');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints?.matches).toContain(
      'companyId deve ser UUID válido ou identificador demo controlado.',
    );
  });
});
