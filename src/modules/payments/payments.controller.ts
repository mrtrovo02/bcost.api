'use strict';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CompanyRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard.js';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto.js';
import { ListWebhookEventsQueryDto } from './dto/list-webhook-events-query.dto.js';
import { PaymentsService } from './payments.service.js';

type RawBodyRequest = AuthenticatedRequest & {
  rawBody?: Buffer;
};

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('checkout/:companyId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
  @Roles(CompanyRole.OWNER)
  @ApiOperation({ summary: 'Criar sessão de checkout para assinatura SaaS' })
  createCheckout(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Body() body: CreateCheckoutSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.payments.createCheckoutSession(companyId, body, req.user);
  }

  @Get('subscription/:companyId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
  @ApiOperation({ summary: 'Consultar assinatura e entitlements da empresa' })
  subscription(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.payments.getSubscription(companyId, req.user);
  }

  @Get('webhook-events/:companyId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, CompanyAccessGuard)
  @Roles(CompanyRole.OWNER)
  @ApiOperation({ summary: 'Listar trilha operacional de webhooks de pagamento' })
  webhookEvents(
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
    @Query() query: ListWebhookEventsQueryDto,
  ) {
    return this.payments.listWebhookEvents(companyId, query);
  }

  @Post('webhooks/stripe')
  @Public()
  @ApiOperation({ summary: 'Receber webhook assinado do Stripe' })
  stripeWebhook(
    @Req() req: RawBodyRequest,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Payload bruto do webhook indisponivel para validacao da assinatura.',
      );
    }

    return this.payments.processStripeWebhook(req.rawBody, signature);
  }
}
