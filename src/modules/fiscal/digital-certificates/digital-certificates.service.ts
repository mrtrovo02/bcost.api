'use strict';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateDigitalCertificateDto } from './dto/create-digital-certificate.dto';
import { UpdateDigitalCertificateDto } from './dto/update-digital-certificate.dto';

@Injectable()
export class DigitalCertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDigitalCertificateDto) {
    return this.prisma.digitalCertificate.create({
      data: {
        companyId: dto.companyId,
        issuer: dto.issuer,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        status: 'ACTIVE',
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.digitalCertificate.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const cert = await this.prisma.digitalCertificate.findFirst({
      where: { id, companyId },
    });

    if (!cert) throw new NotFoundException('Certificado não encontrado.');
    return cert;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateDigitalCertificateDto,
  ) {
    await this.findOne(id, companyId);

    return this.prisma.digitalCertificate.update({
      where: { id },
      data: {
        ...dto,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.digitalCertificate.delete({
      where: { id },
    });
  }

  /**
   * 🔥 MÉTODO CRÍTICO (usado pelo Revenue)
   */
  async getValidCertificate(companyId: string) {
    const cert = await this.prisma.digitalCertificate.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        validTo: {
          gt: new Date(),
        },
      },
      orderBy: {
        validTo: 'desc',
      },
    });

    return cert;
  }
}
