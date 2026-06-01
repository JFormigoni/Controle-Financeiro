/**
 * Indicadores financeiros do mês (domínio puro).
 *
 * Funções de cálculo dos indicadores de desempenho financeiro exibidos no
 * Dashboard para o mês civil corrente (Req. 5.5, 5.8):
 *
 * - **Taxa de economia** — razão percentual entre o Resultado_Mensal e o total
 *   de Receitas do mês; indisponível quando o total de receitas é zero.
 * - **Variação de despesas** — variação percentual do total de despesas do mês
 *   em relação ao mês anterior; indisponível quando as despesas do mês anterior
 *   são zero.
 * - **Categoria de maior despesa** — a categoria de Despesa com maior valor
 *   acumulado no mês civil informado.
 *
 * ## Formato dos percentuais
 *
 * As taxas são retornadas como **percentuais** (multiplicadas por 100), no
 * mesmo sentido do enunciado de Req. 5.5 ("razão percentual"). Por exemplo, uma
 * taxa de economia de 25% é retornada como o número `25` (e não `0,25`). Os
 * valores podem ser **negativos**: a taxa de economia é negativa quando as
 * despesas do mês superam as receitas (Resultado_Mensal < 0), e a variação de
 * despesas é negativa quando as despesas diminuem em relação ao mês anterior.
 * O literal `'UNAVAILABLE'` sinaliza um indicador indisponível por divisão por
 * zero (não confundir com `0`, que é um percentual válido).
 *
 * ## Mês civil determinístico (UTC)
 *
 * A pertinência de um lançamento a um {@link Month} é avaliada por seus
 * **componentes UTC** (`getUTCFullYear`/`getUTCMonth`), tornando o filtro
 * **independente de fuso horário** e **determinístico**, em linha com a
 * aritmética de datas do {@link module:domain/recurrence Motor de Recorrência}.
 * `Month.month` é 1..12 (janeiro = 1); internamente é comparado com
 * `getUTCMonth() + 1`.
 *
 * ## Pureza e totalidade
 *
 * Todas as funções são **puras e totais**: não leem o relógio do sistema, não
 * lançam exceções e não mutam suas entradas. Lançamentos com data inválida
 * (`NaN`) são ignorados em {@link topExpenseCategory}.
 *
 * Referência: design.md, "Serviço de Dashboard (Req. 5)" e "Property 15:
 * Indicadores financeiros do mês".
 */

import { type Money, type Month, type Transaction } from "@/domain/types";

// ---------------------------------------------------------------------------
// Taxa de economia (Req. 5.5, 5.8)
// ---------------------------------------------------------------------------

/**
 * Calcula a **taxa de economia** do mês como a razão percentual entre o
 * Resultado_Mensal e o total de Receitas do mês:
 *
 * ```
 * taxa = (monthlyResult / monthlyIncome) * 100
 * ```
 *
 * Ambos os argumentos são valores em centavos (`Money`). O resultado é um
 * **percentual** (ver a documentação do módulo) que pode ser negativo quando o
 * Resultado_Mensal é negativo. Quando `monthlyIncome` é exatamente zero, a taxa
 * é **indisponível** e a função retorna `'UNAVAILABLE'` (Req. 5.8).
 *
 * @param monthlyResult Resultado_Mensal em centavos (receitas − despesas do mês).
 * @param monthlyIncome Total de Receitas do mês, em centavos.
 * @returns O percentual da taxa de economia, ou `'UNAVAILABLE'` se `monthlyIncome === 0`.
 */
export function computeSavingsRate(
  monthlyResult: Money,
  monthlyIncome: Money,
): number | "UNAVAILABLE" {
  if (monthlyIncome === 0) {
    return "UNAVAILABLE";
  }
  return (monthlyResult / monthlyIncome) * 100;
}

// ---------------------------------------------------------------------------
// Variação de despesas (Req. 5.5)
// ---------------------------------------------------------------------------

/**
 * Calcula a **variação percentual** do total de despesas do mês corrente em
 * relação ao mês anterior:
 *
 * ```
 * variação = ((currentExpense - previousExpense) / previousExpense) * 100
 * ```
 *
 * Ambos os argumentos são valores de despesa em centavos (`Money`). O resultado
 * é um **percentual** (ver a documentação do módulo): positivo quando as
 * despesas aumentam, negativo quando diminuem. Quando `previousExpense` é
 * exatamente zero, a variação é **indisponível** (divisão por zero) e a função
 * retorna `'UNAVAILABLE'`.
 *
 * @param currentExpense Total de despesas do mês corrente, em centavos.
 * @param previousExpense Total de despesas do mês anterior, em centavos.
 * @returns O percentual da variação, ou `'UNAVAILABLE'` se `previousExpense === 0`.
 */
export function computeExpenseVariation(
  currentExpense: Money,
  previousExpense: Money,
): number | "UNAVAILABLE" {
  if (previousExpense === 0) {
    return "UNAVAILABLE";
  }
  return ((currentExpense - previousExpense) / previousExpense) * 100;
}

// ---------------------------------------------------------------------------
// Categoria de maior despesa (Req. 5.5)
// ---------------------------------------------------------------------------

/**
 * Verdadeiro quando `date` é um objeto `Date` com instante válido.
 * Lançamentos com data inválida são descartados do cálculo.
 */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Verdadeiro quando a data do lançamento pertence ao mês civil `month`,
 * avaliada por componentes UTC (independente de fuso). `month.month` é 1..12.
 */
function isInMonthUTC(date: Date, month: Month): boolean {
  return (
    date.getUTCFullYear() === month.year &&
    date.getUTCMonth() + 1 === month.month
  );
}

/**
 * Determina a **categoria de Despesa com maior valor acumulado** no mês civil
 * `month`.
 *
 * Considera apenas lançamentos do tipo `EXPENSE` com data válida pertencente ao
 * mês civil informado (UTC), somando seus `amount` (centavos) por `categoryId`.
 * Retorna o `categoryId` cuja soma é a maior; retorna `null` quando não há
 * nenhuma despesa no mês.
 *
 * ## Critério de desempate (determinístico)
 *
 * Em caso de empate no valor acumulado, vence o `categoryId` **lexicograficamente
 * menor** (ordem crescente de string, via `<`). Esse critério é total e
 * determinístico, garantindo o mesmo resultado independentemente da ordem dos
 * lançamentos na entrada.
 *
 * A função não muta `txs` e é total (não lança).
 *
 * @param txs Lançamentos do usuário (de qualquer tipo/período).
 * @param month Mês civil-alvo (`month` 1..12).
 * @returns O `categoryId` de maior despesa acumulada, ou `null` se não houver despesas no mês.
 */
export function topExpenseCategory(
  txs: Transaction[],
  month: Month,
): string | null {
  const totalsByCategory = new Map<string, Money>();

  for (const tx of txs) {
    if (tx.type !== "EXPENSE") {
      continue;
    }
    if (!isValidDate(tx.date) || !isInMonthUTC(tx.date, month)) {
      continue;
    }
    const previous = totalsByCategory.get(tx.categoryId) ?? 0;
    totalsByCategory.set(tx.categoryId, previous + tx.amount);
  }

  let topCategory: string | null = null;
  let topTotal = 0;

  for (const [categoryId, total] of totalsByCategory) {
    if (
      topCategory === null ||
      total > topTotal ||
      // Desempate determinístico: menor `categoryId` em ordem lexicográfica.
      (total === topTotal && categoryId < topCategory)
    ) {
      topCategory = categoryId;
      topTotal = total;
    }
  }

  return topCategory;
}
