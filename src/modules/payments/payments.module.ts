'use strict';

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentProviderFactory } from './providers/payment-provider.factory.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderFactory, StripePaymentProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
