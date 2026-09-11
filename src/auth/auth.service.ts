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
import { CompanyRole, Prisma, TaxRegime } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { TwoFAService } from './2fa.service.js';

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
  refresh_token?: string;
  companyId: string | null;
  activeCompanyId: string | null;
  companies: Array<{
    id: string;
    name: string;
    cnpj: string;
    role: CompanyRole;
    taxRegime: string;
  }>;
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

export interface MfaRequiredResponse {
  access_token: null;
  mfaRequired: true;
  mfaSession: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export type AuthLoginResponse = LoginResponse | MfaRequiredResponse;

export interface SwitchCompanyResponse {
  access_token: string;
  activeCompanyId: string | null;
  companyId: string | null;
  companies: LoginResponse['companies'];
  user: LoginResponse['user'];
}

export interface AuthProfileResponse {
  id: string;
  email: string;
  name: string;
  role: CompanyRole | null;
  companyId: string | null;
  activeCompanyId: string | null;
  companies: LoginResponse['companies'];
  user: LoginResponse['user'] & { role: CompanyRole | null };
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
  jti: string;
}

interface MfaSessionPayload {
  sub: string;
  email: string;
  type: 'mfa_session';
}

interface LoginCompanyMembership {
  companyId: string;
  role: CompanyRole;
  company: {
    id: string;
    name: string;
    cnpj: string;
    active?: boolean;
    taxRegime: TaxRegime;
  };
}

interface LoginUserRecord {
  id: string;
  email: string;
  password: string;
  name: string;
  active: boolean;
  twoFactor: boolean;
  twoFactorPending: boolean;
  companies: LoginCompanyMembership[];
}

type AuthPrismaReader = Pick<Prisma.TransactionClient, 'user'> | PrismaService;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly twoFaService: TwoFAService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. SETUP DE ADMIN
  // Idempotente — seguro para executar múltiplas vezes.
  // ---------------------------------------------------------------------------

  async setupAdmin() {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const allowSetup = this.config.get<string>('ALLOW_SETUP_ADMIN') === 'true';

    if (isProd) {
      throw new ForbiddenException(
        'Admin setup is disabled in production environment. Use a controlled migration, secret manager or one-time operational runbook.',
      );
    }

    if (!allowSetup) {
      throw new ForbiddenException(
        'Operation not allowed. ALLOW_SETUP_ADMIN is not enabled.',
      );
    }

    const setupPassword = this.config.get<string>('SETUP_ADMIN_PASSWORD')?.trim();

    if (!setupPassword || setupPassword.length < 16) {
      throw new ForbiddenException(
        'SETUP_ADMIN_PASSWORD must be explicitly configured with at least 16 characters.',
      );
    }

    const hashedPassword = await bcrypt.hash(setupPassword, 10);
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
      credentials: { email: user.email },
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

  private sessionUserInclude() {
    return {
      companies: {
        where: {
          deletedAt: null,
          company: { deletedAt: null, active: true },
        },
        include: { company: true },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  private async findSessionUser(
    reader: AuthPrismaReader,
    userId: string,
  ): Promise<LoginUserRecord | null> {
    return reader.user.findUnique({
      where: { id: userId },
      include: this.sessionUserInclude(),
    }) as Promise<LoginUserRecord | null>;
  }

  private async loadSessionUser(userId: string): Promise<LoginUserRecord | null> {
    return this.prisma.withRlsUserContext(userId, (tx) =>
      this.findSessionUser(tx, userId),
    );
  }

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
  async login(email: string, password: string): Promise<AuthLoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
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

    if (user.twoFactor && !user.twoFactorPending) {
      const mfaPayload: MfaSessionPayload = {
        sub: user.id,
        email: user.email,
        type: 'mfa_session',
      };

      const mfaSession = this.jwtService.sign(mfaPayload, { expiresIn: '5m' });

      this.logger.log(`🔐 MFA requerido para: ${user.email}`);

      return {
        access_token: null,
        mfaRequired: true,
        mfaSession,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    }

    const sessionUser = await this.loadSessionUser(user.id);
    if (!sessionUser || !sessionUser.active) {
      throw new UnauthorizedException({
        message: 'Sessão inválida ou usuário inativo.',
        code: 'AUTH-SESSION-USER-INVALID',
      });
    }

    return this.generateLoginResponse(sessionUser);
  }

  async verifyMFA(mfaSession: string, otpCode: string): Promise<LoginResponse> {
    let mfaPayload: MfaSessionPayload;

    try {
      mfaPayload = this.jwtService.verify<MfaSessionPayload>(mfaSession);
    } catch {
      throw new UnauthorizedException({
        message: 'Sessão MFA inválida ou expirada.',
        code: 'AUTH-MFA-SESSION-INVALID',
      });
    }

    if (mfaPayload.type !== 'mfa_session') {
      throw new UnauthorizedException({
        message: 'Sessão MFA inválida.',
        code: 'AUTH-MFA-SESSION-TYPE-INVALID',
      });
    }

    const user = await this.loadSessionUser(mfaPayload.sub);

    if (!user || !user.active || !user.twoFactor || user.twoFactorPending) {
      throw new UnauthorizedException({
        message: 'MFA não habilitado para a identidade informada.',
        code: 'AUTH-MFA-NOT-ENABLED',
      });
    }

    const verification = await this.twoFaService.verifySecondFactor(
      user.id,
      otpCode,
    );

    if (!verification.valid) {
      throw new UnauthorizedException({
        message: 'Código MFA inválido.',
        code: 'AUTH-MFA-CODE-INVALID',
      });
    }

    return this.generateLoginResponse(user);
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

  async getProfile(
    userId: string,
    preferredCompanyId?: string | null,
  ): Promise<AuthProfileResponse> {
    const user = await this.loadSessionUser(userId);

    if (!user || !user.active) {
      throw new UnauthorizedException({
        message: 'Sessão inválida ou usuário inativo.',
        code: 'AUTH-PROFILE-UNAUTHORIZED',
      });
    }

    const preferredEntry = preferredCompanyId
      ? user.companies.find((cu) => cu.companyId === preferredCompanyId)
      : null;
    const ownerEntry = user.companies.find(
      (cu) => cu.role === CompanyRole.OWNER,
    );
    const activeEntry = preferredEntry ?? ownerEntry ?? user.companies[0] ?? null;
    const activeCompanyId = activeEntry?.companyId ?? null;
    const activeRole = activeEntry?.role ?? null;
    const mappedCompanies = user.companies.map((cu) => ({
      id: cu.company.id,
      name: cu.company.name,
      cnpj: cu.company.cnpj,
      role: cu.role,
      taxRegime: cu.company.taxRegime,
    }));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: activeRole,
      companyId: activeCompanyId,
      activeCompanyId,
      companies: mappedCompanies,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: activeRole,
        activeCompanyId,
        companies: mappedCompanies,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 5. TROCA DE EMPRESA ATIVA
  // ---------------------------------------------------------------------------

  async switchCompany(
    userId: string,
    companyId: string,
  ): Promise<SwitchCompanyResponse> {
    const user = await this.loadSessionUser(userId);

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inativo ou inexistente.');
    }

    const membership = user.companies.find(
      (entry) => entry.companyId === companyId,
    );

    if (!membership || !membership.company || !membership.company.active) {
      throw new UnauthorizedException('Empresa inválida ou sem vínculo ativo.');
    }

    return this.generateLoginResponse(user, membership.companyId);
  }

  async refresh(refreshToken: string): Promise<LoginResponse> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: { id: true, active: true },
        },
      },
    });

    if (!session || session.expiresAt <= new Date() || !session.user.active) {
      throw new UnauthorizedException({
        message: 'Sessão de renovação inválida ou expirada.',
        code: 'AUTH-REFRESH-INVALID',
      });
    }

    if (session.revokedAt) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        message: 'Sessão de renovação reutilizada. Faça login novamente.',
        code: 'AUTH-REFRESH-REUSED',
      });
    }

    const revoked = await this.prisma.userSession.updateMany({
      where: { id: session.id, token: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        message: 'Sessão de renovação reutilizada. Faça login novamente.',
        code: 'AUTH-REFRESH-REUSED',
      });
    }

    const sessionUser = await this.loadSessionUser(session.userId);
    if (!sessionUser || !sessionUser.active) {
      throw new UnauthorizedException({
        message: 'Sessão de renovação inválida ou usuário inativo.',
        code: 'AUTH-REFRESH-USER-INVALID',
      });
    }

    return this.generateLoginResponse(sessionUser);
  }

  async logoutAll(userId: string): Promise<{ revokedSessions: number }> {
    const result = await this.prisma.userSession.deleteMany({ where: { userId } });
    return { revokedSessions: result.count };
  }

  private async generateLoginResponse(
    user: LoginUserRecord,
    preferredCompanyId?: string | null,
  ): Promise<LoginResponse> {
    const preferredEntry = preferredCompanyId
      ? user.companies.find((cu) => cu.companyId === preferredCompanyId)
      : null;
    const ownerEntry = user.companies.find(
      (cu) => cu.role === CompanyRole.OWNER,
    );
    const activeEntry = preferredEntry ?? ownerEntry ?? user.companies[0] ?? null;

    const activeCompanyId = activeEntry?.companyId ?? null;
    const activeRole = activeEntry?.role ?? null;

    const jwtPayload: JwtSignPayload = {
      sub: user.id,
      email: user.email,
      companyId: activeCompanyId,
      role: activeRole,
      jti: randomUUID(),
    };

    const access_token = this.jwtService.sign(jwtPayload);

    const mappedCompanies = user.companies.map((cu) => ({
      id: cu.company.id,
      name: cu.company.name,
      cnpj: cu.company.cnpj,
      role: cu.role,
      taxRegime: cu.company.taxRegime,
    }));

    this.logger.log(
      `🔓 Acesso autorizado: ${user.name} [empresas: ${mappedCompanies.length}, ativa: ${activeCompanyId ?? 'nenhuma'}]`,
    );

    const refresh_token = await this.createRefreshToken(user.id);

    return {
      access_token,
      refresh_token,
      companyId: activeCompanyId,
      activeCompanyId,
      companies: mappedCompanies,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        activeCompanyId,
        companies: mappedCompanies,
      },
    };
  }

  private async createRefreshToken(userId: string): Promise<string | undefined> {
    const userSession = (this.prisma as unknown as {
      userSession?: { create: (args: unknown) => Promise<unknown> };
    }).userSession;

    if (!userSession) return undefined;

    const refreshToken = randomBytes(48).toString('base64url');
    await userSession.create({
      data: {
        userId,
        token: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return refreshToken;
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
