/**
 * Geração e validação de token anti-CSRF (Req. 16.3, 16.4).
 *
 * Operações que **alteram estado** exigem um token anti-CSRF presente, válido e
 * **vinculado à Sessão** do usuário (design.md, "Camada de Segurança
 * Transversal"). Este módulo implementa a lógica pura desse token; a fronteira
 * (server actions) apenas obtém o `sessionId` da sessão atual, o token enviado
 * pelo cliente e o segredo do servidor, e delega a decisão para
 * {@link validateCsrfToken}.
 *
 * ## Esquema de vínculo e expiração (token assinado / stateless)
 *
 * O token é **autocontido e assinado por HMAC-SHA256**, sem necessidade de
 * armazenamento por requisição. Seu valor serializado tem o formato:
 *
 * ```text
 *   <expiresAtMs>.<assinaturaHex>
 * ```
 *
 * - `expiresAtMs` — instante de expiração em milissegundos epoch.
 * - `assinaturaHex` — `HMAC-SHA256(secret, "<sessionId>:<expiresAtMs>")` em
 *   hexadecimal (64 caracteres).
 *
 * O **vínculo à sessão** é garantido porque o `sessionId` entra na mensagem
 * assinada: um token emitido para a sessão A produz uma assinatura diferente da
 * esperada para a sessão B, logo nunca é aceito em outra sessão. A **expiração**
 * também está coberta pela assinatura — o cliente não pode estender o prazo sem
 * conhecer o `secret`, pois `expiresAtMs` faz parte da mensagem autenticada.
 *
 * ## Pureza e determinismo
 *
 * - {@link validateCsrfToken} e {@link isCsrfTokenValid} são **puras e
 *   determinísticas**: dadas as mesmas entradas (`sessionId`, `token`, `now`,
 *   `secret`) sempre produzem o mesmo resultado. Isso permite o teste baseado
 *   em propriedades (Property 41) sem mocks nem I/O.
 * - {@link generateCsrfToken} é determinística dado um `now` explícito; o único
 *   componente não puro é a leitura opcional do segredo do ambiente quando
 *   `secret` é omitido (uso de servidor). Para uso determinístico/testes,
 *   **passe o `secret` explicitamente**.
 *
 * O uso de criptografia fica restrito a `node:crypto` (lado servidor). Este
 * módulo não acessa banco de dados, e-mail nem rede.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { type ValidationResult, err, isOk, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Tempo de vida padrão de um token anti-CSRF, em milissegundos.
 *
 * Alinhado à janela de inatividade de Sessão de 30 minutos (Req. 2.5): um token
 * não deve sobreviver à sessão à qual está vinculado. Pode ser sobrescrito por
 * chamada via `ttlMs` em {@link generateCsrfToken}.
 */
export const DEFAULT_CSRF_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Separador entre a expiração e a assinatura no valor serializado do token. */
const TOKEN_SEPARATOR = ".";

/** Comprimento (em caracteres hex) de uma assinatura HMAC-SHA256 (32 bytes). */
const SIGNATURE_HEX_LENGTH = 64;

/** Reconhece uma assinatura hexadecimal bem-formada de 64 caracteres. */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/** Reconhece um inteiro não negativo (instante de expiração em ms). */
const EXPIRES_PATTERN = /^\d+$/;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Token anti-CSRF vinculado a uma sessão, com instante de expiração.
 *
 * `value` é a forma serializada (`<expiresAtMs>.<assinaturaHex>`) que trafega
 * entre cliente e servidor; `sessionId` e `expiresAt` são expostos para
 * conveniência e inspeção.
 */
export interface CsrfToken {
  /** Identificador da Sessão à qual o token está vinculado. */
  sessionId: string;
  /** Instante de expiração em milissegundos epoch. */
  expiresAt: number;
  /** Valor serializado: `<expiresAtMs>.<assinaturaHex>`. */
  value: string;
}

/** Parâmetros de {@link validateCsrfToken}. */
export interface ValidateCsrfParams {
  /** Identificador da Sessão atual (obtido da sessão autenticada). */
  sessionId: string;
  /** Valor do token apresentado na requisição; ausente quando não enviado. */
  token: string | null | undefined;
  /** Instante atual usado para verificar a expiração. */
  now: Date;
  /** Segredo HMAC do servidor; quando omitido, resolvido do ambiente. */
  secret?: string;
}

// ---------------------------------------------------------------------------
// Segredo
// ---------------------------------------------------------------------------

/**
 * Resolve o segredo HMAC. Quando `secret` é fornecido, é usado diretamente
 * (caminho puro/determinístico, usado nos testes). Quando omitido, lê
 * `AUTH_SECRET` do ambiente do servidor.
 */
function resolveSecret(secret?: string): string {
  if (secret !== undefined && secret !== "") {
    return secret;
  }
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv === undefined || fromEnv === "") {
    throw new Error(
      "Segredo anti-CSRF ausente: forneça `secret` ou defina AUTH_SECRET.",
    );
  }
  return fromEnv;
}

/**
 * Calcula a assinatura HMAC-SHA256 (hex) que vincula `sessionId` e `expiresAt`.
 * Esta é a única fonte de verdade do vínculo sessão↔token.
 */
function sign(sessionId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${sessionId}:${expiresAt}`)
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

/**
 * Gera um token anti-CSRF vinculado a `sessionId`, válido por `ttlMs` a partir
 * de `now`.
 *
 * Determinística dado `now`, `secret` e `ttlMs` — não usa aleatoriedade, pois a
 * imprevisibilidade vem do segredo HMAC do servidor.
 *
 * @param sessionId Identificador da Sessão à qual vincular o token.
 * @param now Instante de emissão.
 * @param secret Segredo HMAC; quando omitido, lido de `AUTH_SECRET`.
 * @param ttlMs Tempo de vida em ms; padrão {@link DEFAULT_CSRF_TOKEN_TTL_MS}.
 */
export function generateCsrfToken(
  sessionId: string,
  now: Date,
  secret?: string,
  ttlMs: number = DEFAULT_CSRF_TOKEN_TTL_MS,
): CsrfToken {
  const resolvedSecret = resolveSecret(secret);
  const expiresAt = now.getTime() + ttlMs;
  const signature = sign(sessionId, expiresAt, resolvedSecret);
  return {
    sessionId,
    expiresAt,
    value: `${expiresAt}${TOKEN_SEPARATOR}${signature}`,
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Compara duas assinaturas hexadecimais de mesmo comprimento em **tempo
 * constante**, evitando vazamento por temporização. Pressupõe que ambas já
 * passaram pelo formato esperado (64 hex).
 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida um token anti-CSRF para uma requisição que altera estado.
 *
 * O token é aceito **se e somente se** todas as condições abaixo forem
 * verdadeiras (Property 41 / Req. 16.3, 16.4):
 *
 * 1. **Presente** — `token` não nulo/indefinido e não vazio.
 * 2. **Bem-formado** — formato `<expiresAtMs>.<assinaturaHex>` com expiração
 *    inteira e assinatura de 64 caracteres hex.
 * 3. **Vinculado à sessão e autêntico** — a assinatura confere com o HMAC
 *    recomputado sobre `sessionId`+`expiresAt`; um token de outra sessão ou
 *    adulterado nunca confere.
 * 4. **Não expirado** — `now` é anterior a `expiresAt`.
 *
 * Em qualquer outro caso, retorna `FORBIDDEN` (erro de autorização) e a
 * fronteira deve **não alterar o estado** (Req. 16.4). A função é pura.
 */
export function validateCsrfToken(
  params: ValidateCsrfParams,
): ValidationResult<void> {
  const { sessionId, token, now } = params;

  // 1. Presença.
  if (token === null || token === undefined || token.trim() === "") {
    return err("FORBIDDEN", "Token anti-CSRF ausente.");
  }

  // 2. Boa formação estrutural.
  const parts = token.split(TOKEN_SEPARATOR);
  if (parts.length !== 2) {
    return err("FORBIDDEN", "Token anti-CSRF inválido.");
  }
  const expiresRaw = parts[0] ?? "";
  const signatureRaw = parts[1] ?? "";
  if (
    !EXPIRES_PATTERN.test(expiresRaw) ||
    signatureRaw.length !== SIGNATURE_HEX_LENGTH ||
    !SIGNATURE_PATTERN.test(signatureRaw)
  ) {
    return err("FORBIDDEN", "Token anti-CSRF inválido.");
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt)) {
    return err("FORBIDDEN", "Token anti-CSRF inválido.");
  }

  // 3. Autenticidade e vínculo à sessão (recomputa o HMAC esperado).
  const secret = resolveSecret(params.secret);
  const expected = sign(sessionId, expiresAt, secret);
  if (!constantTimeEquals(signatureRaw, expected)) {
    return err("FORBIDDEN", "Token anti-CSRF inválido.");
  }

  // 4. Expiração (instante atual deve ser anterior à expiração).
  if (now.getTime() >= expiresAt) {
    return err("FORBIDDEN", "Token anti-CSRF expirado.");
  }

  return ok(undefined);
}

/**
 * Conveniência booleana para {@link validateCsrfToken}: `true` se e somente se
 * o token for aceito. Pura e determinística.
 */
export function isCsrfTokenValid(params: ValidateCsrfParams): boolean {
  return isOk(validateCsrfToken(params));
}
