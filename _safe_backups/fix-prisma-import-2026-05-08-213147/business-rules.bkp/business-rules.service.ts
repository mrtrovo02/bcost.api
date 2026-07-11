import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateBusinessRuleDto } from './dto/create-business-rule.dto.js';
import { UpdateBusinessRuleDto } from './dto/update-business-rule.dto.js';

@Injectable()
export class BusinessRulesService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateBusinessRuleDto) {
    return this.prisma.businessRule.create({
      data: createDto,
    });
  }

  async findAll(companyId: string) {
    return this.prisma.businessRule.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const rule = await this.prisma.businessRule.findFirst({
      where: { id, companyId },
    });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    return rule;
  }

  async update(
    id: string,
    companyId: string,
    updateDto: UpdateBusinessRuleDto,
  ) {
    await this.findOne(id, companyId);
    return this.prisma.businessRule.update({
      where: { id },
      data: updateDto,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.businessRule.delete({ where: { id } });
  }
}
