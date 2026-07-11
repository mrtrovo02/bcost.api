const fs = require('fs');

const path = "src/modules/revenue/revenue.service.ts";
let code = fs.readFileSync(path, "utf8");

code = code.replace(
/private async createInvoiceFromContract[\s\S]*?\}\n\s*\}/,
`private async createInvoiceFromContract(
  contract: Contract,
): Promise<Invoice | null> {
  try {
    return await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          companyId: contract.companyId,
          customerId: contract.customerId,
          type: InvoiceType.SERVICE,
          status: InvoiceStatus.NORMAL,
          amount: contract.amount,
          issuedAt: new Date(),
          reconciled: false,
        },
      });

      await tx.contract.update({
        where: { id: contract.id },
        data: { lastBillingAt: new Date() },
      });

      // 🔥 AUDIT opcional (não quebra mais)
      try {
        await tx.auditLog.create({
          data: {
            companyId: contract.companyId,
            action: 'AUTO_REVENUE_GENERATION',
            module: 'REVENUE',
            entity: 'Invoice',
            entityId: invoice.id,
            payload: {
              contractId: contract.id,
              amount: contract.amount.toString(),
            },
            statusCode: 201,
            responseTime: 0,
          },
        });
      } catch (e) {
        this.logger.warn('Audit log skipped (non-blocking)');
      }

      return invoice;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(\`❌ Invoice FAIL for contract \${contract.id}: \${message}\`);
    return null;
  }
}
}`
);

fs.writeFileSync(path, code);
console.log("✅ Revenue FIX aplicado");
