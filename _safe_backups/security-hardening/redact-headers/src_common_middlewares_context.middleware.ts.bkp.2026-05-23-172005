// src/common/middlewares/context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contextStorage } from '../context/context.storage.js';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Em um cenário real, extraímos do req.user (preenchido pelo Passport/JWT)
    const companyId =
      (req.headers['x-company-id'] as string) || (req.user as any)?.companyId;
    const userId = (req.user as any)?.id;
    const requestId = uuidv4();

    // Adicionamos o requestId no header para rastreabilidade (Tracing)
    res.setHeader('x-request-id', requestId);

    contextStorage.run({ userId, companyId, requestId }, () => next());
  }
}
