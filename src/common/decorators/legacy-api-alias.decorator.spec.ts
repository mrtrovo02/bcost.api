'use strict';

import 'reflect-metadata';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { DECORATORS } from '@nestjs/swagger/dist/constants.js';
import { LegacyApiAlias } from './legacy-api-alias.decorator.js';

describe('LegacyApiAlias', () => {
  class TestController {
    @LegacyApiAlias('/banking/enterprise/transactions/:companyId')
    legacyRoute() {
      return undefined;
    }
  }

  const target = TestController.prototype.legacyRoute;

  it('aplica headers HTTP padronizados de compatibilidade', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, target);

    expect(headers).toEqual(
      expect.arrayContaining([
        { name: 'Deprecation', value: 'true' },
        { name: 'X-bCost-Compatibility', value: 'legacy-alias' },
        {
          name: 'X-bCost-Canonical-Endpoint',
          value: '/banking/enterprise/transactions/:companyId',
        },
        {
          name: 'Link',
          value:
            '</banking/enterprise/transactions/:companyId>; rel="successor-version"',
        },
      ]),
    );
  });

  it('documenta headers no metadata Swagger da resposta', () => {
    const responses = Reflect.getMetadata(DECORATORS.API_RESPONSE, target);
    const response = Object.values(responses ?? {})[0] as {
      headers?: Record<string, unknown>;
    };

    expect(response.headers).toEqual(
      expect.objectContaining({
        Deprecation: expect.any(Object),
        'X-bCost-Compatibility': expect.any(Object),
        'X-bCost-Canonical-Endpoint': expect.any(Object),
        Link: expect.any(Object),
      }),
    );
  });
});
