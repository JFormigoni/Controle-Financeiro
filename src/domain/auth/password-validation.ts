/**
 * Validação de **comprimento de senha** — domínio puro de autenticação.
 *
 * Implementa as regras de tamanho de senha da Plataforma como funções puras,
 * totais e determinísticas, sem qualquer I/O. São usadas tanto no cadastro
 * quanto na alteração/redefinição de senha (design.md, "Serviço de
 * Autenticação"; requirements.md, critérios 1.5, 3.2, 3.4, 3.7).
 *
 * Há duas regras distintas:
 *
 * 1. **Cadastro** ({@link validateRegistrationPassword}): a senha deve ter
 *    entre {@link PASSWORD_MIN_LENGTH} e {@link PASSWORD_MAX_LENGTH} caracteres,
 *    inclusive (8 a 64). Senhas mais curtas ou mais longas são rejeitadas e a
 *    mensagem informa o critério de tamanho (Req. 1.5).
 * 2. **Alteração/Redefinição** ({@link validateNewPassword}): a nova senha deve
 *    ter no mínimo {@link PASSWORD_MIN_LENGTH} caracteres (8), **sem limite
 *    superior**. As regras de redefinição (Req. 3.2, 3.7) e de alteração
 *    (Req. 3.4) especificam apenas o mínimo de 8 caracteres.
 *
 * ## Definição de "comprimento"
 *
 * O comprimento é medido em **unidades de código UTF-16**, exatamente como
 * `String.prototype.length` do JavaScript. Essa é a mesma métrica usada por
 * `bcrypt` e pela validação de schema (Zod) na fronteira, garantindo decisões
 * consistentes em toda a pilha. Caracteres fora do Plano Multilíngue Básico
 * (ex.: emojis) ocupam duas unidades de código UTF-16 e, portanto, contam como
 * 2 para fins de tamanho. Optou-se por `String.length` em vez de contagem de
 * pontos de código por simplicidade, previsibilidade e alinhamento com o
 * restante da stack; o limite superior de 64 unidades é amplo o bastante para
 * senhas legítimas.
 */

import { type ValidationResult, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes de comprimento
// ---------------------------------------------------------------------------

/** Comprimento mínimo de senha, em unidades de código UTF-16 (Req. 1.5, 3.2, 3.4, 3.7). */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Comprimento máximo de senha **no cadastro**, em unidades de código UTF-16
 * (Req. 1.5). Não se aplica à alteração/redefinição, que possui apenas mínimo.
 */
export const PASSWORD_MAX_LENGTH = 64;

/** Mensagem do critério de tamanho no cadastro (faixa fechada [8, 64]). */
const REGISTRATION_MESSAGE = `A senha deve ter entre ${PASSWORD_MIN_LENGTH} e ${PASSWORD_MAX_LENGTH} caracteres.`;

/** Mensagem do critério de tamanho na alteração/redefinição (mínimo 8). */
const NEW_PASSWORD_MESSAGE = `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`;

// ---------------------------------------------------------------------------
// Validações
// ---------------------------------------------------------------------------

/**
 * Valida o comprimento de uma senha **no cadastro** (Req. 1.5).
 *
 * Retorna sucesso se e somente se o comprimento estiver na faixa fechada
 * [{@link PASSWORD_MIN_LENGTH}, {@link PASSWORD_MAX_LENGTH}] (8 a 64 unidades de
 * código UTF-16). Caso contrário, retorna um erro `VALIDATION` no campo
 * `password` informando o critério de tamanho.
 *
 * @param password Senha informada no formulário de cadastro.
 * @returns `ok(undefined)` quando válida; `err(VALIDATION, ...)` caso contrário.
 */
export function validateRegistrationPassword(
  password: string,
): ValidationResult<void> {
  const length = password.length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    return err("VALIDATION", REGISTRATION_MESSAGE, "password");
  }
  return ok(undefined);
}

/**
 * Valida o comprimento de uma **nova senha** na alteração ou redefinição
 * (Req. 3.2, 3.4, 3.7).
 *
 * Retorna sucesso se e somente se o comprimento for no mínimo
 * {@link PASSWORD_MIN_LENGTH} (8 unidades de código UTF-16). **Não há limite
 * superior** neste fluxo. Caso contrário, retorna um erro `VALIDATION` no campo
 * `password` informando o critério mínimo de tamanho.
 *
 * @param password Nova senha informada na alteração/redefinição.
 * @returns `ok(undefined)` quando válida; `err(VALIDATION, ...)` caso contrário.
 */
export function validateNewPassword(
  password: string,
): ValidationResult<void> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return err("VALIDATION", NEW_PASSWORD_MESSAGE, "password");
  }
  return ok(undefined);
}
