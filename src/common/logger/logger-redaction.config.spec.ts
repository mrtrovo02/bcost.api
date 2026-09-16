import {
  LOGGER_REDACTION_CENSOR,
  LOGGER_REDACTION_PATHS,
} from './logger-redaction.config.js';

describe('logger redaction config', () => {
  it('redacts authorization and cookie headers in every HTTP logger path', () => {
    expect(LOGGER_REDACTION_CENSOR).toBe('[REDACTED]');
    expect(LOGGER_REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.raw.headers.authorization',
        'request.headers.authorization',
        'headers.authorization',
        'headers.cookie',
      ]),
    );
  });
});
