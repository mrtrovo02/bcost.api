'use strict';

import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { AccountingPlatformService } from './accounting-platform.service.js';

@Public()
@Controller('accounting-platform')
export class AccountingPlatformController {
  constructor(private readonly accountingPlatform: AccountingPlatformService) {}

  @Get('coverage')
  coverage() {
    return this.accountingPlatform.coverage();
  }

  @Get('offerings')
  offerings() {
    return this.accountingPlatform.offerings();
  }
}
