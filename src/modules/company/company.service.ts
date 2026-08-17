import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js'; // Você precisará criar este DTO
import { CompanyRole, TaxRegime } from '@prisma/client';
import {
  isValidCnpj,
  normalizeCnpj,
} from '../../common/validators/cnpj.util.js';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
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
        users: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Busca uma empresa específica por ID.
   */
  async findOne(id: string, userId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
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
    await this.findOne(id, userId); // Valida se existe e pertence ao usuário
    await this.assertCanManageCompany(id, userId);

    try {
      this.logger.log(`Atualizando dados fiscais da empresa ID: ${id}`);
      return await this.prisma.company.update({
        where: { id },
        data: dto,
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

    return this.prisma.company.update({
      where: { id },
      data: { active: false, deletedAt: new Date() },
    });
  }
}
