import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { TenantContext } from '../context/tenant.context.js';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const user = req.user as any;

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
