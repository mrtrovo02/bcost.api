import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { TenantContext } from '../tenant/tenant.context.js';

/**
 * ATENÇÃO: middlewares do Nest rodam ANTES dos guards (incluindo
 * JwtAuthGuard). Nesse ponto req.user AINDA NÃO EXISTE. Este middleware
 * portanto nunca consegue popular tenantId/userId de verdade — ele existe
 * apenas para não quebrar caso algo dependa dele, mas a população real
 * do TenantContext acontece no TenantContextGuard (pós-autenticação).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const user = req.user as { companyId?: string; id?: string } | undefined;

    if (!user?.companyId || !user?.id) {
      return next();
    }

    const requestId = randomUUID();
    TenantContext.run(
      {
        tenantId: user.companyId,
        userId: user.id,
        requestId,
      },
      () => next(),
    );
  }
}
