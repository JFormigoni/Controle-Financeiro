# Camada de dados (Prisma)

Este diretório contém o schema do Prisma e as migrações do banco PostgreSQL da
Plataforma de Gestão Financeira.

## Arquivos

- `schema.prisma` — modelagem do ERD (design.md → "Data Models"): `User`,
  `Category`, `Transaction`, `Goal`, `Session`, `AccessLog`, `ConsentRecord` e
  `VerificationToken`, além dos enums (`TransactionType`, `UserRole`,
  `AccountStatus`, `Frequency`, `TokenPurpose`, `AccessAction`). Valores
  monetários (`amount`, `targetAmount`, `accumulatedAmount`) usam `Decimal(12,2)`.
- `migrations/` — migração inicial (`*_init`) com o SQL de criação do schema.

O singleton do client fica em `src/infra/prisma.ts`.

## Comandos

```bash
npm run db:generate        # gera o Prisma Client (prisma generate)
npm run db:migrate         # cria/aplica migrações em desenvolvimento (precisa de DB)
npm run db:migrate:deploy  # aplica migrações em produção (precisa de DB)
npm run db:studio          # abre o Prisma Studio
```

## Aplicar a migração inicial

A migração inicial foi gerada de forma offline (via `prisma migrate diff`),
pois um PostgreSQL não estava acessível no ambiente de desenvolvimento.

Para aplicá-la é necessário um banco PostgreSQL acessível na `DATABASE_URL`
definida em `.env`/`.env.local`. Com o banco no ar:

```bash
# Aplica a migração registrada em prisma/migrations
npx prisma migrate deploy
```

Em desenvolvimento, para criar novas migrações a partir de alterações no
`schema.prisma`, use `npm run db:migrate` (que executa `prisma migrate dev`).

> Observação: a primeira execução de `prisma migrate dev` com um banco real pode
> pedir para reconciliar a migração inicial já existente; nesse caso prefira
> `prisma migrate deploy` para aplicar a migração `_init` tal como versionada.
