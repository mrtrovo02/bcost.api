'use strict';

import { applyDecorators, Header } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function LegacyApiAlias(canonicalEndpoint: string) {
  return applyDecorators(
    Header('Deprecation', 'true'),
    Header('X-bCost-Compatibility', 'legacy-alias'),
    Header('X-bCost-Canonical-Endpoint', canonicalEndpoint),
    Header('Link', `<${canonicalEndpoint}>; rel="successor-version"`),
    ApiResponse({
      headers: {
        Deprecation: {
          description:
            'Indica que este endpoint é compatibilidade legada; novas integrações devem usar o endpoint canônico.',
          schema: { type: 'string', example: 'true' },
        },
        'X-bCost-Compatibility': {
          description: 'Classificação interna de compatibilidade da API.',
          schema: { type: 'string', example: 'legacy-alias' },
        },
        'X-bCost-Canonical-Endpoint': {
          description: 'Endpoint canônico recomendado para novas integrações.',
          schema: { type: 'string', example: canonicalEndpoint },
        },
        Link: {
          description: 'Link HTTP para o endpoint sucessor/canônico.',
          schema: {
            type: 'string',
            example: `<${canonicalEndpoint}>; rel="successor-version"`,
          },
        },
      },
    }),
  );
}
