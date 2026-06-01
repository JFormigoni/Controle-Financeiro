/**
 * Validade de token de uso único (Req. 1.3, 1.4, 1.6, 3.1, 3.2, 3.3).
 *
 * Tokens de verificação de e-mail, redefinição de senha e alteração de e-mail
 * são de **uso único** e têm **expiração** dependente da finalidade (24h para
 * verificação de e-mail e alteração de e-mail, 1h para redefinição de senha).
 * Este módulo concentra a lógica **pura e total** dessas regras: decidir se um
 * token é válido em um instante, marcar um token como usado de forma imutável e
 * calcular o instante de expiração a partir da finalidade e do instante de
 * emissão.
 *
 * A camada de fronteira (serviços de autenticação/perfil) carrega o token
 * persistido (modelo Prisma `VerificationToken`), delega a decisão para
 * {@link isTokenValid} e, após um uso bem-sucedido, persiste o token marcado
 * por {@link markTokenUsed}. Nenhuma função aqui acessa banco de dados, relógio
 * implícito, e-mail ou rede — o `now` é sempre passado explicitamente, o que
 * mantem o módulo determinístico e testável por propriedade (Property 2).
 *
 * ## Semântica de fronteira de expiração
 *
 * A expiração é tratada como um limite **exclusivo** em relação a `now`:
 *
 * - `now < expiresAt`  → ainda **válido** (não expirado).
 * - `now >= expiresAt` → **expirado** (o instante exato de expiração já não é
 *   aceito).
 *
 * Combinada com a flag `used`, a regra completa de validade é:
 * **válido se e somente se `!used && now < expiresAt`**.
 */

import type { TokenPurpose } from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Token de verificação de uso único, espelhando os campos relevantes do modelo
 * Prisma `VerificationToken` (design.md, "Data Models").
 *
 * Apenas os campos necessários à lógica de domínio são modelados; o
 * `tokenHash`, o `id` e o `userId` pertencem à camada de persistência e não
 * influenciam a decisão de validade.
 */
export interface VerificationToken {
  /** Finalidade do token; determina o tempo de vida aplicável. */
  purpose: TokenPurpose;
  /** Instante de expiração; o token é válido enquanto `now < expiresAt`. */
  expiresAt: Date;
  /** `true` após um uso bem-sucedido; um token usado nunca volta a ser válido. */
  used: boolean;
  /** Instante de emissão do token (opcional; informativo). */
  createdAt?: Date;
}

// ---------------------------------------------------------------------------
// Tempos de vida (TTL) por finalidade
// ---------------------------------------------------------------------------

/** Um minuto em milissegundos. */
const MINUTE_MS = 60 * 1000;

/** Uma hora em milissegundos. */
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Tempo de vida do token de **verificação de e-mail**: 24 horas (Req. 1.3).
 */
export const EMAIL_VERIFICATION_TTL_MS = 24 * HOUR_MS;

/**
 * Tempo de vida do token de **redefinição de senha**: 1 hora (Req. 3.1).
 */
export const PASSWORD_RESET_TTL_MS = 1 * HOUR_MS;

/**
 * Tempo de vida do token de **alteração de e-mail**: 24 horas (Req. 4.4).
 */
export const EMAIL_CHANGE_TTL_MS = 24 * HOUR_MS;

/**
 * Mapa total de finalidade → tempo de vida em milissegundos. Mantido exaustivo
 * sobre {@link TokenPurpose} para que a adição de uma nova finalidade gere erro
 * de compilação até que seu TTL seja definido.
 */
const TTL_BY_PURPOSE: Record<TokenPurpose, number> = {
  EMAIL_VERIFICATION: EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET: PASSWORD_RESET_TTL_MS,
  EMAIL_CHANGE: EMAIL_CHANGE_TTL_MS,
};

/**
 * Retorna o tempo de vida, em milissegundos, aplicável a uma finalidade de
 * token. Função pura e total.
 */
export function ttlForPurpose(purpose: TokenPurpose): number {
  return TTL_BY_PURPOSE[purpose];
}

// ---------------------------------------------------------------------------
// Cálculo de expiração
// ---------------------------------------------------------------------------

/**
 * Calcula o instante de expiração de um token a partir de sua finalidade e do
 * instante de emissão, codificando as regras de 24h/1h:
 *
 * - `EMAIL_VERIFICATION` → `issuedAt + 24h`.
 * - `PASSWORD_RESET`     → `issuedAt + 1h`.
 * - `EMAIL_CHANGE`       → `issuedAt + 24h`.
 *
 * Pura e determinística: não lê o relógio do sistema. Retorna sempre uma nova
 * instância de `Date`, sem mutar `issuedAt`.
 */
export function computeExpiry(purpose: TokenPurpose, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + ttlForPurpose(purpose));
}

// ---------------------------------------------------------------------------
// Validade e consumo
// ---------------------------------------------------------------------------

/**
 * Decide se um token de uso único é válido no instante `now`.
 *
 * Retorna `true` **se e somente se** o token ainda não foi usado e o instante
 * atual é anterior à sua expiração — isto é, `!used && now < expiresAt`
 * (Property 2 / Req. 1.4, 1.6, 3.2, 3.3).
 *
 * A fronteira de expiração é exclusiva: quando `now` é exatamente `expiresAt`,
 * o token já é considerado expirado.
 *
 * Aceita qualquer objeto que exponha `used` e `expiresAt`, de modo a operar
 * tanto sobre {@link VerificationToken} quanto sobre o registro Prisma cru.
 */
export function isTokenValid(
  token: { used: boolean; expiresAt: Date },
  now: Date,
): boolean {
  return !token.used && now.getTime() < token.expiresAt.getTime();
}

/**
 * Marca um token como usado, retornando uma **cópia** com `used = true` sem
 * mutar a entrada (imutabilidade).
 *
 * Após o consumo, {@link isTokenValid} sempre retorna `false` para o token
 * resultante, qualquer que seja `now` — o que garante a propriedade de uso
 * único: um token bem-sucedido nunca é aceito novamente (Property 2 / Req. 3.3).
 *
 * Genérica sobre `T extends { used: boolean }` para preservar os demais campos
 * do token (finalidade, expiração, identificadores de persistência, etc.).
 */
export function markTokenUsed<T extends { used: boolean }>(token: T): T {
  return { ...token, used: true };
}
