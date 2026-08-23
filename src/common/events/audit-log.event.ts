import { AuditJsonObject } from '../audit/audit.types.js';

export class AuditLogEvent {
  constructor(
    public readonly action: string,
    public readonly module: string,
    public readonly payload: AuditJsonObject,
    public readonly statusCode?: number,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
    public readonly userId?: string,
  ) {}
}
