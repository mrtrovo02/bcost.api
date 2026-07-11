'use strict';

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service.js';
import { contextStorage } from '../context/context.storage.js';

interface AuditPayload {
  action?: string;
  module?: string;
  payload?: any;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogListener {
  private readonly logger = new Logger(AuditLogListener.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listener assíncrono de auditoria
   * Nunca deve quebrar a aplicação principal
   */
  @OnEvent('audit.log', { async: true })
  async handleAuditLogEvent(payload: AuditPayload): Promise<void> {
    try {
      const store = contextStorage.getStore();

      // 🔥 Garantia de payload resiliente (NUNCA undefined)
      const data = {
        action: payload?.action ?? 'UNKNOWN_ACTION',
        module: payload?.module ?? 'HTTP',
        payload: this.safeJson(payload?.payload),
        statusCode: payload?.statusCode ?? 200,
        ipAddress: payload?.ipAddress ?? '0.0.0.0',
        userAgent: payload?.userAgent ?? 'unknown',
        traceId: store?.requestId ?? null,
        createdAt: new Date(),
      };

      await this.prisma.auditLog.create({ data });

      // Log opcional (somente debug)
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(
          `[AUDIT] ${data.action} - ${data.module} (${data.statusCode})`,
        );
      }
    } catch (error) {
      /**
       * 🔴 REGRA DE OURO:
       * Auditoria NUNCA pode derrubar a API
       */
      this.logger.error(
        '❌ Falha ao gravar log de auditoria em background:',
        error?.stack || error?.message,
      );
    }
  }

  /**
   * 🔐 Evita crash com JSON inválido ou circular
   */
  private safeJson(payload: any): any {
    try {
      if (!payload) return {};

      // Evita objetos gigantes (proteção básica)
      const stringified = JSON.stringify(payload);

      // Limite de ~10KB
      if (stringified.length > 10_000) {
        return { truncated: true };
      }

      return JSON.parse(stringified);
    } catch {
      return { invalid: true };
    }
  }
}
