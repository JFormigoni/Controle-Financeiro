import "server-only";

import type { AccountStatus, Prisma, User } from "@prisma/client";

import { prisma } from "@/infra/prisma";

/**
 * Repositório fino de `User` sobre o Prisma Client.
 *
 * Encapsula o acesso a dados da conta de usuário, expondo apenas operações de
 * leitura/escrita parametrizadas. Toda consulta usa os _typed delegates_ do
 * Prisma, que geram SQL parametrizado por padrão (Req. 16.5), eliminando a
 * superfície de injeção de SQL. As funções são **finas**: não contêm regra de
 * negócio (hash de senha, decisão de bloqueio, validação) — isso pertence à
 * camada de domínio/serviços. Aqui apenas se traduzem intenções em consultas.
 *
 * O módulo é `server-only` (transitivamente, via `@/infra/prisma`, e explícito
 * acima) para garantir que nunca seja incluído em bundles do navegador.
 */

/**
 * Dados mínimos para criar uma conta. Os demais campos do modelo possuem valor
 * padrão no schema (`emailVerified=false`, `role=USER`, `status=ACTIVE`,
 * `failedLoginAttempts=0`). A senha já deve chegar **com hash** — o repositório
 * não realiza hashing.
 */
export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

/** Busca um usuário pelo e-mail (campo único). Retorna `null` se inexistente. */
export function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

/** Busca um usuário pelo identificador. Retorna `null` se inexistente. */
export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/** Cria uma conta de usuário com os dados informados. */
export function create(data: CreateUserData): Promise<User> {
  return prisma.user.create({ data });
}

/**
 * Atualização genérica de um usuário. Use as funções de conveniência abaixo
 * para mutações comuns; este `update` cobre os demais casos sem multiplicar a
 * superfície do repositório.
 */
export function update(
  id: string,
  data: Prisma.UserUpdateInput,
): Promise<User> {
  return prisma.user.update({ where: { id }, data });
}

/** Define o estado (ativo/inativo) da conta (Req. 14.2, 14.3). */
export function updateStatus(
  id: string,
  status: AccountStatus,
): Promise<User> {
  return prisma.user.update({ where: { id }, data: { status } });
}

/** Atualiza o hash de senha (alteração/redefinição de senha — Req. 3.2, 3.4). */
export function updatePasswordHash(
  id: string,
  passwordHash: string,
): Promise<User> {
  return prisma.user.update({ where: { id }, data: { passwordHash } });
}

/** Marca (ou desmarca) o e-mail como verificado (Req. 1.4). */
export function setEmailVerified(
  id: string,
  emailVerified = true,
): Promise<User> {
  return prisma.user.update({ where: { id }, data: { emailVerified } });
}

/** Promove o e-mail principal da conta após confirmação (Req. 4.5). */
export function updateEmail(id: string, email: string): Promise<User> {
  return prisma.user.update({ where: { id }, data: { email } });
}

/**
 * Incrementa atomicamente o contador de tentativas de login mal-sucedidas
 * (Req. 2.2). O incremento é feito no banco para evitar condições de corrida.
 */
export function incrementFailedLoginAttempts(id: string): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: { increment: 1 } },
  });
}

/**
 * Zera o contador de tentativas e remove qualquer bloqueio vigente
 * (Req. 2.9 — reinício após autenticação bem-sucedida).
 */
export function resetLoginAttempts(id: string): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

/**
 * Persiste o estado de bloqueio calculado pela máquina de tentativas de login
 * do domínio (`failedLoginAttempts` e `lockedUntil`). Passar `lockedUntil=null`
 * remove o bloqueio (Req. 2.6, 2.8).
 */
export function setLoginState(
  id: string,
  failedLoginAttempts: number,
  lockedUntil: Date | null,
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data: { failedLoginAttempts, lockedUntil },
  });
}
