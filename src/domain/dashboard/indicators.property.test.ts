import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  computeSavingsRate,
  computeExpenseVariation,
  topExpenseCategory,
} from "@/domain/dashboard/indicators";
import {
  type Month,
  type Transaction,
  type TransactionType,
} from "@/domain/types";

/**
 * Teste de propriedade — Indicadores financeiros do mês (Dashboard).
 *
 * Feature: financial-management-platform, Property 15: Indicadores financeiros do mês
 *
 * *Para qualquer* conjunto de lançamentos do mês corrente e do mês anterior:
 * - a **taxa de economia** é igual a `Resultado_Mensal / Receitas_do_mês * 100`
 *   (ou indisponível quando o total de receitas é zero);
 * - a **variação de despesas** é igual a
 *   `(despesas_do_mês − despesas_do_mês_anterior) / despesas_do_mês_anterior * 100`
 *   (ou indisponível quando as despesas do mês anterior são zero);
 * - a **categoria de maior despesa** é aquela com maior valor acumulado de
 *   Despesa no mês civil (UTC), com desempate pelo `categoryId`
 *   lexicograficamente menor; `null` quando não há despesas no mês.
 *
 * As fórmulas são verificadas por **igualdade exata** com a expressão de
 * referência (a implementação não arredonda).
 *
 * Validates: Requirements 5.5, 5.8
 */

// ---------------------------------------------------------------------------
// Geradores de valores monetários (centavos)
// ---------------------------------------------------------------------------

/**
 * Valor em centavos podendo ser negativo (Resultado_Mensal pode ser negativo
 * quando as despesas superam as receitas). Faixa limitada para manter a
 * aritmética legível; a igualdade exata independe da magnitude.
 */
const signedMoneyArb = fc.integer({ min: -100_000_000, max: 100_000_000 });

/**
 * Valor não negativo que inclui explicitamente `0` com boa frequência, para
 * exercitar tanto o ramo `'UNAVAILABLE'` (divisão por zero) quanto o ramo
 * numérico.
 */
const nonNegativeMoneyArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 100_000_000 }) },
);

// ---------------------------------------------------------------------------
// Property 15a — taxa de economia
// ---------------------------------------------------------------------------

describe("Property 15: indicadores financeiros do mês — taxa de economia", () => {
  it("indisponível quando receitas = 0; senão = (resultado/receitas)*100 (exato)", () => {
    fc.assert(
      fc.property(signedMoneyArb, nonNegativeMoneyArb, (monthlyResult, monthlyIncome) => {
        const rate = computeSavingsRate(monthlyResult, monthlyIncome);

        if (monthlyIncome === 0) {
          expect(rate).toBe("UNAVAILABLE");
          return;
        }

        expect(rate).toBe((monthlyResult / monthlyIncome) * 100);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15b — variação de despesas
// ---------------------------------------------------------------------------

describe("Property 15: indicadores financeiros do mês — variação de despesas", () => {
  it("indisponível quando despesas anteriores = 0; senão = ((cur-prev)/prev)*100 (exato)", () => {
    fc.assert(
      fc.property(
        nonNegativeMoneyArb,
        nonNegativeMoneyArb,
        (currentExpense, previousExpense) => {
          const variation = computeExpenseVariation(currentExpense, previousExpense);

          if (previousExpense === 0) {
            expect(variation).toBe("UNAVAILABLE");
            return;
          }

          expect(variation).toBe(
            ((currentExpense - previousExpense) / previousExpense) * 100,
          );
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15c — categoria de maior despesa
// ---------------------------------------------------------------------------

/** Mês civil-alvo determinístico (junho de 2026). */
const TARGET_MONTH: Month = { year: 2026, month: 6 };

/**
 * Janela de datas cobrindo de abril a setembro de 2026 (UTC), de modo que os
 * lançamentos gerados caiam dentro e fora do mês-alvo.
 */
const WINDOW_START = Date.UTC(2026, 3, 1, 0, 0, 0, 0); // 2026-04-01
const WINDOW_END = Date.UTC(2026, 8, 1, 0, 0, 0, 0); // 2026-09-01

const typeArb = fc.constantFrom<TransactionType>("INCOME", "EXPENSE");

/** Poucas categorias para forçar agrupamento e empates. */
const categoryIdArb = fc.constantFrom("cat-0", "cat-1", "cat-2", "cat-3");

/** Valores pequenos para tornar empates de valor acumulado mais prováveis. */
const amountArb = fc.integer({ min: 1, max: 100 });

/** Data dentro da janela (alguns lançamentos no mês-alvo, outros fora). */
const dateMsArb = fc.integer({ min: WINDOW_START, max: WINDOW_END });

interface TxSeed {
  type: TransactionType;
  categoryId: string;
  amount: number;
  dateMs: number;
}

const txSeedArb: fc.Arbitrary<TxSeed> = fc.record({
  type: typeArb,
  categoryId: categoryIdArb,
  amount: amountArb,
  dateMs: dateMsArb,
});

function buildTransactions(seeds: TxSeed[]): Transaction[] {
  return seeds.map((seed, index) => ({
    id: `tx-${index}`,
    userId: "user-1",
    categoryId: seed.categoryId,
    type: seed.type,
    description: "lançamento",
    amount: seed.amount,
    date: new Date(seed.dateMs),
    recurrenceId: null,
    createdAt: new Date(seed.dateMs),
  }));
}

const transactionsArb: fc.Arbitrary<Transaction[]> = fc
  .array(txSeedArb, { maxLength: 30 })
  .map(buildTransactions);

/**
 * Oráculo independente: agrupa por `categoryId` as Despesas no mês civil-alvo
 * (UTC), soma, e elege a categoria de maior soma com desempate pelo
 * `categoryId` lexicograficamente menor. Devolve `null` se não houver despesas.
 */
function expectedTopExpenseCategory(
  txs: Transaction[],
  month: Month,
): string | null {
  const totals = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== "EXPENSE") {
      continue;
    }
    const d = tx.date;
    if (d.getUTCFullYear() !== month.year || d.getUTCMonth() + 1 !== month.month) {
      continue;
    }
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount);
  }

  let best: string | null = null;
  let bestTotal = -Infinity;
  for (const [categoryId, total] of totals) {
    if (
      best === null ||
      total > bestTotal ||
      (total === bestTotal && categoryId < best)
    ) {
      best = categoryId;
      bestTotal = total;
    }
  }
  return best;
}

describe("Property 15: indicadores financeiros do mês — categoria de maior despesa", () => {
  it("= categoria de Despesa com maior soma no mês (UTC), desempate lexicográfico; null sem despesas", () => {
    fc.assert(
      fc.property(transactionsArb, (txs) => {
        const actual = topExpenseCategory(txs, TARGET_MONTH);
        const expected = expectedTopExpenseCategory(txs, TARGET_MONTH);
        expect(actual).toBe(expected);
      }),
    );
  });
});
