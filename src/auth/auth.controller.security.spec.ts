import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { THROTTLE_ENDPOINT_LIMIT } from '../common/decorators/throttle-endpoint.decorator.js';
import { AuthController } from './auth.controller.js';

interface EndpointThrottleMetadata {
  limit: number;
  ttl: number;
}

type CookieSerializerHost = {
  serializeAccessTokenCookie(value: string): string;
  clearAccessTokenCookie(): string;
  clearSharedAccessTokenCookie(): string;
};

describe('AuthController security metadata', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

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

  it('emite access token HttpOnly com dominio compartilhado em producao', () => {
    process.env.NODE_ENV = 'production';
    const controller = Object.create(AuthController.prototype) as CookieSerializerHost;

    const cookie = controller.serializeAccessTokenCookie('access-token');

    expect(cookie).toContain('bcost_access_token=access-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Domain=.bcost.com.br');
    expect(cookie).toContain('Path=/');
  });

  it('limpa access token host-only legado e cookie compartilhado em producao', () => {
    process.env.NODE_ENV = 'production';
    const controller = Object.create(AuthController.prototype) as CookieSerializerHost;

    const hostOnlyCookie = controller.clearAccessTokenCookie();
    const sharedCookie = controller.clearSharedAccessTokenCookie();

    expect(hostOnlyCookie).toContain('bcost_access_token=');
    expect(hostOnlyCookie).toContain('Max-Age=0');
    expect(hostOnlyCookie).not.toContain('Domain=.bcost.com.br');
    expect(sharedCookie).toContain('bcost_access_token=');
    expect(sharedCookie).toContain('Max-Age=0');
    expect(sharedCookie).toContain('Domain=.bcost.com.br');
  });
});
