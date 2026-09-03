import { BadRequestException } from '@nestjs/common';
import {
  ContractStatus,
  InvoiceStatus,
  InvoiceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { ContractService } from './contract.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

interface ContractRecord {
  id: string;
  companyId: string;
  customerId: string;
  amount: Prisma.Decimal;
}

interface ContractPrismaMock {
  customer: {
    upsert: jest.Mock<Promise<{ id: string }>, [unknown]>;
    findFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
  };
  contract: {
    create: jest.Mock<Promise<unknown>, [unknown]>;
    findMany: jest.Mock<Promise<ContractRecord[]>, [unknown]>;
    findFirst: jest.Mock<Promise<unknown>, [unknown]>;
    update: jest.Mock<Promise<unknown>, [unknown]>;
  };
  invoice: {
    create: jest.Mock<Promise<{ id: string }>, [unknown]>;
  };
  auditLog: {
    create: jest.Mock<Promise<unknown>, [unknown]>;
  };
  withRlsCompanyContext: jest.Mock<
    Promise<unknown>,
    [string, (transaction: ContractPrismaMock) => Promise<unknown>]
  >;
}

function createPrismaMock(): ContractPrismaMock {
  const prisma = {
    customer: {
      upsert: jest.fn<Promise<{ id: string }>, [unknown]>().mockResolvedValue({
        id: 'customer-001',
      }),
      findFirst: jest
        .fn<Promise<{ id: string } | null>, [unknown]>()
        .mockResolvedValue({
          id: 'customer-001',
        }),
    },
    contract: {
      create: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'contract-001',
      }),
      findMany: jest
        .fn<Promise<ContractRecord[]>, [unknown]>()
        .mockResolvedValue([]),
      findFirst: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'contract-001',
      }),
      update: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'contract-001',
      }),
    },
    invoice: {
      create: jest.fn<Promise<{ id: string }>, [unknown]>().mockResolvedValue({
        id: 'invoice-001',
      }),
    },
    auditLog: {
      create: jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue({
        id: 'audit-001',
      }),
    },
    withRlsCompanyContext: jest.fn<
      Promise<unknown>,
      [string, (transaction: ContractPrismaMock) => Promise<unknown>]
    >(async (_companyId, callback) => callback(prisma)),
  };

  return prisma;
}

function createDto(
  overrides: Partial<CreateContractDto> = {},
): CreateContractDto {
  const dto = new CreateContractDto();
  dto.companyId = 'company-001';
  dto.customerName = 'Cliente Real LTDA';
  dto.customerDocument = '11222333000181';
  dto.customerEmail = 'financeiro@cliente.com.br';
  dto.description = 'Mensalidade contábil';
  dto.amount = 399;
  Object.assign(dto, overrides);
  return dto;
}

describe('ContractService', () => {
  let prisma: ContractPrismaMock;
  let service: ContractService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ContractService(prisma as unknown as PrismaService);
  });

  it('cria contrato com cliente inline dentro do contexto RLS da empresa', async () => {
    await service.createFromDto(createDto());

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.customer.upsert).toHaveBeenCalledWith({
      where: {
        companyId_document: {
          companyId: 'company-001',
          document: '11222333000181',
        },
      },
      create: {
        companyId: 'company-001',
        name: 'Cliente Real LTDA',
        document: '11222333000181',
        email: 'financeiro@cliente.com.br',
      },
      update: {
        name: 'Cliente Real LTDA',
        email: 'financeiro@cliente.com.br',
        active: true,
        deletedAt: null,
      },
    });
    expect(prisma.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-001',
        customerId: 'customer-001',
        billingDay: 5,
        amount: new Prisma.Decimal(399),
      }),
    });
  });

  it('bloqueia contrato sem customerId e sem dados minimos do cliente', async () => {
    const dto = createDto({
      customerName: undefined,
      customerDocument: undefined,
    });

    await expect(service.createFromDto(dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('lista contratos por empresa dentro do contexto RLS', async () => {
    await service.findByCompany('company-001');

    expect(prisma.withRlsCompanyContext).toHaveBeenCalledWith(
      'company-001',
      expect.any(Function),
    );
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-001', deletedAt: null },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('executa ciclo de faturamento dentro do contexto RLS da empresa', async () => {
    const billingDay = new Date().getDate();
    const contract: ContractRecord = {
      id: 'contract-001',
      companyId: 'company-001',
      customerId: 'customer-001',
      amount: new Prisma.Decimal(399),
    };

    prisma.contract.findMany.mockResolvedValueOnce([contract]);
    prisma.contract.findFirst.mockResolvedValueOnce(contract);

    const result = await service.runBillingCycle('company-001', 'user-001');

    expect(result).toEqual({
      processed: 1,
      successful: 1,
      details: [{ contractId: 'contract-001', invoiceId: 'invoice-001' }],
    });
    expect(prisma.withRlsCompanyContext).toHaveBeenCalledTimes(2);
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 'company-001',
        status: ContractStatus.ACTIVE,
        billingDay,
      }),
    });
    expect(prisma.invoice.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-001',
        customerId: 'customer-001',
        type: InvoiceType.SERVICE,
        status: InvoiceStatus.NORMAL,
        amount: new Prisma.Decimal(399),
        issuedAt: expect.any(Date),
        reconciled: false,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-001',
        companyId: 'company-001',
        action: 'CONTRACT_AUTO_BILLING',
        module: 'REVENUE',
        entity: 'Contract',
        entityId: 'contract-001',
      }),
    });
  });
});
