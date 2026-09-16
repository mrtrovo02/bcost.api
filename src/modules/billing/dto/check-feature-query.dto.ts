'use strict';

import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CheckFeatureQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/)
  feature!: string;
}
