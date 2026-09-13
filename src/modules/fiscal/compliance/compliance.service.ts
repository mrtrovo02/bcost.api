'use strict';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  InvoiceStatus,
  InvoiceType,
  Prisma,
  CertificateStatus,
  NotificationType,
  NotificationSeverity,
  DigitalCertificate,
} from '@prisma/client';

/**
 * Interface Enterprise para o Relatório de Compliance.
 */
export interface ComplianceReport {
  companyId: string;
  score: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  fatorR: {
    current: number;
    eligible: boolean;
    recommendedAnexo: string;
    targetPayrollValue: number;
    projectedTaxSaving: number;
  };
  findings: Array<{
    code: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    affectedInvoices?: string[];
    fixSuggestion?: string;
  }>;
  summary: {
    totalAnalyzedInvoices: number;
    totalPayrollAnalyzed: number;
    issuesCount: number;
    revenueYTD: number;
    billingLimitProgress: number;
  };
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger('bCost-Compliance-Engine');
  private readonly SIMPLES_LIMIT = 4800000; // Limite Simples Nacional R$ 4.8M

  constructor(private readonly prisma: PrismaService) {}

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Ponto de entrada rápido para verificações de saúde via Controller.
   */
  async runHealthCheck(companyId: string): Promise<ComplianceReport> {
    return this.runFullComplianceAudit(companyId);
  }

  /**
   * Monitor de integridade de certificados digitais.
   * Executa a atualização de status e dispara notificações sistêmicas.
   */
  async checkCertificatesHealth() {
    this.logger.log(
      '🛡️ [Compliance] Verificando integridade de certificados...',
    );

    const today = new Date();
    const alertThreshold = new Date();
    alertThreshold.setDate(today.getDate() + 30);

    const certificates = await this.prisma.digitalCertificate.findMany({
      where: { status: { not: CertificateStatus.REVOKED } },
    });

    let alertsGenerated = 0;

    for (const cert of certificates) {
      try {
        if (cert.validTo <= today) {
          await this.processCertificateExpiration(cert, 'EXPIRED');
          alertsGenerated++;
        } else if (cert.validTo <= alertThreshold) {
          await this.processCertificateExpiration(cert, 'WARNING');
          alertsGenerated++;
        }
      } catch (error: unknown) {
        this.logger.error(
          `❌ Erro no check do certificado ${cert.id}: ${this.getErrorMessage(error)}`,
        );
      }
    }

    return { checked: certificates.length, alerts: alertsGenerated };
  }

  /**
   * Auditoria Profunda de Conformidade.
   * Analisa Faturamento, Cancelamentos e Eficiência Tributária (Fator R).
   */
  async runFullComplianceAudit(companyId: string): Promise<ComplianceReport> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { _count: { select: { invoices: true } } },
    });

    if (!company)
      throw new NotFoundException(
        'Empresa não encontrada no ecossistema bCost.',
      );

    const findings: ComplianceReport['findings'] = [];
    let score = 100;

    // 1. ANÁLISE DE FATURAMENTO ACUMULADO (YTD)
    const revenueStats = await this.fetchYearlyRevenue(companyId);
    const billingProgress = revenueStats
      .div(this.SIMPLES_LIMIT)
      .mul(100)
      .toNumber();

    if (billingProgress > 80) {
      findings.push({
        code: 'SIMPLES_LIMIT_WARNING',
        severity: 'HIGH',
        message: `Faturamento atingiu ${billingProgress.toFixed(1)}% do limite do Simples.`,
        fixSuggestion:
          'Inicie o planejamento tributário para Lucro Presumido IMEDIATAMENTE.',
      });
      score -= 20;
    }

    // 2. AUDITORIA DE INTEGRIDADE (CANCELAMENTOS)
    const canceledCount = await this.prisma.invoice.count({
      where: { companyId, status: InvoiceStatus.CANCELLED },
    });

    if (canceledCount > 5) {
      findings.push({
        code: 'HIGH_CANCEL_RATE',
        severity: 'MEDIUM',
        message: `Volume de notas canceladas (${canceledCount}) acima da média de segurança.`,
        fixSuggestion:
          'Revise os processos de emissão para evitar fiscalização por substituição.',
      });
      score -= 10;
    }

    // 3. MOTOR DE INTELIGÊNCIA FATOR R (Últimos 12 meses)
    const fatorRResult = await this.calculateFatorR(companyId);

    if (!fatorRResult.eligible && fatorRResult.factor > 0) {
      findings.push({
        code: 'FATOR_R_INEFFICIENT',
        severity: 'HIGH',
        message: `Fator R insuficiente (${fatorRResult.factor}%). Empresa tributada no Anexo V.`,
        fixSuggestion: `Ajuste a folha/pró-labore em R$ ${fatorRResult.neededForTarget.toFixed(2)} para migrar ao Anexo III.`,
      });
      score -= 30;
    }

    return {
      companyId,
      score: Math.max(score, 0),
      status: this.resolveStatus(score),
      fatorR: {
        current: fatorRResult.factor,
        eligible: fatorRResult.eligible,
        recommendedAnexo: fatorRResult.recommendedAnexo,
        targetPayrollValue: fatorRResult.neededForTarget,
        projectedTaxSaving: fatorRResult.potentialSaving,
      },
      findings,
      summary: {
        totalAnalyzedInvoices: company._count.invoices,
        totalPayrollAnalyzed: fatorRResult.totalPayroll,
        issuesCount: findings.length,
        revenueYTD: revenueStats.toNumber(),
        billingLimitProgress: Number(billingProgress.toFixed(2)),
      },
    };
  }

  /**
   * Cálculo Matemático do Fator R.
   * Cruza Payroll vs Invoices (Service) dos últimos 12 meses.
   */
  private async calculateFatorR(companyId: string) {
    const l12Date = new Date();
    l12Date.setFullYear(l12Date.getFullYear() - 1);

    const [revenueAgg, payrollAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          type: InvoiceType.SERVICE,
          status: InvoiceStatus.NORMAL,
          issuedAt: { gte: l12Date },
        },
        _sum: { amount: true },
      }),
      this.prisma.payroll.aggregate({
        where: {
          companyId,
          createdAt: { gte: l12Date },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenue = new Prisma.Decimal(revenueAgg._sum?.amount || 0);
    const totalPayroll = new Prisma.Decimal(payrollAgg._sum?.totalAmount || 0);

    if (totalRevenue.isZero()) {
      return {
        factor: 0,
        eligible: false,
        recommendedAnexo: 'N/A',
        totalPayroll: 0,
        neededForTarget: 0,
        potentialSaving: 0,
      };
    }

    const factorRatio = totalPayroll.div(totalRevenue);
    const factorPercentage = factorRatio.mul(100).toNumber();

    // Economia projetada (Diferença média de 9.5% entre Anexo V e III)
    const potentialSaving = totalRevenue.mul(0.095).toNumber();
    const targetPayroll = totalRevenue.mul(0.28);
    const neededForTarget = targetPayroll.minus(totalPayroll);

    return {
      factor: Number(factorPercentage.toFixed(2)),
      eligible: factorPercentage >= 28,
      recommendedAnexo: factorPercentage >= 28 ? 'Anexo III' : 'Anexo V',
      totalPayroll: totalPayroll.toNumber(),
      neededForTarget: neededForTarget.gt(0) ? neededForTarget.toNumber() : 0,
      potentialSaving: factorPercentage < 28 ? potentialSaving : 0,
    };
  }

  /**
   * Processamento atômico de expiração de certificados.
   */
  private async processCertificateExpiration(
    cert: DigitalCertificate,
    level: 'EXPIRED' | 'WARNING',
  ) {
    const isExpired = level === 'EXPIRED';

    await this.prisma.$transaction([
      ...(isExpired
        ? [
            this.prisma.digitalCertificate.update({
              where: { id: cert.id },
              data: { status: CertificateStatus.EXPIRED },
            }),
          ]
        : []),
      this.prisma.notificationLog.create({
        data: {
          companyId: cert.companyId,
          type: NotificationType.CERT_EXPIRATION,
          severity: isExpired
            ? NotificationSeverity.CRITICAL
            : NotificationSeverity.WARNING,
          title: 'Certificado Digital - Ação Requerida',
          message: isExpired
            ? `O certificado da empresa expirou em ${cert.validTo.toLocaleDateString('pt-BR')}.`
            : `Atenção: O certificado vencerá em breve (${cert.validTo.toLocaleDateString('pt-BR')}).`,
        },
      }),
    ]);
  }

  private async fetchYearlyRevenue(companyId: string): Promise<Prisma.Decimal> {
    const yearStart = new Date(Date.UTC(new Date().getFullYear(), 0, 1));
    const agg = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        status: InvoiceStatus.NORMAL,
        issuedAt: { gte: yearStart },
      },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(agg._sum?.amount || 0);
  }

  private resolveStatus(score: number): ComplianceReport['status'] {
    if (score >= 80) return 'HEALTHY';
    if (score >= 50) return 'WARNING';
    return 'CRITICAL';
  }
}
