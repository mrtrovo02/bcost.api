import { SetMetadata } from '@nestjs/common';

export const SKIP_COMPANY_CHECK_KEY = 'skipCompanyCheck';
export const SkipCompanyCheck = () => SetMetadata(SKIP_COMPANY_CHECK_KEY, true);
