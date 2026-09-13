import { PartialType } from '@nestjs/swagger';
import { CreateBusinessRuleDto } from './create-business-rule.dto.js';

export class UpdateBusinessRuleDto extends PartialType(CreateBusinessRuleDto) {}
