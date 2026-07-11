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
    expect(Number(result.factorR.toFixed(2))).toBe(0.28);
    expect(result.isEligibleForAnexoIII).toBe(true);
    expect(result.revenue12).toBe(100000);
    expect(result.payroll12).toBe(28000);
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

    expect(Number(result.factorR.toFixed(2))).toBe(0.2);
    expect(result.isEligibleForAnexoIII).toBe(false);
    expect(result.suggestion).toContain('Alerta: Fator R abaixo de 28%');
  });

  it('deve retornar elegibilidade falsa se o faturamento nos últimos 12 meses for zero', async () => {
    // Cenário crítico: Empresa sem faturamento (divisão por zero evitada logicamente)
    jest.spyOn(repository, 'getRevenueLast12Months').mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal(0) },
    });

    const result = await sut.execute('company-id-uuid');

    expect(result.factorR).toBe(0);
    expect(result.isEligibleForAnexoIII).toBe(false);
    expect(result.suggestion).toContain('Sem faturamento detectado');
  });
});
