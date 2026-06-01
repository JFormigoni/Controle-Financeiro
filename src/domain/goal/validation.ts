/**
 * Validação de **Meta Financeira** no cadastro/edição — domínio puro (Req. 9).
 *
 * Implementa, como função **pura, total e determinística** (sem I/O), a regra
 * de aceitação de uma Meta_Financeira informada pelo Usuário, conforme os
 * critérios de aceitação do Requisito 9:
 *
 * - **9.1** — uma meta com descrição de 1 a 100 caracteres, valor-alvo entre
 *   R$ 0,01 e R$ 999.999.999,99 e prazo posterior à data atual é registrada
 *   com **progresso inicial de 0%** (valor acumulado inicial igual a 0).
 * - **9.5** — se o prazo for **igual ou anterior** ao instante atual, o
 *   cadastro é rejeitado, informando que o prazo deve ser posterior à data
 *   atual.
 * - **9.6** — se o valor-alvo for **menor ou igual a zero**, o cadastro é
 *   rejeitado, informando que o valor-alvo deve ser positivo.
 * - **9.7** — a edição de uma meta existente com **dados válidos** persiste as
 *   alterações; esta validação é reutilizada por criação e edição (a borda
 *   aplica autorização/posse antes de persistir).
 *
 * O instante atual é **injetado** via parâmetro `now`, mantendo a função
 * determinística e testável (design.md, "Serviço de Metas":
 * `validateGoal(input, now): ValidationResult<GoalData>`). A conversão do
 * valor-alvo decimal para **centavos inteiros** delega a {@link parseDecimalToCents},
 * e a faixa válida corresponde a [{@link MIN_AMOUNT_CENTS}, {@link MAX_AMOUNT_CENTS}]
 * (R$ 0,01 .. R$ 999.999.999,99).
 *
 * ## Política de comprimento e `trim` da descrição
 *
 * A descrição é **normalizada por `trim`** (remoção de espaços em branco nas
 * extremidades) antes da verificação de comprimento, e o {@link GoalData}
 * resultante carrega a forma já normalizada. O comprimento considerado é o da
 * string **após** o `trim`, medido em unidades de código UTF-16
 * (`String.prototype.length`), e deve estar na faixa fechada
 * [{@link GOAL_DESC_MIN}, {@link GOAL_DESC_MAX}] (1 a 100). Assim, uma descrição
 * composta apenas por espaços é tratada como vazia e rejeitada.
 *
 * ## Pureza
 *
 * A função **não muta** a entrada nem o `now`: o prazo retornado é uma **cópia
 * defensiva** (`new Date(...)`) e a descrição é uma nova string normalizada.
 */

import { type Money } from "@/domain/types";
import { type ValidationResult, err, ok } from "@/domain/result";
import {
  MAX_AMOUNT_CENTS,
  MIN_AMOUNT_CENTS,
  parseDecimalToCents,
} from "@/domain/money";

// ---------------------------------------------------------------------------
// Constantes de comprimento da descrição
// ---------------------------------------------------------------------------

/** Comprimento mínimo (após `trim`) da descrição de uma meta (Req. 9.1). */
export const GOAL_DESC_MIN = 1;

/** Comprimento máximo (após `trim`) da descrição de uma meta (Req. 9.1). */
export const GOAL_DESC_MAX = 100;

// ---------------------------------------------------------------------------
// Mensagens (seguras para exibição ao usuário)
// ---------------------------------------------------------------------------

/** Critério de comprimento da descrição (faixa fechada [1, 100]). */
export const GOAL_DESC_MESSAGE = `A descrição da meta deve ter entre ${GOAL_DESC_MIN} e ${GOAL_DESC_MAX} caracteres.`;

/** Valor-alvo menor ou igual a zero (Req. 9.6). */
export const GOAL_TARGET_POSITIVE_MESSAGE =
  "O valor-alvo da meta deve ser positivo.";

/** Valor-alvo em formato inválido ou fora da faixa suportada (Req. 9.1). */
export const GOAL_TARGET_RANGE_MESSAGE =
  "O valor-alvo da meta deve estar entre R$ 0,01 e R$ 999.999.999,99.";

/** Prazo igual ou anterior ao instante atual (Req. 9.5). */
export const GOAL_DEADLINE_FUTURE_MESSAGE =
  "O prazo da meta deve ser posterior à data atual.";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Entrada de cadastro/edição de uma Meta_Financeira, como recebida na fronteira
 * (formulário/server action), antes da normalização para o domínio.
 *
 * - `description`  — texto livre informado pelo usuário (validado por comprimento
 *   após `trim`).
 * - `targetAmount` — valor-alvo em reais, como `string` decimal (ex.: `"1500.00"`,
 *   compatível com `Decimal` do Prisma) ou `number`. É convertido para centavos
 *   inteiros por {@link parseDecimalToCents}.
 * - `deadline`     — prazo como `Date` ou `string` parseável por `Date` (ex.:
 *   ISO 8601). Deve ser estritamente posterior a `now`.
 */
export interface GoalInput {
  /** Descrição informada pelo usuário (1..100 caracteres após `trim`). */
  description: string;
  /** Valor-alvo em reais, como string decimal ou número. */
  targetAmount: string | number;
  /** Prazo da meta como `Date` ou string parseável por `Date`. */
  deadline: Date | string;
}

/**
 * Dados de uma meta **validados e normalizados**, prontos para persistência
 * (`Goal`) na fronteira. Não inclui `id`/`userId`/`createdAt`, atribuídos no
 * momento da persistência.
 *
 * Reflete o estado inicial de uma meta recém-cadastrada (Req. 9.1): valor
 * acumulado igual a 0 (**progresso inicial de 0%**, derivado por
 * `computeGoalProgress(0, targetAmount) === 0`) e `completed = false`.
 */
export interface GoalData {
  /** Descrição normalizada (sem espaços nas bordas), 1..100 caracteres. */
  description: string;
  /**
   * Valor-alvo em centavos inteiros, na faixa
   * [{@link MIN_AMOUNT_CENTS}, {@link MAX_AMOUNT_CENTS}].
   */
  targetAmount: Money;
  /** Valor acumulado inicial: sempre `0` centavos (progresso inicial de 0%). */
  accumulatedAmount: Money;
  /** Prazo da meta (cópia defensiva), estritamente posterior a `now`. */
  deadline: Date;
  /** Estado de conclusão inicial: sempre `false`. */
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida uma entrada de Meta_Financeira e produz os {@link GoalData}
 * normalizados para persistência.
 *
 * Retorna sucesso **se e somente se** (Req. 9.1, 9.5, 9.6, 9.7):
 *
 * 1. a descrição, após `trim`, tiver de {@link GOAL_DESC_MIN} a
 *    {@link GOAL_DESC_MAX} caracteres;
 * 2. o valor-alvo for um decimal bem-formado que, convertido para centavos,
 *    esteja na faixa fechada [{@link MIN_AMOUNT_CENTS}, {@link MAX_AMOUNT_CENTS}]
 *    (positivo e até R$ 999.999.999,99); e
 * 3. o prazo for uma data válida **estritamente posterior** a `now`.
 *
 * Em caso de falha, retorna um erro `VALIDATION` com o `field` ofensor e uma
 * mensagem segura para exibição:
 *
 * - `description` → {@link GOAL_DESC_MESSAGE};
 * - `targetAmount` → {@link GOAL_TARGET_POSITIVE_MESSAGE} (≤ 0) ou
 *   {@link GOAL_TARGET_RANGE_MESSAGE} (formato inválido / acima do máximo);
 * - `deadline` → {@link GOAL_DEADLINE_FUTURE_MESSAGE} (prazo inválido ou ≤ `now`).
 *
 * A função é pura e total: não muta `input` nem `now`. O `Date` retornado em
 * {@link GoalData.deadline} é uma cópia.
 *
 * @param input Entrada de cadastro/edição da meta.
 * @param now   Instante atual usado como referência para o prazo.
 */
export function validateGoal(
  input: GoalInput,
  now: Date,
): ValidationResult<GoalData> {
  // `now` deve ser um instante válido para que a comparação de prazo seja total.
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return err("VALIDATION", GOAL_DEADLINE_FUTURE_MESSAGE, "deadline");
  }

  // 1) Descrição: comprimento após `trim` em [GOAL_DESC_MIN, GOAL_DESC_MAX].
  const description = input.description.trim();
  if (
    description.length < GOAL_DESC_MIN ||
    description.length > GOAL_DESC_MAX
  ) {
    return err("VALIDATION", GOAL_DESC_MESSAGE, "description");
  }

  // 2) Valor-alvo: decimal -> centavos, positivo e dentro do máximo (Req. 9.6).
  const parsed = parseDecimalToCents(input.targetAmount);
  if (!parsed.ok) {
    return err("VALIDATION", GOAL_TARGET_RANGE_MESSAGE, "targetAmount");
  }
  const targetAmount = parsed.value;
  if (targetAmount < MIN_AMOUNT_CENTS) {
    // Inclui valores ≤ 0 (e frações abaixo de 1 centavo arredondadas para 0).
    return err("VALIDATION", GOAL_TARGET_POSITIVE_MESSAGE, "targetAmount");
  }
  if (targetAmount > MAX_AMOUNT_CENTS) {
    return err("VALIDATION", GOAL_TARGET_RANGE_MESSAGE, "targetAmount");
  }

  // 3) Prazo: data válida estritamente posterior a `now` (Req. 9.5).
  const deadline = coerceDate(input.deadline);
  if (deadline === null || deadline.getTime() <= now.getTime()) {
    return err("VALIDATION", GOAL_DEADLINE_FUTURE_MESSAGE, "deadline");
  }

  // Estado inicial (Req. 9.1): acumulado 0 (progresso 0%) e não concluída.
  return ok({
    description,
    targetAmount,
    accumulatedAmount: 0,
    deadline,
    completed: false,
  });
}

/**
 * Converte o prazo informado (`Date` ou `string`) em um `Date` válido (cópia),
 * ou `null` quando a entrada não representa uma data válida. Não muta a entrada.
 */
function coerceDate(value: Date | string): Date | null {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
