'use strict';

import { CalculateFactorRUseCase } from './calculate-factor-r.use-case.js';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

/**
 * Mock do Repositório de Receita.
 * Implementa a interface abstrata garantindo conformidade com o domínio.
 */
class MockRevenueRepository {
  getRevenueLast12Months() {
    return Promise.resolve({ _sum: { amount: new Prisma.Decimal(100000) } });
  }
  getPayrollLast12Months() {
    return Promise.resolve({
      _sum: { totalAmount: new Prisma.Decimal(28000) },
    });
  }
  upsertTaxCalculation = jest.fn(() => Promise.resolve({ id: 'tax-calc-id' }));
}

describe('CalculateFactorRUseCase', () => {
  let sut: CalculateFactorRUseCase; // System Under Test
  let repository: MockRevenueRepository;

  beforeEach(() => {
    repository = new MockRevenueRepository();
    sut = new CalculateFactorRUseCase(repository);
  });

  it('deve calcular o Fator R corretamente atingindo o limite de 28%', async () => {
    // Execução do cálculo para uma empresa com R$ 100k de receita e R$ 28k de folha
    const result = await sut.execute('company-id-uuid');

    // Validações técnicas
    expect(Number(result.value.toFixed(2))).toBe(0.28);
    expect(result.isEligibleForAnexoIII).toBe(true);
    expect(result.revenueLast12Months).toBe(100000);
    expect(result.payrollLast12Months).toBe(28000);
    expect(repository.upsertTaxCalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-id-uuid',
        totalAmount: 100000,
        fatorR: 0.28,
      }),
    );
  });

  it('deve identificar quando a empresa NÃO é elegível ao Anexo III (< 28%)', async () => {
    /**
     * Sobrescrevendo o comportamento do mock para um cenário de 20%.
     * Utilizamos Prisma.Decimal para manter a integridade dos tipos da infraestrutura.
     */
    jest.spyOn(repository, 'getPayrollLast12Months').mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(20000) },
    });

    const result = await sut.execute('company-id-uuid');

    expect(Number(result.value.toFixed(2))).toBe(0.2);
    expect(result.isEligibleForAnexoIII).toBe(false);
    expect(result.analysis).toContain('Fator R abaixo de 28%');
  });

  it('deve aplicar a regra oficial quando há folha e não há faturamento nos últimos 12 meses', async () => {
    jest.spyOn(repository, 'getRevenueLast12Months').mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(0) },
    });

    const result = await sut.execute('company-id-uuid');

    expect(result.value).toBe(0.28);
    expect(result.isEligibleForAnexoIII).toBe(true);
    expect(result.analysis).toContain('Elegível ao Anexo III');
  });

  it('deve aplicar fator R de 1% quando não há folha', async () => {
    jest.spyOn(repository, 'getPayrollLast12Months').mockResolvedValueOnce({
      _sum: { totalAmount: new Prisma.Decimal(0) },
    });

    const result = await sut.execute('company-id-uuid');

    expect(result.value).toBe(0.01);
    expect(result.isEligibleForAnexoIII).toBe(false);
  });
});
