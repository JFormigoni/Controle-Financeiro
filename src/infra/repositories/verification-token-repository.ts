import "server-only";

import type { TokenPurpose, VerificationToken } from "@prisma/client";

import { prisma } from "@/infra/prisma";

/**
 * Repositório fino de `VerificationToken` sobre o Prisma Client.
 *
 * Encapsula o acesso aos tokens de uso único (verificação de e-mail,
 * redefinição de senha e alteração de e-mail). Os tokens são armazenados como
 * **hash** (`tokenHash`), com `expiresAt` e a flag `used`, garantindo uso único
 * e expiração (Req. 1.3, 1.4, 3.1, 3.2, 3.3, 4.4).
 *
 * As funções são finas: o cálculo do hash, do `expiresAt` (TTL por finalidade)
 * e a decisão de validade pertencem ao domínio (`@/domain/auth/token`). Aqui
 * apenas se persiste e consulta, sempre via delegates parametrizados do Prisma
 * (Req. 16.5).
 */

/** Dados para persistir um novo token de uso único. */
export interface CreateVerificationTokenData {
  userId: string;
  purpose: TokenPurpose;
  /** Hash do token (o valor em claro nunca é persistido). */
  tokenHash: string;
  expiresAt: Date;
}

/** Cria um token de verificação. */
export function create(
  data: CreateVerificationTokenData,
): Promise<VerificationToken> {
  return prisma.verificationToken.create({ data });
}

/**
 * Busca um token pelo hash (campo único). Retorna `null` se inexistente.
 * A validade (uso único + expiração) é decidida pelo domínio.
 */
export function findByTokenHash(
  tokenHash: string,
): Promise<VerificationToken | null> {
  return prisma.verificationToken.findUnique({ where: { tokenHash } });
}

/**
 * Marca um token como usado, garantindo o uso único após um consumo
 * bem-sucedido (Req. 1.4, 3.2, 3.3). Idempotente do ponto de vista do estado
 * final (`used=true`).
 */
export function markUsed(tokenHash: string): Promise<VerificationToken> {
  return prisma.verificationToken.update({
    where: { tokenHash },
    data: { used: true },
  });
}

/**
 * Conta quantos tokens de uma finalidade foram criados para um usuário a partir
 * de `since` (inclusive). Suporta o limite de reenvio (máx. 5 por janela de
 * 24h — Req. 1.6); a decisão do limite em si é do domínio
 * (`@/domain/auth/resend-limit`).
 */
export function countByPurposeSince(
  userId: string,
  purpose: TokenPurpose,
  since: Date,
): Promise<number> {
  return prisma.verificationToken.count({
    where: { userId, purpose, createdAt: { gte: since } },
  });
}

/**
 * Remove tokens expirados (`expiresAt < now`), retornando a quantidade
 * removida. Rotina de limpeza opcional; não interfere na decisão de validade.
 */
export async function deleteExpired(now: Date): Promise<number> {
  const { count } = await prisma.verificationToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}
