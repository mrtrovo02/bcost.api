// src/common/middlewares/context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contextStorage } from '../context/context.storage.js';
import { redactSensitiveHeaders } from '../security/redact-headers.util.js';

type RequestUserContext = {
  id?: string;
  sub?: string;
  companyId?: string | null;
  activeCompanyId?: string | null;
};

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestUser = req.user as RequestUserContext | undefined;
    // Em um cenário real, extraímos do req.user (preenchido pelo Passport/JWT)
    const companyId =
      (redactSensitiveHeaders(req.headers as Record<string, unknown>)[
        'x-company-id'
      ] as string) ||
      requestUser?.activeCompanyId ||
      requestUser?.companyId;
    const userId = requestUser?.id || requestUser?.sub;
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
