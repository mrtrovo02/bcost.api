# npm audit baseline

Data base: 2026-09-11

Este arquivo registra a dívida técnica de dependências do backend que não deve ser corrigida com `npm audit fix --force` sem uma sprint dedicada de compatibilidade.

## Status atual

- `npm audit --audit-level=high` roda no CI como relatório não bloqueante.
- `npm run security:scan`, testes focados, typecheck e build continuam bloqueantes.
- O frontend já está com `npm audit --audit-level=high` bloqueante e sem vulnerabilidades conhecidas.

## Principais frentes abertas

| Frente | Origem | Risco | Correção segura |
| --- | --- | --- | --- |
| Fastify / middie / static | `@nestjs/platform-fastify`, `@nestjs/swagger` | Bypass/DoS em dependências transitivas | Planejar upgrade coordenado de Nest/Fastify/Swagger e smoke de rotas públicas, auth, CORS e Swagger |
| Nest core/platform packages | `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/websockets` | Dependências transitivas vulneráveis | Atualizar família Nest de forma consistente, sem misturar majors |
| Toolchain Nest CLI / Angular Devkit | `@nestjs/cli`, schematics, webpack, tmp, glob, ajv | Risco em ferramentas de build | Atualizar toolchain em sprint isolada e validar build/SWC/Prisma |
| XML parsing | `fast-xml-parser` | Injeção/DoS em XML | Testar parser com XML fiscal real e malformado antes de major upgrade |
| Bull legado | `@nestjs/bull` / `bull` / `uuid` | Dependência sem fix transitivo direto | Migrar uso legado para BullMQ ou remover `@nestjs/bull` se não utilizado |

## Regra de mudança

Antes de tornar o audit do backend bloqueante:

1. atualizar dependências por família, não com `--force` amplo;
2. rodar `npm test -- --runInBand` nos módulos de auth, tenant, fiscal, billing e XML;
3. rodar `npm run typecheck`, `npm run build`, `npm run release:check` e `npm run security:scan`;
4. validar smoke na EC2: `/api/v1/health`, login real, seleção de empresa, módulos fiscais e métricas protegidas;
5. só então remover `continue-on-error: true` do audit no CI.
