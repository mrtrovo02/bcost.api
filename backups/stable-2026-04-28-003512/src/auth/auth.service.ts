'use strict';

// =============================================================================
// ARQUIVO: src/auth/auth.service.ts
// =============================================================================

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { CompanyRole, TaxRegime } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Interfaces de contrato
// ---------------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    name: string;
    /** Empresa ativa resolvida no login (OWNER ou primeira disponível) */
    activeCompanyId: string | null;
    companies: Array<{
      id: string;
      name: string;
      cnpj: string;
      role: CompanyRole;
      taxRegime: string;
    }>;
  };
}

export interface SwitchCompanyResponse {
  access_token: string;
  activeCompanyId: string;
}

/**
 * Payload que será assinado dentro do JWT.
 *
 * FIX CRÍTICO: companyId e role incluídos.
 * Sem esses campos, o TenantContextGuard lança 401 em toda requisição
 * autenticada pois não consegue resolver a empresa do usuário a partir
 * do token — obrigando uma query extra por request.
 */
interface JwtSignPayload {
  sub: string;
  email: string;
  companyId: string | null;
  role: CompanyRole | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. SETUP DE ADMIN
  // Idempotente — seguro para executar múltiplas vezes.
  // ---------------------------------------------------------------------------

  async setupAdmin() {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const allowSetup = this.config.get<string>('ALLOW_SETUP_ADMIN') === 'true';

    if (isProd && !allowSetup) {
      throw new ForbiddenException(
        'Operação não permitida em produção. Defina ALLOW_SETUP_ADMIN=true para liberar.',
      );
    }

    const defaultPass =
      this.config.get<string>('SETUP_ADMIN_PASSWORD') || 'admin_bcost_2026';
    const hashedPassword = await bcrypt.hash(defaultPass, 10);
    const adminEmail = 'contato@bcost.com.br';

    // Garante a existência do usuário Admin
    const user = await this.prisma.user.upsert({
      where: { email: adminEmail },
      update: { password: hashedPassword, active: true },
      create: {
        email: adminEmail,
        name: 'Vinícius Rafael',
        password: hashedPassword,
        active: true,
      },
    });

    // Garante uma empresa de teste respeitando o Schema
    const defaultCompany = await this.prisma.company.upsert({
      where: { cnpj: '00000000000191' },
      update: {},
      create: {
        name: 'bCost Enterprise Solutions',
        cnpj: '00000000000191',
        active: true,
        taxRegime: TaxRegime.SIMPLES_NACIONAL,
        anexo: 3,
        planLevel: 'ENTERPRISE',
      },
    });

    // Vincula o usuário à empresa como OWNER
    await this.prisma.companyUser.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: defaultCompany.id,
        },
      },
      update: { role: CompanyRole.OWNER },
      create: {
        userId: user.id,
        companyId: defaultCompany.id,
        role: CompanyRole.OWNER,
      },
    });

    this.logger.log(
      `⚠️ Setup Admin: ${user.email} configurado como OWNER da empresa ${defaultCompany.name}.`,
    );

    return {
      message: '✅ Usuário Admin e Empresa inicial configurados!',
      credentials: { email: user.email, password: defaultPass },
      user: { id: user.id, name: user.name },
      company: { id: defaultCompany.id, name: defaultCompany.name },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. REGISTRO DE USUÁRIOS
  // ---------------------------------------------------------------------------

  async register(data: RegisterInput): Promise<RegisterResponse> {
    const exists = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (exists) {
      throw new ConflictException({
        message: 'Identidade já registrada no motor bCost.',
        code: 'AUTH-EMAIL-DUPLICATED',
      });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          password: hashedPassword,
          name: data.name,
          active: true,
        },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      };
    } catch (error: unknown) {
      // FIX: error: any → error: unknown com narrowing correto
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`🔴 [Auth Register Fail]: ${message}`);
      throw new InternalServerErrorException({
        message: 'Falha crítica na criação de identidade.',
        code: 'AUTH-REGISTER-FAILED',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. LOGIN COM RESOLUÇÃO DE MULTI-TENANCY
  // ---------------------------------------------------------------------------

  /**
   * FIX CRÍTICO: O JWT agora inclui companyId e role no payload.
   *
   * O TenantContextGuard lê esses campos do req.user (populado pelo JwtStrategy)
   * para injetar o contexto de tenant no PrismaService sem queries adicionais.
   *
   * Estratégia de empresa ativa:
   * 1. Empresa onde o usuário é OWNER
   * 2. Primeira empresa da lista (fallback)
   * 3. null (usuário sem empresa — acesso limitado a rotas @Public)
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        companies: {
          // FIX: filtra empresas com soft delete aplicado
          where: { deletedAt: null },
          include: { company: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Validação de existência e status
    if (!user || !user.active) {
      this.logger.warn(`🛑 Bloqueio de acesso: ${email}`);
      throw new UnauthorizedException({
        message: 'Credenciais inválidas ou conta inativa.',
        code: 'AUTH-UNAUTHORIZED',
      });
    }

    // Validação BCRYPT
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      this.logger.warn(`🔑 Senha incorreta detectada para: ${email}`);
      throw new UnauthorizedException({
        message: 'Credenciais inválidas.',
        code: 'AUTH-INVALID-CREDENTIALS',
      });
    }

    // Resolve empresa ativa: OWNER > primeira disponível > null
    const ownerEntry = user.companies.find(
      (cu) => cu.role === CompanyRole.OWNER,
    );
    const activeEntry = ownerEntry ?? user.companies[0] ?? null;

    const activeCompanyId = activeEntry?.companyId ?? null;
    const activeRole = activeEntry?.role ?? null;

    // FIX: payload JWT agora inclui companyId e role
    const jwtPayload: JwtSignPayload = {
      sub: user.id,
      email: user.email,
      companyId: activeCompanyId,
      role: activeRole,
    };

    const access_token = this.jwtService.sign(jwtPayload);

    // Mapeamento seguro das empresas para o response
    const mappedCompanies = user.companies
      .filter((cu) => cu.company)
      .map((cu) => ({
        id: cu.company.id,
        name: cu.company.name,
        cnpj: cu.company.cnpj,
        role: cu.role,
        taxRegime: cu.company.taxRegime,
      }));

    this.logger.log(
      `🔓 Acesso autorizado: ${user.name} [empresas: ${mappedCompanies.length}, ativa: ${activeCompanyId ?? 'nenhuma'}]`,
    );

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        activeCompanyId,
        companies: mappedCompanies,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 4. VALIDAÇÃO DE USUÁRIO (usado pelo JwtStrategy e outros guards)
  // ---------------------------------------------------------------------------

  async validateUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, active: true },
    });
  }

  // ---------------------------------------------------------------------------
  // 5. TROCA DE EMPRESA ATIVA
  // ---------------------------------------------------------------------------

  async switchCompany(
    userId: string,
    companyId: string,
  ): Promise<SwitchCompanyResponse> {
    const [user, membership] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, active: true },
      }),
      this.prisma.companyUser.findFirst({
        where: { userId, companyId, deletedAt: null },
        select: {
          companyId: true,
          role: true,
          company: { select: { id: true, active: true } },
        },
      }),
    ]);

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inativo ou inexistente.');
    }

    if (!membership || !membership.company || !membership.company.active) {
      throw new UnauthorizedException('Empresa inválida ou sem vínculo ativo.');
    }

    const payload: JwtSignPayload = {
      sub: user.id,
      email: user.email,
      companyId: membership.companyId,
      role: membership.role,
    };

    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      activeCompanyId: membership.companyId,
    };
  }
}
