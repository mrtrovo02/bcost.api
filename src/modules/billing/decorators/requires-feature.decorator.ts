'use strict';

import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '../billing-entitlements.service.js';

export const REQUIRED_FEATURE_KEY = 'bcost:required-feature';

export const RequiresFeature = (feature: FeatureKey) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature);
