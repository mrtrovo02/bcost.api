// src/common/middlewares/context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contextStorage } from '../context/context.storage.js';
import {
  redactDeep,
  redactSensitiveHeaders,
} from '../security/redact-headers.util.js';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Em um cenário real, extraímos do req.user (preenchido pelo Passport/JWT)
    const companyId =
      (redactSensitiveHeaders(req.headers as Record<string, unknown>)[
        'x-company-id'
      ] as string) || (req.user as any)?.companyId;
    const userId = (req.user as any)?.id;
    const requestId = uuidv4();

    // Adicionamos o requestId no header para rastreabilidade (Tracing)
    res.setHeader('x-request-id', requestId);

    contextStorage.run(
      {
        userId,
        companyId,
        requestId,
        traceId: requestId,
        startedAt: Date.now(),
      },
      () => next(),
    );
  }
}
