'use strict';

import { Injectable } from '@nestjs/common';
import { PaymentProviderCode } from '../domain/payment-provider.types.js';
import { StripePaymentProvider } from './stripe.provider.js';

@Injectable()
export class PaymentProviderFactory {
  constructor(private readonly stripe: StripePaymentProvider) {}

  getProvider(provider: PaymentProviderCode = 'STRIPE') {
    if (provider === 'STRIPE') return this.stripe;

    return this.stripe;
  }
}
