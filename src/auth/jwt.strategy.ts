'use strict';

// =============================================================================
// ARQUIVO: src/auth/jwt.strategy.ts
// =============================================================================

import {
  Injectable,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { TokenBlacklistService } from './token-blacklist.service.js';
import type { FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Interfaces exportadas
// Disponíveis para Controllers, Guards e Decorators via import
// ---------------------------------------------------------------------------

/**
 * Payload que chega decodificado do Bearer token.
 * Gerado pelo AuthService.login() e assinado pelo JwtService.
 */
export interface JwtPayload {
  /** ID do usuário (subject padrão JWT) */
  sub: string;
  email: string;
  /**
   * ID da empresa ativa no momento do login.
   * Resolvida pelo AuthService: OWNER > primeira disponível > null.
   */
  companyId: string | null;
  /** Role do usuário na empresa ativa */
  role: string | null;
  /** Identificador unico do token para revogacao imediata via logout */
  jti?: string;
  /** Expiracao do JWT em epoch seconds */
  exp?: number;
}

/**
 * Objeto injetado em req.user após validação bem-sucedida.
 * Disponível em qualquer Controller via @GetUser().
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  /**
   * ID da empresa ativa do usuário.
   * Null quando o usuário não tem nenhuma empresa vinculada.
   * O TenantContextGuard propaga para o PrismaService sem lançar erro.
   */
  companyId: string | null;
  /**
   * Todas as empresas ativas vinculadas ao usuário.
   * Usado por guards multi-tenant para permitir troca segura de contexto.
   */
  companyIds: string[];
  /**
   * Papel do usuário por empresa vinculada.
   * Permite que o request assuma a role correta ao acessar outro tenant válido.
   */
  rolesByCompany: Record<string, string>;
  /**
   * Role do usuário na empresa ativa.
   * Usado pelo RolesGuard para RBAC.
   */
  role: string | null;
  activeCompanyId: string | null;
  companies: Array<{
    id: string;
    name: string;
    cnpj: string;
    role: string;
    taxRegime: string;
  }>;
  jti: string | null;
  exp: number | null;
}

/**
 * Extrai o access token do cookie HttpOnly `bcost_access_token`.
 *
 * FASE 1 (HttpOnly hardening): mecanismo novo, imune a leitura via JS
 * (mitiga XSS). Usado como fallback quando não há header Authorization —
 * ver ordem de extractors no construtor da strategy abaixo.
 */
function extractFromAccessTokenCookie(request: FastifyRequest): string | null {
  const cookieHeader = request?.headers?.cookie;
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('bcost_access_token='));

  if (!match) return null;

  const value = match.slice('bcost_access_token='.length);
  return value ? decodeURIComponent(value) : null;
}

/**
 * JwtStrategy: Componente crítico de segurança do motor bCost.
 *
 * PADRÃO DE PRODUÇÃO 2026:
 * - Resolução explícita de segredos via ConfigService (sem hardcode).
 * - Validação em tempo real contra o banco para revogação imediata de acesso
 *   sem precisar invalidar o token (usuário desativado = 401 imediato).
 * - Injeção de companyId e role no req.user para uso no TenantContextGuard
 *   e RolesGuard sem roundtrips adicionais por request.
 *
 * FIX CRÍTICO aplicado:
 * O validate() original retornava apenas { id, email }, sem companyId.
 * O TenantContextGuard exigia companyId no payload e lançava 401 em toda
 * requisição autenticada. Agora o validate() resolve a empresa ativa do
 * usuário e a inclui no retorno que popula req.user.
 *
 * Estratégia de seleção de empresa ativa:
 * 1. companyId já presente no payload JWT (setado no login) — evita query extra
 * 2. Empresa onde o usuário é OWNER
 * 3. Primeira empresa disponível
 * 4. null (usuário sem empresa — acesso a rotas @Public() apenas)
 *
 * FASE 1 (HttpOnly hardening) aplicada:
 * O extractor de JWT agora aceita o token tanto via header Authorization
 * (compatibilidade com o frontend atual, que ainda lê de localStorage)
 * quanto via cookie HttpOnly bcost_access_token (novo mecanismo, imune a
 * XSS). Quando o frontend migrar para depender só do cookie, o extractor
 * de header pode ser removido (Fase 2).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {
    // Recuperação segura do segredo configurado no ambiente
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error(
        '[bCost-Security] Falha crítica: JWT_SECRET não resolvido no bootstrap da Strategy. ' +
          'Verifique a integridade do arquivo .env ou a ordem de carga do ConfigModule.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractFromAccessTokenCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });

    this.logger.log('🔐 JwtStrategy inicializada com sucesso.');
  }

  /**
   * Executado após decodificação criptográfica bem-sucedida do Bearer token.
   * O objeto retornado é anexado ao req.user e fica disponível em todos os
   * Controllers, Guards e Interceptors da requisição.
   *
   * @param payload Objeto decodificado do JWT (sub, email, companyId, role)
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (await this.tokenBlacklist.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException(
        'Sessão revogada: faça login novamente para continuar.',
      );
    }

    // 1. Verifica existência e status do usuário em tempo real.
    //    Essencial para revogação imediata: mesmo com token válido,
    //    usuário desativado recebe 401 instantaneamente.
    const user = await this.prisma.withRlsUserContext(payload.sub, (tx) =>
      tx.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          active: true,
          // FIX: busca empresas para resolver empresa ativa e validar o companyId do token
          companies: {
            select: {
              companyId: true,
              role: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  cnpj: true,
                  taxRegime: true,
                },
              },
            },
            // Filtra empresas com soft delete aplicado
            where: {
              deletedAt: null,
              company: {
                active: true,
                deletedAt: null,
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    );

    if (!user) {
      throw new UnauthorizedException(
        'Sessão inválida: Usuário inexistente no ecossistema bCost.',
      );
    }

    if (user.active === false) {
      throw new UnauthorizedException(
        'Acesso negado: A conta do usuário está inativa.',
      );
    }

    // 2. Resolve a empresa ativa do usuário.
    //
    //    Prioridade:
    //    a) companyId do payload JWT (setado no login, evita query extra)
    //       — validado contra a lista atual para garantir que ainda existe
    //    b) empresa OWNER do usuário
    //    c) primeira empresa disponível
    //    d) null (sem empresa vinculada)
    let companyId: string | null = null;
    let role: string | null = null;
    const companyIds = user.companies.map((company) => company.companyId);
    const rolesByCompany = Object.fromEntries(
      user.companies.map((company) => [company.companyId, company.role]),
    );
    const companies = user.companies
      .filter((entry) => entry.company)
      .map((entry) => ({
        id: entry.company.id,
        name: entry.company.name,
        cnpj: entry.company.cnpj,
        role: entry.role,
        taxRegime: entry.company.taxRegime,
      }));

    if (payload.companyId) {
      // Valida se o companyId do token ainda é válido (empresa não removida/deletada)
      const entry = user.companies.find(
        (c) => c.companyId === payload.companyId,
      );
      if (entry) {
        companyId = entry.companyId;
        role = entry.role;
      } else {
        // companyId do token não é mais válido — faz fallback gracioso
        this.logger.warn(
          `[JwtStrategy] companyId ${payload.companyId} do token não encontrado para usuário ${user.id}. Aplicando fallback.`,
        );
      }
    }

    // Fallback: resolve a melhor empresa disponível
    if (!companyId && user.companies.length > 0) {
      const ownerEntry = user.companies.find((c) => c.role === 'OWNER');
      const activeEntry = ownerEntry ?? user.companies[0];
      companyId = activeEntry.companyId;
      role = activeEntry.role;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      companyId,
      activeCompanyId: companyId,
      companyIds,
      rolesByCompany,
      role,
      companies,
      jti: payload.jti ?? null,
      exp: payload.exp ?? null,
    };
  }
}
