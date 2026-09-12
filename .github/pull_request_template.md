## Summary

Describe the change and the production risk it reduces.

## Type

- [ ] fix
- [ ] feat
- [ ] security
- [ ] chore
- [ ] docs

## Safety Checklist

- [ ] No secrets, `.env`, certificates, dumps, fiscal XMLs, or customer data were committed.
- [ ] No demo authentication bypass or production fallback was added.
- [ ] Tenant and company access guards remain enforced for company-scoped data.
- [ ] Prisma schema changes include migrations and generated client validation when applicable.
- [ ] Fiscal, billing, payroll, banking, XML, or tax calculation changes include focused tests.

## Validation

- [ ] `npm run security:scan`
- [ ] `npm run typecheck`
- [ ] focused tests for changed module
- [ ] `npm run build`
- [ ] `npm run release:check` when production/env behavior changed

## Deployment Notes

List EC2 commands, migrations, env changes, PM2 reload order, and smoke checks.
