/**
 * Consentimento LGPD no cadastro (domínio puro).
 *
 * Implementa a lógica de **registro de consentimento** ao tratamento de dados
 * pessoais e o **bloqueio da conclusão do cadastro** quando o consentimento
 * não é fornecido, conforme a LGPD:
 *
 * - Req. 16.9 — ao se cadastrar, a Plataforma apresenta o termo de tratamento
 *   de dados e registra o consentimento com **data, hora e versão do termo**.
 * - Req. 16.10 — sem consentimento, a conclusão do cadastro é **bloqueada** e
 *   informa-se que o consentimento é obrigatório.
 *
 * Este módulo é **puro** (sem I/O): recebe a entrada do usuário e o instante
 * atual e retorna um {@link ValidationResult}. A persistência do
 * {@link ConsentRecordData} (modelo Prisma `ConsentRecord`) ocorre na fronteira
 * (serviço de cadastro, tarefa 5.2), que reutiliza {@link validateConsent}.
 *
 * Referências: design.md, "Camada de Segurança Transversal (Req. 16)" e o
 * modelo `ConsentRecord` (`userId`, `termsVersion`, `consentedAt`).
 */

import { type Result, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Entrada de consentimento submetida no cadastro.
 *
 * - `accepted`     — indica se o usuário aceitou o termo de tratamento de dados.
 * - `termsVersion` — versão do termo apresentado ao usuário (ex.: "2026-01").
 */
export interface ConsentInput {
  /** Verdadeiro somente quando o usuário aceita explicitamente o termo. */
  accepted: boolean;
  /** Versão do termo de tratamento de dados apresentado (não vazia). */
  termsVersion: string;
}

/**
 * Dados do consentimento prontos para persistência (`ConsentRecord`).
 *
 * Captura a **versão do termo** e o instante (**data e hora**) em que o
 * consentimento foi registrado, conforme exigido pela LGPD (Req. 16.9).
 */
export interface ConsentRecordData {
  /** Versão do termo efetivamente consentido (sem espaços nas bordas). */
  termsVersion: string;
  /** Data e hora do registro do consentimento. */
  consentedAt: Date;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/**
 * Mensagem exibida quando o consentimento é obrigatório e não foi fornecido
 * (Req. 16.10).
 */
export const CONSENT_REQUIRED_MESSAGE =
  "O consentimento ao tratamento de dados pessoais é obrigatório para concluir o cadastro.";

/** Mensagem para versão de termo ausente/inválida (falha de apresentação do termo). */
export const TERMS_VERSION_REQUIRED_MESSAGE =
  "A versão do termo de tratamento de dados é obrigatória.";

// ---------------------------------------------------------------------------
// Predicados
// ---------------------------------------------------------------------------

/**
 * Verdadeiro somente quando o usuário forneceu o consentimento de forma
 * explícita (`accepted === true`). Útil como guarda na fronteira de cadastro.
 */
export function isConsentGiven(input: ConsentInput): boolean {
  return input.accepted === true;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida o consentimento LGPD e produz o registro a ser persistido.
 *
 * Retorna sucesso com um {@link ConsentRecordData} (capturando a versão do
 * termo e `consentedAt = now`) **se e somente se** o usuário aceitou o termo
 * (`accepted === true`) e `termsVersion` é uma string não vazia. Caso
 * contrário, retorna falha — o que **bloqueia a conclusão do cadastro**
 * (Req. 16.10):
 *
 * - `accepted !== true` → `FORBIDDEN` (consentimento obrigatório não fornecido).
 * - `termsVersion` vazia → `VALIDATION` (termo não apresentado corretamente).
 * - `now` inválido → `VALIDATION` (instante de registro inválido).
 *
 * A função é pura e determinística: o instante de registro é injetado via
 * `now`, e o `Date` retornado é uma cópia para evitar aliasing/mutação.
 *
 * @param input Entrada de consentimento do cadastro.
 * @param now   Instante atual (data e hora) do registro do consentimento.
 */
export function validateConsent(
  input: ConsentInput,
  now: Date,
): Result<ConsentRecordData> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return err("VALIDATION", "Instante de registro do consentimento inválido.");
  }

  if (!isConsentGiven(input)) {
    return err("FORBIDDEN", CONSENT_REQUIRED_MESSAGE, "consent");
  }

  const termsVersion = input.termsVersion.trim();
  if (termsVersion.length === 0) {
    return err("VALIDATION", TERMS_VERSION_REQUIRED_MESSAGE, "termsVersion");
  }

  return ok({
    termsVersion,
    // Cópia defensiva: preserva data e hora sem expor a referência original.
    consentedAt: new Date(now.getTime()),
  });
}
