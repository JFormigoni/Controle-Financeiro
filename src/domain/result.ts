/**
 * Modelo de Resultado (`Result`) e erros de aplicação compartilhados.
 *
 * A camada de domínio e de aplicação usa um tipo `Result<T>` discriminado em
 * vez de exceções para erros esperados (validação, autorização, conflito,
 * etc.). Isso torna o fluxo de erro explícito e verificável pelo compilador,
 * mantendo a camada de domínio pura e determinística.
 *
 * Referência: design.md, seção "Error Handling".
 */

/**
 * Categorias de erro da aplicação. O código orienta o mapeamento para status
 * HTTP na fronteira e a mensagem exibida ao usuário.
 *
 * - `VALIDATION`    — entrada inválida (400).
 * - `UNAUTHORIZED`  — sessão ausente/expirada (401).
 * - `FORBIDDEN`     — sem permissão / não é dono / falha anti-CSRF (403).
 * - `NOT_FOUND`     — recurso inexistente (404).
 * - `CONFLICT`      — duplicidade, ex.: e-mail ou categoria (409).
 * - `LOCKED`        — login bloqueado / conta inativa (423).
 * - `RATE_LIMITED`  — limite de reenvio excedido (429).
 * - `INTERNAL`      — falha de infraestrutura (500).
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LOCKED"
  | "RATE_LIMITED"
  | "INTERNAL";

/**
 * Erro de aplicação seguro para exibição. `field` identifica o campo de
 * entrada associado a erros de validação (ex.: "email", "amount").
 */
export interface AppError {
  /** Categoria do erro. */
  code: ErrorCode;
  /** Mensagem segura para exibição ao usuário (não revela detalhes sensíveis). */
  message: string;
  /** Campo de entrada associado a um erro de validação, quando aplicável. */
  field?: string;
}

/**
 * Resultado discriminado de uma operação que pode falhar.
 *
 * - `{ ok: true; value }`  — sucesso, com o valor produzido.
 * - `{ ok: false; error }` — falha, com o `AppError` correspondente.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

/**
 * Resultado de uma validação pura. Estruturalmente idêntico a `Result<T>`;
 * o alias documenta a intenção nas assinaturas de funções de validação do
 * domínio (ex.: `validatePasswordLength(p): ValidationResult<void>`).
 */
export type ValidationResult<T> = Result<T>;

/** Constrói um resultado de sucesso contendo `value`. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Constrói um `AppError`. Conveniência para uso com {@link err}. */
export function appError(
  code: ErrorCode,
  message: string,
  field?: string,
): AppError {
  return { code, message, field };
}

/**
 * Constrói um resultado de falha.
 *
 * Aceita um `AppError` já montado ou os componentes individuais
 * (`code`, `message`, `field`) por conveniência. O parâmetro de tipo tem
 * padrão `never`, de modo que o resultado é atribuível a qualquer `Result<X>`.
 */
export function err<T = never>(error: AppError): Result<T>;
export function err<T = never>(
  code: ErrorCode,
  message: string,
  field?: string,
): Result<T>;
export function err<T = never>(
  errorOrCode: AppError | ErrorCode,
  message?: string,
  field?: string,
): Result<T> {
  const error: AppError =
    typeof errorOrCode === "string"
      ? appError(errorOrCode, message ?? "", field)
      : errorOrCode;
  return { ok: false, error };
}

/** Type guard: verdadeiro quando `result` é um sucesso. */
export function isOk<T>(
  result: Result<T>,
): result is { ok: true; value: T } {
  return result.ok;
}

/** Type guard: verdadeiro quando `result` é uma falha. */
export function isErr<T>(
  result: Result<T>,
): result is { ok: false; error: AppError } {
  return !result.ok;
}
