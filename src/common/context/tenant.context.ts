'use strict';

// =============================================================================
// ARQUIVO: src/common/context/tenant.context.ts
// =============================================================================
//
// ⚠️  ESTE ARQUIVO É UM ALIAS DE COMPATIBILIDADE — NÃO ADICIONE LÓGICA AQUI.
//
// O TenantContext canônico está em:
//   src/common/tenant/tenant.context.ts
//
// Este arquivo re-exporta tudo do canônico para evitar quebrar imports
// existentes enquanto a migração é feita progressivamente.
//
// COMO MIGRAR:
// Substitua todos os imports deste caminho pelo canônico:
//
//   ANTES: import { TenantContext } from '../context/tenant.context.js'
//   DEPOIS: import { TenantContext } from '../tenant/tenant.context.js'
//
// Arquivos que ainda importam daqui (migrar um a um):
//   - src/common/middlewares/tenant.middleware.ts
//   - src/common/guards/tenant-context.guard.ts  (já corrigido)
//   - qualquer outro que use '../context/tenant.context'
//
// Após migrar todos os imports, DELETAR este arquivo.
// =============================================================================

export { TenantContext } from '../tenant/tenant.context.js';
export type { TenantStore } from '../tenant/tenant.context.js';
