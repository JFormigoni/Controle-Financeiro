import "server-only";

import type { Session } from "@prisma/client";

import { prisma } from "@/infra/prisma";

/**
 * Repositório fino de `Session` sobre o Prisma Client.
 *
 * Encapsula o acesso à tabela de sessões persistidas (estratégia _database
 * sessions_ do Auth.js v5). Suporta a criação, a renovação por inatividade
 * (atualização de `expires`), o encerramento de uma sessão (logout) e a
 * invalidação em massa por usuário — necessária após troca/redefinição de
 * senha ou desativação de conta (Req. 2.4, 3.6, 14.3).
 *
 * Todas as consultas usam delegates tipados do Prisma (SQL parametrizado,
 * Req. 16.5). Sem regra de negócio: o cálculo do `expires` (janela deslizante
 * de 30min) e a decisão de invalidar pertencem ao domínio/serviços.
 */

/** Dados para persistir uma nova sessão. */
export interface CreateSessionData {
  userId: string;
  sessionToken: string;
  expires: Date;
}

/** Cria uma nova sessão para o usuário. */
export function create(data: CreateSessionData): Promise<Session> {
  return prisma.session.create({ data });
}

/**
 * Busca uma sessão pelo token (campo único). Retorna `null` se inexistente.
 * A decisão de validade/expiração é do domínio (`@/domain/auth/session`).
 */
export function findByToken(sessionToken: string): Promise<Session | null> {
  return prisma.session.findUnique({ where: { sessionToken } });
}

/**
 * Renova o instante de expiração de uma sessão (janela deslizante de
 * inatividade — Req. 2.5). O novo `expires` é calculado pelo domínio.
 */
export function updateExpires(
  sessionToken: string,
  expires: Date,
): Promise<Session> {
  return prisma.session.update({
    where: { sessionToken },
    data: { expires },
  });
}

/** Encerra (remove) uma sessão pelo token — logout (Req. 2.4). */
export function deleteByToken(sessionToken: string): Promise<Session> {
  return prisma.session.delete({ where: { sessionToken } });
}

/**
 * Invalida **todas** as sessões ativas de um usuário, retornando a quantidade
 * removida. Usado após troca/redefinição de senha ou desativação de conta
 * (Req. 3.6, 14.3). Usa `deleteMany` (parametrizado) e nunca lança quando não
 * há sessões.
 */
export async function deleteAllForUser(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}
