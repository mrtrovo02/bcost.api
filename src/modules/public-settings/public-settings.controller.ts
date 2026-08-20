'use strict';

import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { PublicSettingsService } from './public-settings.service.js';

@Public()
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: PublicSettingsService) {}

  @Get()
  @Version('2')
  getVersionedSettings() {
    return this.settings.getSettings();
  }
}

@Public()
@Controller('v2/settings')
export class PublicSettingsCompatibilityController {
  constructor(private readonly settings: PublicSettingsService) {}

  @Get()
  @Version(VERSION_NEUTRAL)
  getCompatibilitySettings() {
    return this.settings.getSettings();
  }
}
