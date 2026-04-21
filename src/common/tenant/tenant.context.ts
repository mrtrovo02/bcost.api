'use strict';

// =============================================================================
// ARQUIVO: src/common/tenant/tenant.context.ts
// =============================================================================
//
// ATENÇÃO: Este é o arquivo CANÔNICO do TenantContext.
// O arquivo src/common/context/tenant.context.ts é uma duplicata com interface
// diferente (TenantContextData vs TenantStore) e deve ser DELETADO.
//
// O PrismaService importa este arquivo via alias '#/common/tenant/tenant.context.js'
// O TenantMiddleware e TenantContextGuard também devem importar daqui.
//
// POR QUE A DUPLICATA CAUSAVA BUG:
// Dois AsyncLocalStorage diferentes = dois stores separados em memória.
// O TenantMiddleware escrevia no store A (common/context/tenant.context.ts)
// enquanto o PrismaService lia do store B (common/tenant/tenant.context.ts).
// Resultado: currentCompanyId sempre undefined → queries sem filtro de tenant.
// =============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Interface do store
// ---------------------------------------------------------------------------

export interface TenantStore {
  /** ID da empresa ativa (companyId) — usado pelo PrismaService para filtrar queries */
  tenantId?: string;
  /** ID do usuário autenticado */
  userId?: string;
  /** Trace ID da requisição — correlação em logs e AuditLog */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// TenantContext
// ---------------------------------------------------------------------------

/**
 * TenantContext: Contexto de execução por request usando AsyncLocalStorage.
 *
 * Propaga companyId, userId e requestId automaticamente através de toda a
 * cadeia de execução assíncrona (Promises, async/await) sem passar por parâmetros.
 *
 * FLUXO:
 * 1. main.ts → onRequest hook cria o store via TenantContext.run()
 * 2. TenantContextGuard → atualiza tenantId e userId com dados do JWT
 * 3. PrismaService → lê tenantId via getTenantId() em cada query
 * 4. AuditLogInterceptor / GlobalExceptionFilter → lê userId e requestId para logs
 *
 * THREAD SAFETY:
 * AsyncLocalStorage é thread-safe e isola o contexto por cadeia de execução.
 * Duas requisições simultâneas nunca compartilham o mesmo store.
 */
export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantStore>();

  /**
   * Inicializa o contexto para uma execução.
   * Deve ser chamado o mais cedo possível na cadeia (onRequest hook do Fastify).
   * Todas as Promises filhas herdam automaticamente o mesmo store.
   */
  static run(store: TenantStore, callback: () => void): void {
    this.storage.run(store, callback);
  }

  /**
   * Retorna o store completo da requisição corrente.
   * undefined quando chamado fora de um contexto inicializado (ex: cron jobs).
   */
  static getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  /**
   * ID da empresa ativa — usado pelo PrismaService para isolar dados por tenant.
   * undefined quando o usuário não tem empresa ou em rotas @Public().
   */
  static getTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  /**
   * ID do usuário autenticado na requisição corrente.
   */
  static getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  /**
   * Trace ID da requisição — correlaciona logs e AuditLog entries.
   */
  static getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /**
   * Retorna tenantId ou lança erro se não estiver definido.
   * Use em métodos que EXIGEM contexto de empresa (ex: relatórios fiscais).
   * Não use em guards ou middlewares — eles podem rodar antes do contexto ser populado.
   */
  static requireTenantId(): string {
    const tenantId = this.getTenantId();
    if (!tenantId) {
      throw new Error(
        '[TenantContext] tenantId não definido para esta requisição. ' +
          'Verifique se o TenantContextGuard está ativo na rota.',
      );
    }
    return tenantId;
  }

  /**
   * Verifica se o contexto foi inicializado para a execução corrente.
   * Útil para guards e interceptors que precisam ser tolerantes a rotas públicas.
   */
  static hasContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Atualiza campos do store existente sem recriar o contexto.
   * Seguro para usar dentro de guards que rodam após o onRequest hook.
   * NÃO cria novo store — apenas modifica o store da execução corrente.
   */
  static patch(partial: Partial<TenantStore>): void {
    const store = this.storage.getStore();
    if (!store) return;
    Object.assign(store, partial);
  }
}
