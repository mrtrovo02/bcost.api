'use strict';

import { Injectable } from '@nestjs/common';
import { ACCOUNTING_PLATFORM_COVERAGE } from './accounting-platform.data.js';
import {
  AccountingPlatformCoverageItem,
  AccountingPlatformCoverageResponse,
} from './accounting-platform.types.js';

@Injectable()
export class AccountingPlatformService {
  coverage(): AccountingPlatformCoverageResponse {
    const items = ACCOUNTING_PLATFORM_COVERAGE;

    return {
      status: 'OK',
      items,
      summary: this.buildSummary(items),
      generatedAt: new Date().toISOString(),
    };
  }

  private buildSummary(items: AccountingPlatformCoverageItem[]) {
    return {
      total: items.length,
      active: items.filter((item) => item.maturity === 'ACTIVE').length,
      integrating: items.filter((item) => item.maturity === 'INTEGRATING').length,
      planned: items.filter((item) => item.maturity === 'PLANNED').length,
      requiresPartner: items.filter((item) => item.maturity === 'REQUIRES_PARTNER')
        .length,
      requiresHumanOperation: items.filter(
        (item) => item.maturity === 'REQUIRES_HUMAN_OPERATION',
      ).length,
      crcValidated: items.filter((item) => item.automationBoundary === 'CRC_VALIDATED')
        .length,
    };
  }
}
