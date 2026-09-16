'use strict';

import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

interface CacheableCompanyRequestUser {
  companyId?: string | null;
  activeCompanyId?: string | null;
}

interface CacheableCompanyRequest {
  method?: string;
  url?: string;
  user?: CacheableCompanyRequestUser;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  companyId?: string | null;
}

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
    const request = context.switchToHttp().getRequest<CacheableCompanyRequest>();
    const { method, url, user, params, query } = request;

    // 1. Regra de Negócio: Apenas requisições de leitura (GET) são cacheadas.
    if (method !== 'GET') {
      return undefined;
    }

    // 2. Lógica Multi-tenant (O coração do bCost):
    // Tenta obter o ID da empresa de 3 fontes diferentes para máxima flexibilidade.
    const companyId =
      this.toCompanyId(request.companyId) ||
      this.toCompanyId(params?.companyId) ||
      this.toCompanyId(query?.company_id) ||
      this.toCompanyId(query?.companyId) ||
      this.toCompanyId(this.getHeader(request.headers, 'x-company-id')) ||
      this.toCompanyId(user?.activeCompanyId) ||
      this.toCompanyId(user?.companyId);

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

  private getHeader(
    headers: Record<string, unknown> | undefined,
    name: string,
  ): unknown {
    if (!headers) return null;

    const normalizedName = name.toLowerCase();
    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === normalizedName,
    );

    return entry?.[1];
  }

  private toCompanyId(value: unknown): string | null {
    const resolved = Array.isArray(value) ? value[0] : value;

    if (typeof resolved !== 'string') return null;

    const normalized = resolved.trim();
    return normalized.length ? normalized : null;
  }
}
