import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class NotificationPrismaService {
  constructor(public readonly prisma: PrismaService) {}
}
