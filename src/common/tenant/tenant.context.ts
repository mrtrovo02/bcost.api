'use strict';

// =============================================================================
// ARQUIVO: src/common/tenant/tenant.context.ts
// =============================================================================
//
// ATENÇÃO: Este é o arquivo CANÔNICO do TenantContext.
// O arquivo src/common/context/tenant.context.ts é uma duplicata com interface
// diferente (TenantContextData vs TenantStore) e deve ser DELETADO.
//
// O PrismaService importa este arquivo via alias '#common/tenant/tenant.context.js'
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
// Interface do Store
// ---------------------------------------------------------------------------

export interface TenantStore {
  /** ID da empresa ativa (companyId) — usado pelo PrismaService para filtrar queries */
  tenantId?: string;
  /** ID do usuário autenticado */
  userId?: string;
  /** Trace ID da requisição — correlação em logs e AuditLog */
  requestId?: string;
  /** Roles / Permissões do usuário no contexto atual */
  roles?: string[];
  /** Indica se o usuário é Administrador Global / System Admin */
  isSystemAdmin?: boolean;
  /** Permite adição estendida de propriedades arbitrárias de contexto */
  [key: string]: unknown;
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
 * 1. TenantMiddleware → cria o store inicial via TenantContext.run()
 * 2. TenantContextGuard → atualiza tenantId, userId, roles via TenantContext.patch()
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
   * Inicializa o contexto para uma execução assíncrona.
   * Deve ser chamado o mais cedo possível na cadeia (ex: TenantMiddleware).
   * Preserva e retorna o retorno do callback (ex: valor de retorno ou Promise).
   */
  static run<T>(store: TenantStore, callback: () => T): T {
    return this.storage.run(store, callback);
  }

  /**
   * Retorna o store completo da requisição corrente.
   * Retorna `undefined` quando chamado fora de um contexto inicializado (ex: cron jobs).
   */
  static getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  /**
   * ID da empresa ativa — usado pelo PrismaService para isolar dados por tenant.
   * Retorna `undefined` quando o usuário não tem empresa ou em rotas públicas.
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
   * Roles / Permissões atribuídas ao usuário autenticado.
   */
  static getRoles(): string[] {
    return this.storage.getStore()?.roles ?? [];
  }

  /**
   * Verifica se o usuário ativo é administrador global do sistema.
   */
  static isSystemAdmin(): boolean {
    return Boolean(this.storage.getStore()?.isSystemAdmin);
  }

  /**
   * Retorna tenantId ou lança erro se não estiver definido.
   * Use em métodos de serviços que EXIGEM contexto de empresa.
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
   * Retorna userId ou lança erro se não estiver definido.
   * Use em auditoria ou operações restritas a usuários autenticados.
   */
  static requireUserId(): string {
    const userId = this.getUserId();
    if (!userId) {
      throw new Error(
        '[TenantContext] userId não localizado no contexto. ' +
          'Verifique se a rota requer autenticação JWT.',
      );
    }
    return userId;
  }

  /**
   * Verifica se o contexto foi inicializado para a execução corrente.
   */
  static hasContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Atualiza campos do store existente em tempo de execução sem recriar o contexto.
   * Seguro para usar dentro de guards/interceptors após o middleware ter iniciado o store.
   */
  static patch(partial: Partial<TenantStore>): void {
    const store = this.storage.getStore();
    if (!store) return;
    Object.assign(store, partial);
  }
}
