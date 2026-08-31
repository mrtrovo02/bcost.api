'use strict';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutSessionStatus,
  PaymentProvider,
  Prisma,
  SubscriptionStatus,
  WebhookDeliveryStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../billing/billing-entitlements.service.js';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import {
  CheckoutSessionResult,
  PaymentProviderWebhookEvent,
  ProviderSubscriptionSnapshot,
} from './domain/payment-provider.types.js';
import { PaymentProviderFactory } from './providers/payment-provider.factory.js';

type CompanyBillingContact = {
  id: string;
  name: string;
  cnpj: string;
  planLevel: string | null;
  users: Array<{
    user: {
      email: string;
      name: string;
    };
  }>;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly billingEntitlements: BillingEntitlementsService,
  ) {}

  async createCheckoutSession(
    companyId: string,
    dto: CreateCheckoutSessionDto,
    user?: AuthUser,
  ) {
    const company = await this.findCompanyBillingContact(companyId);
    const provider = this.providerFactory.getProvider('STRIPE');
    const existingCustomer = await this.prisma.paymentCustomer.findUnique({
      where: {
        companyId_provider: {
          companyId,
          provider: PaymentProvider.STRIPE,
        },
      },
    });

    const result = await provider.createCheckoutSession({
      companyId,
      planLevel: dto.planLevel,
      customerEmail: company.users[0]?.user.email ?? user?.email ?? null,
      customerName: company.users[0]?.user.name ?? company.name,
      providerCustomerId: existingCustomer?.providerCustomerId ?? null,
      successUrl: this.resolveSuccessUrl(dto.successUrl),
      cancelUrl: this.resolveCancelUrl(dto.cancelUrl),
    });

    const paymentCustomer = await this.upsertPaymentCustomerFromCheckout(
      company,
      result,
      existingCustomer?.id,
    );

    const checkoutSession = await this.prisma.checkoutSession.create({
      data: {
        companyId,
        paymentCustomerId: paymentCustomer?.id,
        provider: PaymentProvider.STRIPE,
        providerCheckoutSessionId: result.providerCheckoutSessionId,
        planLevel: dto.planLevel,
        status: this.mapCheckoutStatus(result.status),
        checkoutUrl: result.checkoutUrl,
        expiresAt: result.expiresAt ?? null,
        metadata: this.toJsonObject({
          requestedBy: user?.id ?? user?.sub ?? null,
          requestedByEmail: user?.email ?? null,
          initialProviderSubscriptionId: result.providerSubscriptionId ?? null,
        }),
      },
    });

    return {
      status: 'OK',
      provider: PaymentProvider.STRIPE,
      companyId,
      planLevel: dto.planLevel,
      checkoutSession: {
        id: checkoutSession.id,
        providerCheckoutSessionId: checkoutSession.providerCheckoutSessionId,
        checkoutUrl: checkoutSession.checkoutUrl,
        status: checkoutSession.status,
        expiresAt: checkoutSession.expiresAt,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getSubscription(companyId: string, user?: AuthUser) {
    const entitlements = await this.billingEntitlements.getEntitlements(
      companyId,
      user,
    );
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        companyId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return {
      status: 'OK',
      companyId,
      subscription,
      entitlements,
      generatedAt: new Date().toISOString(),
    };
  }

  async processStripeWebhook(rawBody: Buffer, signature?: string) {
    const provider = this.providerFactory.getProvider('STRIPE');
    const event = provider.constructWebhookEvent(rawBody, signature);
    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: PaymentProvider.STRIPE,
          providerEventId: event.providerEventId,
        },
      },
    });

    if (existing?.status === WebhookDeliveryStatus.PROCESSED) {
      return {
        status: 'OK_IDEMPOTENT',
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        generatedAt: new Date().toISOString(),
      };
    }

    const webhookEvent =
      existing ??
      (await this.prisma.paymentWebhookEvent.create({
        data: {
          companyId: event.companyId ?? null,
          provider: PaymentProvider.STRIPE,
          providerEventId: event.providerEventId,
          eventType: event.eventType,
          status: WebhookDeliveryStatus.RECEIVED,
          payload: this.toJsonObject(event.payload),
        },
      }));

    try {
      await this.applyWebhookEvent(event);

      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          companyId: event.companyId ?? webhookEvent.companyId,
          status: WebhookDeliveryStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        status: 'OK',
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        generatedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          errorMessage: message,
        },
      });

      throw error;
    }
  }

  private async findCompanyBillingContact(
    companyId: string,
  ): Promise<CompanyBillingContact> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        planLevel: true,
        users: {
          where: {
            deletedAt: null,
          },
          take: 1,
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            user: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada para checkout.');
    }

    return company;
  }

  private async upsertPaymentCustomerFromCheckout(
    company: CompanyBillingContact,
    result: CheckoutSessionResult,
    existingId?: string,
  ) {
    if (!result.providerCustomerId) {
      return existingId
        ? this.prisma.paymentCustomer.findUnique({ where: { id: existingId } })
        : null;
    }

    return this.prisma.paymentCustomer.upsert({
      where: {
        companyId_provider: {
          companyId: company.id,
          provider: PaymentProvider.STRIPE,
        },
      },
      create: {
        companyId: company.id,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: result.providerCustomerId,
        email: company.users[0]?.user.email ?? null,
        name: company.users[0]?.user.name ?? company.name,
      },
      update: {
        providerCustomerId: result.providerCustomerId,
        email: company.users[0]?.user.email ?? null,
        name: company.users[0]?.user.name ?? company.name,
      },
    });
  }

  private async applyWebhookEvent(
    event: PaymentProviderWebhookEvent,
  ): Promise<void> {
    if (event.checkoutSessionId && event.checkoutStatus) {
      await this.prisma.checkoutSession.updateMany({
        where: {
          provider: PaymentProvider.STRIPE,
          providerCheckoutSessionId: event.checkoutSessionId,
        },
        data: {
          status: event.checkoutStatus,
          completedAt:
            event.checkoutStatus === CheckoutSessionStatus.COMPLETE
              ? new Date()
              : undefined,
        },
      });
    }

    if (event.subscription) {
      await this.upsertSubscription(event.subscription);
    }
  }

  private async upsertSubscription(
    subscription: ProviderSubscriptionSnapshot,
  ): Promise<void> {
    const companyId = subscription.companyId;

    if (!companyId) {
      throw new BadRequestException(
        'Webhook de assinatura sem companyId no metadata.',
      );
    }

    const paymentCustomer = subscription.providerCustomerId
      ? await this.prisma.paymentCustomer.findFirst({
          where: {
            provider: PaymentProvider.STRIPE,
            providerCustomerId: subscription.providerCustomerId,
          },
        })
      : null;

    const normalizedPlan = subscription.planLevel ?? 'PRO';
    const normalizedStatus = subscription.status as SubscriptionStatus;

    await this.prisma.subscription.upsert({
      where: {
        providerSubscriptionId: subscription.providerSubscriptionId,
      },
      create: {
        companyId,
        paymentCustomerId: paymentCustomer?.id,
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerCustomerId: subscription.providerCustomerId,
        planLevel: normalizedPlan,
        status: normalizedStatus,
        currentPeriodStart: subscription.currentPeriodStart ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt ?? null,
        trialEndsAt: subscription.trialEndsAt ?? null,
        metadata: this.toJsonObject(subscription.metadata),
      },
      update: {
        paymentCustomerId: paymentCustomer?.id,
        providerCustomerId: subscription.providerCustomerId,
        planLevel: normalizedPlan,
        status: normalizedStatus,
        currentPeriodStart: subscription.currentPeriodStart ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt ?? null,
        trialEndsAt: subscription.trialEndsAt ?? null,
        metadata: this.toJsonObject(subscription.metadata),
      },
    });

    await this.syncCompanyPlanFromSubscription(
      companyId,
      normalizedPlan,
      normalizedStatus,
    );
  }

  private async syncCompanyPlanFromSubscription(
    companyId: string,
    planLevel: string,
    status: SubscriptionStatus,
  ): Promise<void> {
    const activeStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.TRIALING,
    ];
    const nextPlanLevel = activeStatuses.includes(status) ? planLevel : 'FREE';
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        settings: true,
      },
    });
    const settings = this.isPlainRecord(company?.settings)
      ? company?.settings
      : {};
    const currentBilling = this.isPlainRecord(settings.billing)
      ? settings.billing
      : {};

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        planLevel: nextPlanLevel,
        settings: this.toJsonObject({
          ...settings,
          billing: {
            ...currentBilling,
            provider: PaymentProvider.STRIPE,
            subscriptionStatus: status,
            syncedPlanLevel: nextPlanLevel,
            lastWebhookSyncAt: new Date().toISOString(),
          },
        }),
      },
    });
  }

  private resolveSuccessUrl(value?: string): string {
    return (
      value ?? `${this.requireFrontendUrl()}/dashboard/settings?billing=success`
    );
  }

  private resolveCancelUrl(value?: string): string {
    return (
      value ?? `${this.requireFrontendUrl()}/dashboard/settings?billing=cancel`
    );
  }

  private requireFrontendUrl(): string {
    const value =
      this.config.get<string>('FRONTEND_BASE_URL') ??
      this.config.get<string>('PUBLIC_APP_URL') ??
      'http://localhost:3000';

    return value.replace(/\/$/, '');
  }

  private mapCheckoutStatus(status: string): CheckoutSessionStatus {
    if (status === 'complete') return CheckoutSessionStatus.COMPLETE;
    if (status === 'expired') return CheckoutSessionStatus.EXPIRED;
    if (status === 'open') return CheckoutSessionStatus.OPEN;
    return CheckoutSessionStatus.CREATED;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
    return value as Prisma.InputJsonObject;
  }
}
