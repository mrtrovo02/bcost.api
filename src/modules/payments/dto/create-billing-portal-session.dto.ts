'use strict';

import { IsOptional, IsUrl } from 'class-validator';

export class CreateBillingPortalSessionDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
