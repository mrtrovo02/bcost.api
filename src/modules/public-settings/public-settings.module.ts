'use strict';

import { Module } from '@nestjs/common';
import {
  PublicSettingsCompatibilityController,
  PublicSettingsController,
} from './public-settings.controller.js';
import { PublicSettingsService } from './public-settings.service.js';

@Module({
  controllers: [PublicSettingsController, PublicSettingsCompatibilityController],
  providers: [PublicSettingsService],
})
export class PublicSettingsModule {}
