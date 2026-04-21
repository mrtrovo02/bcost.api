'use strict';

import {
  Injectable,
  ExecutionContext,
  Logger,
  CallHandler,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { Observable } from 'rxjs';

/**
 * CompanyCacheInterceptor
 * -----------------------------------------------------------------------
 * ESSENCIAL PARA 2026: Implementação de isolamento de cache por Tenant.
 * Diferente dos players legados, aqui cada empresa tem sua própria 'gaveta'
 * de memória, acelerando o Dashboard sem risco de vazamento de dados.
 */
@Injectable()
export class CompanyCacheInterceptor extends CacheInterceptor {
  private readonly logger = new Logger(CompanyCacheInterceptor.name);

  /**
   * trackBy
   * Sobrescreve a lógica de geração de chave para incluir a Identidade da Empresa.
   */
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, params, query } = request;

    // 1. Regra de Negócio: Apenas requisições de leitura (GET) são cacheadas.
    if (method !== 'GET') {
      return undefined;
    }

    // 2. Lógica Multi-tenant (O coração do bCost):
    // Tenta obter o ID da empresa de 3 fontes diferentes para máxima flexibilidade.
    const companyId = params.companyId || user?.companyId || query?.companyId;

    if (!companyId) {
      this.logger.warn(
        `⚠️ Tentativa de cache em rota protegida sem CompanyID: ${url}`,
      );
      return undefined; // Não cacheia se não souber de quem é o dado
    }

    // 3. Geração da Chave Única (Determinística)
    // Formato: company:{uuid}:url:{path}
    const cacheKey = `company:${companyId}:url:${url}`;

    this.logger.debug(`🎯 Cache Hit Check: ${cacheKey}`);

    return cacheKey;
  }
}
