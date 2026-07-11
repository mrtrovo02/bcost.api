import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class BillingScheduler {
  constructor(
    @InjectQueue('billing') private billingQueue: Queue,
  ) {}

  @Cron('0 2 * * *') // todo dia 02:00
  async handleCron() {
    // 🔥 Aqui você pode buscar todas as empresas
    const companies = [
      'da78cb39-d18a-46bd-85fb-5dce9eda3751'
    ];

    for (const companyId of companies) {
      await this.billingQueue.add('process-company', { companyId });
    }
  }
}
