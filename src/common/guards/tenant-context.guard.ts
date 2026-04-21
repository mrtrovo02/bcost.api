'use strict';

// =============================================================================
// ARQUIVO: src/common/guards/tenant-context.guard.ts
// =============================================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { TenantContext } from '../tenant/tenant.context.js';
import { contextStorage } from '../context/context.storage.js';
import { randomUUID } from 'crypto';

/**
 * TenantContextGuard — Isolamento Multi-tenant bCost
 *
 * RESPONSABILIDADES:
 * 1. Lê companyId e userId do req.user (já populado pelo JwtAuthGuard via JwtStrategy)
 * 2. Injeta no TenantContext (AsyncLocalStorage) para que o PrismaService aplique
 *    filtros de tenant automaticamente em todas as queries
 * 3. Atualiza o contextStorage para rastreabilidade em logs e AuditLog
 *
 * FIX CRÍTICO em relação ao original:
 *
 * O guard original tentava verificar o JWT manualmente com `jwtService.verifyAsync()`
 * e exigia `companyId` no token. Isso causava dois problemas:
 *
 * 1. DUPLICAÇÃO: O JwtAuthGuard (que executa antes) já valida e decodifica o token.
 *    Verificar de novo aqui desperdiça CPU e cria dois pontos de falha.
 *
 * 2. 401 EM CASCATA: O JWT original não incluía `companyId` no payload, então
 *    `payload.companyId` era sempre undefined e o guard rejeitava tudo.
 *    Agora o AuthService.login() inclui companyId no payload e o JwtStrategy
 *    popula req.user com { id, email, companyId, role } — este guard apenas lê.
 *
 * 3. DEPENDÊNCIA CIRCULAR: injetar JwtService + PrismaService aqui criava ciclos
 *    com AuthModule e DatabaseModule que dificultavam o bootstrap.
 *
 * ORDEM DOS GUARDS no AppModule (Top-Down):
 * 1. JwtAuthGuard      → valida Bearer token, popula req.user
 * 2. TenantContextGuard → propaga req.user.companyId para AsyncLocalStorage
 * 3. ThrottlerGuard    → rate limiting
 *
 * ROTAS @Public():
 * Bypass completo — nenhum contexto de tenant é injetado.
 * O PrismaService lida com tenantId === undefined retornando queries sem filtro.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger('TenantContextGuard');

  // FIX: removidas injeções de JwtService e PrismaService
  // O guard não precisa mais verificar JWT nem chamar setCompanyScope()
  // (setCompanyScope() é @deprecated — o TenantContext via AsyncLocalStorage é o padrão)
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Rotas marcadas com @Public() ignoram o contexto de tenant
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // 2. req.user foi populado pelo JwtAuthGuard + JwtStrategy com { id, email, companyId, role }
    //    Se não há user, o JwtAuthGuard já deveria ter lançado 401.
    const user = request.user as
      | {
          id?: string;
          companyId?: string | null;
          role?: string | null;
        }
      | undefined;

    if (!user?.id) {
      // Não lança aqui — deixa o JwtAuthGuard ser o guardião da autenticação.
      // Este guard é responsável apenas por propagar o contexto.
      return true;
    }

    const userId = user.id;
    const companyId = user.companyId ?? undefined;
    const requestId =
      (request.headers?.['x-bcost-trace-id'] as string) ?? randomUUID();

    // 3. Propaga para o TenantContext (AsyncLocalStorage do PrismaService)
    //    O store já existe se o onRequest hook do Fastify (main.ts) rodou antes.
    //    Atualizamos os campos sem recriar o store para não quebrar o contexto existente.
    const tenantStore = TenantContext.getStore();

    if (tenantStore) {
      tenantStore.tenantId = companyId;
      tenantStore.userId = userId;
      tenantStore.requestId = tenantStore.requestId ?? requestId;
    } else {
      // Fallback: store não foi criado pelo hook do Fastify.
      // Cenário: testes unitários, requisições WebSocket ou execução fora do ciclo HTTP normal.
      this.logger.warn(
        `[TenantContext] AsyncLocalStorage store ausente para request ${requestId}. ` +
          'Verifique se o onRequest hook está registrado em main.ts.',
      );
      // Run síncrono — o contexto não se propaga para Promises filhas neste caminho.
      // Para garantir propagação total, o hook do Fastify deve sempre ser a fonte primária.
      TenantContext.run({ tenantId: companyId, userId, requestId }, () => {});
    }

    // 4. Propaga para o contextStorage (usado pelo GlobalExceptionFilter e AuditLogInterceptor)
    const appStore = contextStorage.getStore();
    if (appStore) {
      appStore.companyId = companyId;
      appStore.userId = userId;
    }

    // 5. Log de diagnóstico (debug apenas — não polui produção)
    if (companyId) {
      this.logger.debug(
        `[Tenant] userId=${userId} | companyId=${companyId} | requestId=${requestId}`,
      );
    } else {
      this.logger.debug(
        `[Tenant] userId=${userId} sem empresa ativa — queries sem filtro de tenant.`,
      );
    }

    return true;
  }
}
