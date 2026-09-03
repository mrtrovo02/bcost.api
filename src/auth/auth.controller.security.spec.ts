import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { THROTTLE_ENDPOINT_LIMIT } from '../common/decorators/throttle-endpoint.decorator.js';
import { AuthController } from './auth.controller.js';

interface EndpointThrottleMetadata {
  limit: number;
  ttl: number;
}

describe('AuthController security metadata', () => {
  it('deve manter setup-admin publico apenas com throttle agressivo', () => {
    const setupAdminHandler = AuthController.prototype.setupAdmin;
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, setupAdminHandler);
    const throttle = Reflect.getMetadata(
      THROTTLE_ENDPOINT_LIMIT,
      setupAdminHandler,
    ) as EndpointThrottleMetadata | undefined;

    expect(isPublic).toBe(true);
    expect(throttle).toEqual({
      limit: 1,
      ttl: 3600 * 1000,
    });
  });
});
