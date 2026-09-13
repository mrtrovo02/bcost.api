'use strict';

import { IsIn, IsOptional, IsUrl } from 'class-validator';
import type { MonetizablePlanLevel } from '../domain/payment-provider.types.js';

export class CreateCheckoutSessionDto {
  @IsIn(['PRO', 'ENTERPRISE'])
  planLevel!: MonetizablePlanLevel;

  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}
