/**
 * Validação de **perfil** — domínio puro do Serviço de Perfil.
 *
 * Implementa a regra de validação do campo **nome** na atualização de dados
 * pessoais como uma função pura, total e determinística, sem qualquer I/O
 * (design.md, "Serviço de Perfil"; requirements.md, critérios 4.1 e 4.3).
 *
 * Regra (Req. 4.1, 4.3):
 *
 * - O nome é **obrigatório** e deve conter de {@link NAME_MIN_LENGTH} a
 *   {@link NAME_MAX_LENGTH} caracteres (1 a 100).
 * - Nome vazio (ou somente espaços) → rejeição com critério "vazio".
 * - Nome acima de {@link NAME_MAX_LENGTH} → rejeição com critério "muito longo".
 *
 * Em caso de rejeição, a função apenas retorna um {@link ValidationResult} de
 * falha; **não persiste nem altera dado algum**. A garantia de que os dados
 * atuais permanecem inalterados (Req. 4.3) é responsabilidade da fronteira
 * (serviço de atualização de perfil, tarefa 7.3), que só persiste quando esta
 * validação retorna sucesso.
 *
 * ## Normalização: aparar (trim) antes de medir
 *
 * O comprimento é medido sobre o nome **aparado** (sem espaços em branco nas
 * bordas), por duas razões alinhadas ao texto dos requisitos:
 *
 * 1. Req. 4.1 exige o campo "preenchido"; Req. 4.3 rejeita o campo "vazio". Um
 *    nome composto apenas de espaços não está, de fato, preenchido — após o
 *    `trim` ele se torna vazio (comprimento 0) e é corretamente rejeitado.
 * 2. O valor persistido deve ser o nome normalizado, sem espaços supérfluos nas
 *    bordas. Por isso {@link ProfileData} carrega o nome já aparado.
 *
 * Assim, a aceitação ocorre **se e somente se** o comprimento do nome aparado
 * estiver na faixa fechada [1, 100] (Property 11). O comprimento é medido em
 * unidades de código UTF-16 (`String.prototype.length`), a mesma métrica usada
 * pela validação de schema (Zod) na fronteira, garantindo decisões consistentes
 * em toda a pilha.
 */

import { type ValidationResult, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes de comprimento
// ---------------------------------------------------------------------------

/** Comprimento mínimo do nome de perfil, em unidades de código UTF-16 (Req. 4.1, 4.3). */
export const NAME_MIN_LENGTH = 1;

/** Comprimento máximo do nome de perfil, em unidades de código UTF-16 (Req. 4.1, 4.3). */
export const NAME_MAX_LENGTH = 100;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Entrada de atualização de perfil submetida pelo usuário.
 *
 * Por ora o único campo obrigatório validado é o {@link ProfileInput.name}
 * (Req. 4.1, 4.3). Demais dados pessoais/configurações são tratados em fluxos
 * próprios (configurações da conta em 4.2; alteração de e-mail em 4.4–4.6).
 */
export interface ProfileInput {
  /** Nome informado pelo usuário (será aparado e validado para 1..100 caracteres). */
  name: string;
}

/**
 * Dados de perfil validados e **normalizados**, prontos para persistência.
 *
 * O `name` já está aparado (sem espaços nas bordas) e com comprimento garantido
 * na faixa [{@link NAME_MIN_LENGTH}, {@link NAME_MAX_LENGTH}].
 */
export interface ProfileData {
  /** Nome normalizado (aparado), com 1 a 100 caracteres. */
  name: string;
}

// ---------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------

/** Mensagem para nome obrigatório ausente/vazio (Req. 4.3). */
export const NAME_REQUIRED_MESSAGE = "O nome é obrigatório.";

/** Mensagem para nome que excede o comprimento máximo permitido (Req. 4.3). */
export const NAME_TOO_LONG_MESSAGE = `O nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`;

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida a atualização de perfil quanto ao campo **nome** (Req. 4.1, 4.3).
 *
 * Retorna sucesso com {@link ProfileData} contendo o nome normalizado **se e
 * somente se** o nome aparado tiver comprimento na faixa fechada
 * [{@link NAME_MIN_LENGTH}, {@link NAME_MAX_LENGTH}]. Caso contrário, retorna um
 * erro `VALIDATION` no campo `name` indicando o critério violado:
 *
 * - aparado vazio (comprimento 0) → {@link NAME_REQUIRED_MESSAGE};
 * - aparado acima de {@link NAME_MAX_LENGTH} → {@link NAME_TOO_LONG_MESSAGE}.
 *
 * A função é pura, total e determinística; **nunca muta** `input`.
 *
 * @param input Entrada de atualização de perfil.
 * @returns `ok(ProfileData)` quando válido; `err(VALIDATION, ...)` caso contrário.
 */
export function validateProfileUpdate(
  input: ProfileInput,
): ValidationResult<ProfileData> {
  const name = input.name.trim();

  if (name.length < NAME_MIN_LENGTH) {
    return err("VALIDATION", NAME_REQUIRED_MESSAGE, "name");
  }
  if (name.length > NAME_MAX_LENGTH) {
    return err("VALIDATION", NAME_TOO_LONG_MESSAGE, "name");
  }

  return ok({ name });
}
