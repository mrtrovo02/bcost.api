export class AuditLogEvent {
  constructor(
    public readonly action: string,
    public readonly module: string,
    public readonly payload: any,
    public readonly statusCode?: number,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
    public readonly userId?: string,
  ) {}
}
