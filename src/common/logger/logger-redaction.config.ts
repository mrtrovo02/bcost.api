export const LOGGER_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.headers["x-access-token"]',
  'req.headers["proxy-authorization"]',
  'req.raw.headers.authorization',
  'req.raw.headers.cookie',
  'req.raw.headers["set-cookie"]',
  'request.headers.authorization',
  'request.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
] as const;

export const LOGGER_REDACTION_CENSOR = '[REDACTED]';
