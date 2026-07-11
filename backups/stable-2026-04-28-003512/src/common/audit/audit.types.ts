export interface AuditEventPayload {
  action: string;
  module: string;
  entity?: string | null;
  entityId?: string | null;
  payload?: Record<string, any>;
  statusCode?: number | null;
  responseTime?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  companyId?: string | null;
  traceId?: string | null;
  createdAt?: string;
}
