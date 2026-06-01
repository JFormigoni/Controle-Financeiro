import "server-only";

/**
 * Ponto único de acesso aos repositórios Prisma (camada de infraestrutura).
 *
 * Os repositórios são reexportados como **namespaces** porque compartilham
 * nomes de operação (`create`, `findByToken`, etc.); o agrupamento evita
 * colisões e torna o ponto de chamada explícito quanto à entidade acessada:
 *
 * ```ts
 * import { userRepository, sessionRepository } from "@/infra/repositories";
 *
 * const user = await userRepository.findByEmail(email);
 * await sessionRepository.deleteAllForUser(user.id);
 * ```
 *
 * Todos encapsulam consultas parametrizadas do Prisma (Req. 16.5) e são
 * `server-only`.
 */

export * as userRepository from "@/infra/repositories/user-repository";
export * as sessionRepository from "@/infra/repositories/session-repository";
export * as verificationTokenRepository from "@/infra/repositories/verification-token-repository";
