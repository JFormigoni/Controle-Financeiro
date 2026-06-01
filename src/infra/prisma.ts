import "server-only";

import { PrismaClient } from "@prisma/client";

import { requireEnv } from "@/infra/env";

/**
 * Singleton do Prisma Client.
 *
 * Em desenvolvimento, o Next.js recarrega módulos a cada alteração (HMR), o que
 * pode criar múltiplas instâncias do `PrismaClient` e esgotar o pool de
 * conexões do PostgreSQL. Para evitar isso, a instância é memorizada em
 * `globalThis`. Em produção, uma única instância é criada por processo.
 *
 * `requireEnv("DATABASE_URL")` é avaliado na primeira leitura para falhar cedo
 * (e de forma descritiva) caso a configuração de banco esteja ausente
 * (Req. 16 - variáveis de ambiente seguras; 16.5 - acesso a dados via Prisma).
 *
 * O import `server-only` garante que o client nunca seja incluído em bundles
 * enviados ao navegador.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: requireEnv("DATABASE_URL") },
    },
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
