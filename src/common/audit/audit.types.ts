export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export type AuditJsonObject = { [key: string]: AuditJsonValue };

export interface AuditEventPayload {
  action: string;
  module: string;
  entity?: string | null;
  entityId?: string | null;
  payload?: AuditJsonObject;
  statusCode?: number | null;
  responseTime?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  companyId?: string | null;
  traceId?: string | null;
  createdAt?: string;
}
