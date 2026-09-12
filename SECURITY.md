# Security Policy

## Supported Scope

The `main` branch is the only supported branch for security fixes in the bCost API.

## Reporting a Vulnerability

Do not open public issues with secrets, credentials, tokens, database URLs, certificates, customer data, fiscal documents, XML files, or screenshots containing production data.

Report suspected vulnerabilities privately to the repository owner and include:

- affected route, module, or command;
- reproduction steps without real customer data;
- expected impact;
- relevant trace ID, if available;
- whether the issue affects authentication, tenant isolation, billing, fiscal calculations, or production deployment.

## Production Security Rules

- Demo authentication bypasses are not allowed in backend guards.
- Company data must remain scoped by tenant and company access controls.
- Secrets must come from environment variables or a managed secret store.
- `.env`, certificates, database dumps, and customer documents must never be committed.
- Security fixes must pass release checks, focused tests, typecheck, build, and the versioned secret scan before deployment.
