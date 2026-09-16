import 'reflect-metadata';
import {
  THROTTLE_ENDPOINT_LIMIT,
  ThrottleEndpoint,
} from './throttle-endpoint.decorator.js';

describe('ThrottleEndpoint', () => {
  it('stores endpoint-specific limits in milliseconds for Nest throttler', () => {
    class ControllerFixture {
      @ThrottleEndpoint({ limit: 5, ttl: 300 })
      login(): void {
        return undefined;
      }
    }

    const metadata = Reflect.getMetadata(
      THROTTLE_ENDPOINT_LIMIT,
      ControllerFixture.prototype.login,
    );

    expect(metadata).toEqual({
      limit: 5,
      ttl: 300000,
    });
  });

  it('rejects non-positive limits before a route can be registered with weak throttling', () => {
    expect(() => ThrottleEndpoint({ limit: 0, ttl: 60 })).toThrow(
      'ThrottleEndpoint limit must be a positive integer.',
    );
  });

  it('rejects non-integer ttl values before a route can be registered with ambiguous windows', () => {
    expect(() => ThrottleEndpoint({ limit: 5, ttl: 0.5 })).toThrow(
      'ThrottleEndpoint ttl must be a positive integer.',
    );
  });
});
