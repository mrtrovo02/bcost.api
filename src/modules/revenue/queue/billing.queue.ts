import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { RevenueService } from '../revenue.service';

@Processor('billing')
export class BillingProcessor {
  constructor(private readonly revenueService: RevenueService) {}

  @Process('process-company')
  async handle(job: Job<{ companyId: string }>) {
    return this.revenueService.processMonthlyBilling(job.data.companyId);
  }
}
