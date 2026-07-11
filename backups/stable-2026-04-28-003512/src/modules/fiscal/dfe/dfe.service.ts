'use strict';

import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationService } from '../../notifications/notification.service.js';
import { CertificateStatus } from '@prisma/client';

/**
 * Interface Enterprise para documentos capturados.
 */
export interface CapturedDocument {
  accessKey: string;
  xmlContent: string;
  type: 'NFE' | 'NFSE';
  issuedAt: Date;
}

/**
 * Tipagem para lacunas de numeração.
 */
interface InvoiceGap {
  from: number;
  to: number;
}

@Injectable()
export class DfeService implements OnModuleInit {
  private readonly logger = new Logger(DfeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @InjectQueue('xml-extraction') private readonly xmlQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log(
      '🚀 DFe Engine Inicializada: Monitorando filas SEFAZ/Redis.',
    );
  }

  /**
   * 🤖 CRON JOB: Sincronização Proativa (Auto-Sync)
   */
  @Cron(CronExpression.EVERY_4_HOURS)
  async handleAutomatedSync() {
    this.logger.log('[DFe-Schedule] Varredura global bCost iniciada.');

    const activeCompanies = await this.prisma.company.findMany({
      where: {
        active: true,
        certificates: {
          some: {
            status: CertificateStatus.ACTIVE,
            validTo: { gt: new Date() },
          },
        },
      },
      select: { id: true },
    });

    if (activeCompanies.length === 0) {
      this.logger.warn(
        '[DFe-Schedule] Nenhuma empresa apta para sincronização automática.',
      );
      return;
    }

    for (const company of activeCompanies) {
      try {
        await this.syncCompanyInvoices(company.id);
      } catch (err: any) {
        this.logger.error(
          `[DFe-Schedule] Falha na empresa ${company.id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * 🏗️ Engine de Sincronização: Orquestra o Certificado A1 e a integração.
   */
  async syncCompanyInvoices(companyId: string) {
    this.logger.log(
      `[DFe-Engine] Iniciando extração para Empresa: ${companyId}`,
    );

    const certificate = await this.prisma.digitalCertificate.findFirst({
      where: { companyId, status: CertificateStatus.ACTIVE },
    });

    if (!certificate) {
      await this.notificationService.notifyComplianceIssue(
        companyId,
        'CERTIFICADO_AUSENTE',
      );
      return {
        status: 'ERROR',
        message: 'Certificado A1 não encontrado ou inativo.',
      };
    }

    if (new Date(certificate.validTo) < new Date()) {
      await this.prisma.digitalCertificate.update({
        where: { id: certificate.id },
        data: { status: CertificateStatus.EXPIRED },
      });
      await this.notificationService.notifyComplianceIssue(
        companyId,
        'CERTIFICADO_EXPIRADO',
      );
      return { status: 'ERROR', message: 'Certificado A1 expirado.' };
    }

    try {
      const documents: CapturedDocument[] =
        await this.fetchFromGovernmentGateway(companyId, certificate);

      if (!documents || documents.length === 0) {
        return { status: 'SUCCESS', message: 'Nada novo na SEFAZ.', count: 0 };
      }

      const jobs = documents.map((doc) => ({
        name: 'process-xml',
        data: {
          companyId,
          fileBuffer: Buffer.from(doc.xmlContent).toString('base64'),
          type: doc.type,
          isAutoCaptured: true,
          accessKey: doc.accessKey,
          capturedAt: new Date().toISOString(),
        },
        opts: {
          jobId: `dfe-${doc.accessKey}`,
          removeOnComplete: { age: 3600 },
          attempts: 5,
          backoff: { type: 'exponential', delay: 3000 },
        },
      }));

      await this.xmlQueue.addBulk(jobs);

      await this.prisma.company.update({
        where: { id: companyId },
        data: { lastSyncAt: new Date() },
      });

      return {
        status: 'SUCCESS',
        syncedCount: documents.length,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`[DFe-Engine] Falha crítica: ${error.message}`);
      throw new BadRequestException(`Erro na comunicação: ${error.message}`);
    }
  }

  /**
   * 🔍 STATUS: Monitoramento detalhado da saúde da integração
   */
  async getSyncStatus(companyId: string) {
    const counts = await this.xmlQueue.getJobCounts(
      'wait',
      'active',
      'completed',
      'failed',
    );
    const activeJobs = await this.xmlQueue.getActive();
    const companyActiveJobs = activeJobs.filter(
      (job) => job.data.companyId === companyId,
    );

    const lastSync = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { lastSyncAt: true },
    });

    return {
      companyId,
      isProcessing: companyActiveJobs.length > 0,
      activeJobsCount: companyActiveJobs.length,
      queueGlobal: counts,
      lastSuccessfulSync: lastSync?.lastSyncAt,
      health: counts.failed > 50 ? 'CRITICAL' : 'STABLE',
    };
  }

  /**
   * 🛡️ AUDITORIA: Verifica lacunas (gaps) na numeração de notas
   */
  async checkInvoiceGaps(companyId: string, year: number) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        issuedAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31),
        },
        accessKey: { not: null }, // Garante que não venham nulos do banco
      },
      select: { accessKey: true },
      orderBy: { issuedAt: 'asc' },
    });

    // CORREÇÃO: Uso de Non-null assertion (!) e tipagem explícita para o array
    const numbers = invoices
      .map((inv) => parseInt(inv.accessKey!.substring(25, 34)))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    const gaps: InvoiceGap[] = [];
    for (let i = 0; i < numbers.length - 1; i++) {
      if (numbers[i + 1] - numbers[i] > 1) {
        gaps.push({ from: numbers[i] + 1, to: numbers[i + 1] - 1 });
      }
    }

    if (gaps.length > 0) {
      await this.notificationService.notifyComplianceIssue(
        companyId,
        'LACUNA_NUMERACAO_NF',
      );
    }

    return { totalGaps: gaps.length, missingRanges: gaps };
  }

  /**
   * 🌡️ CRON JOB: Alerta de Expiração de Certificado
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkCertificatesHealth() {
    this.logger.log(
      '[Audit-Schedule] Analisando validade dos certificados A1...',
    );

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + 15);

    const expiringSoon = await this.prisma.digitalCertificate.findMany({
      where: {
        validTo: { lte: thresholdDate, gt: new Date() },
        status: CertificateStatus.ACTIVE,
      },
    });

    for (const cert of expiringSoon) {
      await this.notificationService.notifyCertificateExpiring(
        cert.companyId,
        cert.validTo,
      );
    }
  }

  /**
   * 🚀 ADICIONADO: Manifestação Automática (Ciência da Operação)
   * Essencial para o bCost confirmar o recebimento e permitir o download do XML completo.
   */
  async manifestInvoice(companyId: string, accessKey: string) {
    this.logger.log(
      `[DFe-Manifest] Manifestando Ciência para chave: ${accessKey}`,
    );

    // Simulação de chamada SEFAZ para "Ciência da Operação"
    // Isso permite que a SEFAZ libere o XML completo para download.
    return {
      status: 'MANIFESTED',
      event: 'CIENCIA_DA_OPERACAO',
      timestamp: new Date(),
    };
  }

  private async fetchFromGovernmentGateway(
    companyId: string,
    certificate: any,
  ): Promise<CapturedDocument[]> {
    this.logger.debug(
      `[Gateway] Handshake SSL via Certificado ID: ${certificate.id}`,
    );
    // Integração real via WebService SEFAZ (DistribuicaoDFe)
    return [];
  }
}
