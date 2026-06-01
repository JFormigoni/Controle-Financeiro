/**
 * Validação de **lançamento** (Receita/Despesa) e de **valor** — domínio puro.
 *
 * Implementa, como funções puras, totais e determinísticas (sem qualquer I/O),
 * as regras de validação de um Lançamento financeiro compartilhadas por
 * Receitas (Req. 6) e Despesas (Req. 7). Como as regras das duas são
 * **espelhadas**, a validação é parametrizada pelo {@link TransactionType}
 * (`INCOME` / `EXPENSE`), conforme o design ("Serviço de Lançamentos —
 * Receitas e Despesas").
 *
 * Um lançamento é aceito **se e somente se** (Property 16):
 *
 * 1. a descrição tiver de 1 a 200 caracteres (Req. 6.1/7.1, 6.8/7.8);
 * 2. o valor for numérico e estiver entre 0,01 e 999.999.999,99 (Req. 6.4/7.4);
 * 3. a data for uma data de calendário válida (Req. 6.1/7.1, 6.8/7.8);
 * 4. a categoria estiver informada (Req. 6.8/7.8).
 *
 * Caso contrário, é **rejeitado** com um erro `VALIDATION` que identifica o
 * campo ofensor (`field`), **sem lançar exceção e sem mutar a entrada** — os
 * dados informados são preservados pelo chamador para reapresentação no
 * formulário (Req. 6.4/6.8, 7.4/7.8).
 *
 * A correspondência da categoria ao tipo e ao dono (Req. 6.9/7.9) e a
 * verificação de propriedade da conta (Req. 6.7/7.7) são responsabilidades da
 * fronteira (tarefas 9.3 e 10.1) e **não** pertencem a esta validação pura.
 *
 * ## Política de "campos brutos" da entrada
 *
 * A entrada modela dados ainda **não normalizados** vindos do formulário:
 *
 * - `amount` e `date` são tipados como `unknown` para que a validação seja
 *   **total** — qualquer valor (ausente, de tipo inesperado, mal-formado) é
 *   tratado sem lançar exceção, cobrindo "valor ausente"/"data ausente"
 *   (Req. 6.8/7.8) e "valor não numérico" (Req. 6.4/7.4).
 * - `description` e `categoryId` são strings; ausência é representada por
 *   string vazia (campo não preenchido no formulário).
 *
 * ## Política de espaços em branco (trim)
 *
 * - **Descrição**: espaços nas bordas são removidos antes da medição de
 *   comprimento; uma descrição vazia ou composta somente de espaços é
 *   **rejeitada** (Req. 6.8/7.8). O comprimento é medido em unidades de código
 *   UTF-16 (`String.prototype.length`), consistente com o restante da stack.
 * - **Categoria**: o identificador tem as bordas aparadas; um `categoryId`
 *   vazio ou somente com espaços é tratado como **categoria não informada**
 *   (Req. 6.8/7.8).
 *
 * Referências: design.md ("Serviço de Lançamentos", "Tipos de Domínio");
 * requirements.md (Req. 6.1, 6.2, 6.4, 6.8, 7.1, 7.2, 7.4, 7.8). A faixa de
 * valor reutiliza os utilitários de `@/domain/money`.
 */

import { type Money, type TransactionType } from "@/domain/types";
import { type ValidationResult, err, ok } from "@/domain/result";
import { isValidAmount, parseDecimalToCents } from "@/domain/money";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Entrada **bruta** de um lançamento, como submetida no formulário de Receita
 * ou Despesa (antes da normalização).
 *
 * - `description` — texto livre; 1 a 200 caracteres após `trim` (Req. 6.1/7.1).
 * - `amount`      — valor monetário bruto. Espera-se `string` decimal (ex.:
 *   `"1234.56"`, como retornado por `Decimal(12,2)` do Prisma) ou `number` de
 *   reais; qualquer outro valor é rejeitado como não numérico (Req. 6.4/7.4).
 * - `date`        — data bruta. Espera-se um `Date` ou uma `string` parseável
 *   como data de calendário; valores ausentes/inválidos são rejeitados
 *   (Req. 6.8/7.8).
 * - `categoryId`  — identificador da categoria selecionada; vazio significa
 *   categoria não informada (Req. 6.8/7.8).
 */
export interface TransactionInput {
  /** Descrição livre do lançamento (1..200 caracteres após `trim`). */
  description: string;
  /** Valor monetário bruto (`string` decimal ou `number` de reais). */
  amount: unknown;
  /** Data bruta do lançamento (`Date` ou `string` de data de calendário). */
  date: unknown;
  /** Identificador da categoria; vazio = categoria não informada. */
  categoryId: string;
}

/**
 * Lançamento **normalizado e validado**, pronto para a fronteira persistir.
 *
 * Produzido por {@link validateTransaction} apenas quando todos os campos são
 * válidos. O `amount` já está em **centavos** inteiros, a `date` é uma cópia
 * defensiva de um `Date` válido e o `type` (Receita/Despesa) é incorporado.
 */
export interface TransactionData {
  /** Descrição normalizada (sem espaços nas bordas), 1..200 caracteres. */
  description: string;
  /** Valor em centavos inteiros, na faixa [0,01; 999.999.999,99]. */
  amount: Money;
  /** Data de calendário válida (cópia defensiva). */
  date: Date;
  /** Identificador da categoria informada (sem espaços nas bordas). */
  categoryId: string;
  /** Tipo do lançamento (Receita ou Despesa). */
  type: TransactionType;
}

// ---------------------------------------------------------------------------
// Constantes e mensagens
// ---------------------------------------------------------------------------

/** Comprimento mínimo da descrição, em unidades de código UTF-16 (Req. 6.1/7.1). */
export const DESCRIPTION_MIN_LENGTH = 1;

/** Comprimento máximo da descrição, em unidades de código UTF-16 (Req. 6.1/7.1). */
export const DESCRIPTION_MAX_LENGTH = 200;

/** Mensagem para descrição ausente ou composta apenas de espaços (Req. 6.8/7.8). */
export const DESCRIPTION_REQUIRED_MESSAGE = "A descrição é obrigatória.";

/** Mensagem para descrição que excede o comprimento máximo (Req. 6.1/7.1). */
export const DESCRIPTION_LENGTH_MESSAGE = `A descrição deve ter entre ${DESCRIPTION_MIN_LENGTH} e ${DESCRIPTION_MAX_LENGTH} caracteres.`;

/**
 * Mensagem única para valor ausente, não numérico ou fora da faixa
 * (Req. 6.4/7.4): o valor deve estar entre 0,01 e 999.999.999,99.
 */
export const AMOUNT_RANGE_MESSAGE =
  "O valor deve estar entre 0,01 e 999.999.999,99.";

/** Mensagem para data ausente ou que não representa uma data de calendário válida (Req. 6.8/7.8). */
export const DATE_INVALID_MESSAGE =
  "A data deve ser uma data de calendário válida.";

/** Mensagem para categoria não informada (Req. 6.8/7.8). */
export const CATEGORY_REQUIRED_MESSAGE = "A categoria é obrigatória.";

// ---------------------------------------------------------------------------
// Validação de valor
// ---------------------------------------------------------------------------

/**
 * Valida um **valor monetário** bruto e o normaliza para centavos inteiros
 * (Req. 6.4/7.4).
 *
 * Aceita `string` decimal (separador `.`) ou `number` de reais; converte com
 * {@link parseDecimalToCents} e confirma a faixa com {@link isValidAmount}.
 * Retorna `ok(cents)` **se e somente se** a entrada for numérica e o resultado
 * estiver na faixa fechada [0,01; 999.999.999,99] (1 .. 99_999_999_999
 * centavos). Qualquer outro caso — tipo inesperado, formato inválido, ≤ 0 ou
 * acima do máximo — resulta em `err(VALIDATION, ..., "amount")`.
 *
 * Pura e total: não lança exceção para nenhuma entrada.
 *
 * @param amount Valor bruto (`string` ou `number`).
 * @returns `ok` com o valor em centavos; `err` `VALIDATION` no campo `amount`.
 */
export function validateAmount(amount: unknown): ValidationResult<Money> {
  if (typeof amount !== "string" && typeof amount !== "number") {
    return err("VALIDATION", AMOUNT_RANGE_MESSAGE, "amount");
  }

  const parsed = parseDecimalToCents(amount);
  if (!parsed.ok) {
    return err("VALIDATION", AMOUNT_RANGE_MESSAGE, "amount");
  }

  if (!isValidAmount(parsed.value)) {
    return err("VALIDATION", AMOUNT_RANGE_MESSAGE, "amount");
  }

  return ok(parsed.value);
}

// ---------------------------------------------------------------------------
// Validação de data (auxiliar pura)
// ---------------------------------------------------------------------------

/**
 * Converte uma data bruta em um `Date` de calendário válido, ou `null` quando
 * a entrada é ausente/inválida.
 *
 * - `Date` instância → aceito se não for `Invalid Date` (cópia defensiva).
 * - `string` → aparada; vazia é rejeitada; do contrário usa `Date.parse`,
 *   aceitando apenas quando o instante resultante não é `NaN`. Datas de
 *   calendário inexistentes (ex.: `"2026-02-30"`) produzem `NaN` e são
 *   rejeitadas.
 * - qualquer outro tipo → `null`.
 */
function parseCalendarDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }
    const timestamp = Date.parse(trimmed);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validação de lançamento
// ---------------------------------------------------------------------------

/**
 * Valida uma entrada de **lançamento** (Receita ou Despesa) e produz os dados
 * normalizados prontos para persistência (Property 16).
 *
 * Verifica, nesta ordem, descrição (1..200 após `trim`), valor (numérico e na
 * faixa [0,01; 999.999.999,99]), data (data de calendário válida) e categoria
 * (informada), retornando o **primeiro** campo ofensor em caso de falha. O
 * parâmetro `type` é incorporado ao resultado porque as regras de Receita e
 * Despesa são espelhadas e parametrizadas pelo tipo (Req. 6 e 7).
 *
 * Pura e total: **não lança exceção** e **não muta** `input`; em caso de erro,
 * os dados informados permanecem intactos para o chamador reapresentá-los
 * (Req. 6.4/6.8, 7.4/7.8).
 *
 * @param input Entrada bruta do formulário de lançamento.
 * @param type  Tipo do lançamento (`INCOME` para Receita, `EXPENSE` para Despesa).
 * @returns `ok(TransactionData)` quando válido; `err(VALIDATION, ..., field)`
 *          identificando o campo ofensor caso contrário.
 */
export function validateTransaction(
  input: TransactionInput,
  type: TransactionType,
): ValidationResult<TransactionData> {
  // 1. Descrição — 1..200 caracteres após `trim` (Req. 6.1/7.1, 6.8/7.8).
  const description = input.description.trim();
  if (description.length < DESCRIPTION_MIN_LENGTH) {
    return err("VALIDATION", DESCRIPTION_REQUIRED_MESSAGE, "description");
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return err("VALIDATION", DESCRIPTION_LENGTH_MESSAGE, "description");
  }

  // 2. Valor — numérico e na faixa [0,01; 999.999.999,99] (Req. 6.4/7.4).
  const amountResult = validateAmount(input.amount);
  if (!amountResult.ok) {
    return err(amountResult.error);
  }

  // 3. Data — data de calendário válida (Req. 6.1/7.1, 6.8/7.8).
  const date = parseCalendarDate(input.date);
  if (date === null) {
    return err("VALIDATION", DATE_INVALID_MESSAGE, "date");
  }

  // 4. Categoria — informada (Req. 6.8/7.8).
  const categoryId = input.categoryId.trim();
  if (categoryId.length === 0) {
    return err("VALIDATION", CATEGORY_REQUIRED_MESSAGE, "categoryId");
  }

  return ok({
    description,
    amount: amountResult.value,
    date,
    categoryId,
    type,
  });
}
