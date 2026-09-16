import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js'; // Você precisará criar este DTO
import { CompanyRole, Prisma, TaxRegime } from '@prisma/client';
import {
  isValidCnpj,
  normalizeCnpj,
} from '../../common/validators/cnpj.util.js';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  private static readonly COMPANY_LIST_LIMIT = 100;

  constructor(private readonly prisma: PrismaService) {}

  private companyAuditPayload(
    company: {
      id: string;
      name: string;
      cnpj: string;
      taxRegime: TaxRegime;
      cnae?: string | null;
      anexo?: number | null;
      active?: boolean;
    },
    extra: Record<string, unknown> = {},
  ): Prisma.InputJsonObject {
    return {
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        taxRegime: company.taxRegime,
        cnae: company.cnae ?? null,
        anexo: company.anexo ?? null,
        active: company.active ?? true,
      },
      ...extra,
    };
  }

  private async assertCanManageCompany(companyId: string, userId: string) {
    const membership = await this.prisma.companyUser.findFirst({
      where: { companyId, userId, deletedAt: null },
      select: { role: true },
    });

    if (!membership || !['OWNER', 'MANAGER'].includes(membership.role)) {
      throw new ForbiddenException(
        'Acesso negado para gerenciar esta empresa.',
      );
    }

    return membership;
  }

  /**
   * Registra uma nova empresa validando a duplicidade de CNPJ e incluindo dados fiscais.
   */
  async create(dto: CreateCompanyDto, userId: string) {
    const normalizedCnpj = normalizeCnpj(dto.cnpj);

    if (!isValidCnpj(normalizedCnpj)) {
      throw new BadRequestException(
        'Informe um CNPJ válido para cadastrar a empresa.',
      );
    }

    this.logger.log(
      `Iniciando cadastro da empresa: ${dto.name} - CNPJ: ${normalizedCnpj}`,
    );

    const exists = await this.prisma.company.findUnique({
      where: { cnpj: normalizedCnpj },
    });

    if (exists) {
      this.logger.warn(
        `Tentativa de cadastro com CNPJ duplicado: ${normalizedCnpj}`,
      );
      throw new ConflictException(
        'Uma empresa com este CNPJ já está cadastrada no sistema.',
      );
    }

    try {
      const companyId = randomUUID();

      return await this.prisma.withRlsCompanyContext(companyId, async (tx) => {
        const company = await tx.company.create({
          data: {
            id: companyId,
            name: dto.name,
            cnpj: normalizedCnpj,
            taxRegime: dto.taxRegime ?? TaxRegime.SIMPLES_NACIONAL,
            // Agora suportando os novos campos do Prisma que sincronizamos
            cnae: dto.cnae ?? null,
            anexo: dto.anexo ?? 3,
            active: true,
          },
        });

        // Vincula o criador como OWNER da empresa
        await tx.companyUser.create({
          data: {
            userId,
            companyId: company.id,
            role: CompanyRole.OWNER,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            companyId: company.id,
            action: 'COMPANY_CREATED',
            module: 'COMPANY',
            entity: 'Company',
            entityId: company.id,
            payload: this.companyAuditPayload(company, {
              assignedRole: CompanyRole.OWNER,
            }),
            statusCode: 201,
          },
        });

        return company;
      });
    } catch (error) {
      this.logger.error(
        'Erro ao persistir empresa no banco de dados',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  /**
   * Retorna todas as empresas ativas com filtros básicos.
   */
  async findAll(userId: string) {
    return this.prisma.company.findMany({
      where: {
        active: true,
        deletedAt: null,
        users: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        taxRegime: true,
        cnae: true,
        anexo: true,
        active: true,
        planLevel: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
      take: CompanyService.COMPANY_LIST_LIMIT,
    });
  }

  /**
   * Busca uma empresa específica por ID.
   */
  async findOne(id: string, userId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        active: true,
        deletedAt: null,
        users: {
          some: { userId, deletedAt: null },
        },
      },
    });

    if (!company) {
      this.logger.warn(`Busca falhou: Empresa ID ${id} não encontrada.`);
      throw new NotFoundException(`Empresa com ID ${id} não encontrada.`);
    }

    return company;
  }

  /**
   * Atualiza dados da empresa, incluindo CNAE e Anexo Fiscal.
   * Essencial para o ajuste do motor de cálculo (TaxService).
   */
  async update(id: string, dto: UpdateCompanyDto, userId: string) {
    const current = await this.findOne(id, userId); // Valida se existe e pertence ao usuário
    await this.assertCanManageCompany(id, userId);

    try {
      this.logger.log(`Atualizando dados fiscais da empresa ID: ${id}`);
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.company.update({
          where: { id },
          data: dto,
        });

        await tx.auditLog.create({
          data: {
            userId,
            companyId: id,
            action: 'COMPANY_UPDATED',
            module: 'COMPANY',
            entity: 'Company',
            entityId: id,
            payload: {
              before: this.companyAuditPayload(current),
              after: this.companyAuditPayload(updated),
              changedFields: Object.keys(dto),
            },
            statusCode: 200,
          },
        });

        return updated;
      });
    } catch (error) {
      this.logger.error(`Erro ao atualizar empresa ${id}`, error);
      throw error;
    }
  }

  /**
   * Realiza a desativação lógica da empresa (Soft Delete).
   */
  async delete(id: string, userId: string) {
    const company = await this.findOne(id, userId);
    await this.assertCanManageCompany(id, userId);

    if (!company.active) {
      throw new ConflictException('Esta empresa já se encontra desativada.');
    }

    this.logger.log(`Desativando empresa ID: ${id} (${company.name})`);

    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const updated = await tx.company.update({
        where: { id },
        data: { active: false, deletedAt },
      });

      await tx.auditLog.create({
        data: {
          userId,
          companyId: id,
          action: 'COMPANY_DEACTIVATED',
          module: 'COMPANY',
          entity: 'Company',
          entityId: id,
          payload: this.companyAuditPayload(company, {
            deletedAt: deletedAt.toISOString(),
          }),
          statusCode: 200,
        },
      });

      return updated;
    });
  }
}
