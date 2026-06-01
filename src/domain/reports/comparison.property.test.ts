import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  buildMonthlyComparison,
  buildAnnualComparison,
} from "@/domain/reports/comparison";
import { type Transaction, type TransactionType } from "@/domain/types";

/**
 * Teste de propriedade — Conservação de soma nos comparativos.
 *
 * Feature: financial-management-platform, Property 28: Conservação de soma nos comparativos
 *
 * *Para qualquer* conjunto de Lançamentos e intervalo `[start, end]` (com
 * `start <= end`), o comparativo — mensal ({@link buildMonthlyComparison}) ou
 * anual ({@link buildAnnualComparison}) — distribui cada Lançamento em faixa em
 * **exatamente um** agrupamento. Logo:
 *
 * - a soma das Receitas de todas as linhas é **igual** ao total de Receitas dos
 *   Lançamentos dentro de `[start, end]`;
 * - a soma das Despesas de todas as linhas é **igual** ao total de Despesas dos
 *   Lançamentos dentro de `[start, end]`; e
 * - não há contagem em duplicidade: a soma de `(income + expense)` sobre todas
 *   as linhas é **igual** ao total de `(income + expense)` em faixa.
 *
 * As expectativas (totais em faixa) são calculadas de forma **independente** da
 * implementação sob teste, varrendo os Lançamentos e aplicando a mesma regra de
 * pertinência ao intervalo fechado/inclusivo. Os geradores produzem datas
 * dentro e fora de `[start, end]`, com tipos misturados (Receita/Despesa).
 *
 * Validates: Requirements 10.3, 10.4
 */

// ---------------------------------------------------------------------------
// Constantes e geradores (smart generators)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** ~366 dias: garante straddle de fronteiras de mês e de ano. */
const YEAR_MS = 366 * DAY_MS;

/** Extrai o tipo do valor gerado por um {@link fc.Arbitrary}. */
type ArbValue<A> = A extends fc.Arbitrary<infer T> ? T : never;

/** Instante de referência plausível (ms desde a época), em faixa segura. */
const baseTimeArb = fc.integer({
  min: Date.UTC(2018, 0, 1),
  max: Date.UTC(2032, 0, 1),
});

const typeArb = fc.constantFrom<TransactionType>("INCOME", "EXPENSE");

/** Valor de lançamento válido (centavos) em faixa que mantém somas exatas. */
const amountArb = fc.integer({ min: 1, max: 100_000_000 });

/**
 * Especificação de um Lançamento independente do intervalo concreto: o tipo, o
 * valor, qual âncora temporal usar (`anchorIdx`, resolvido módulo a lista de
 * âncoras montada no corpo do teste) e um jitter sobre a âncora. O jitter
 * mistura deslocamentos de pouquíssimos milissegundos (para cair exatamente
 * dentro/fora da fronteira inclusiva) com deslocamentos de até ±2 dias (para
 * straddle de fronteiras de mês/ano).
 */
const txSpecArb = fc.record({
  type: typeArb,
  amount: amountArb,
  anchorIdx: fc.integer({ min: 0, max: 9 }),
  jitter: fc.oneof(
    fc.constantFrom(-2, -1, 0, 1, 2),
    fc.integer({ min: -2 * DAY_MS, max: 2 * DAY_MS }),
  ),
});

const txSpecsArb = fc.array(txSpecArb, { maxLength: 30 });

type TxSpec = ArbValue<typeof txSpecArb>;

/**
 * Especificação do intervalo `[start, end]`: âncora de início e uma duração
 * não-negativa, garantindo `start <= end`. A duração chega a ~3 anos para
 * cobrir múltiplos meses e anos civis no comparativo.
 */
const rangeSpecArb = fc.record({
  startOffset: fc.integer({ min: -2 * YEAR_MS, max: 2 * YEAR_MS }),
  duration: fc.integer({ min: 0, max: 3 * YEAR_MS }),
});

type RangeSpec = ArbValue<typeof rangeSpecArb>;

/** Monta o intervalo concreto a partir da especificação e da âncora `base`. */
function buildRange(spec: RangeSpec, baseMs: number): { start: Date; end: Date } {
  const startMs = baseMs + spec.startOffset;
  return {
    start: new Date(startMs),
    end: new Date(startMs + spec.duration),
  };
}

/**
 * Monta Lançamentos a partir das especificações e de uma lista de âncoras (ms).
 * As âncoras incluem instantes dentro e fora de `[start, end]`, de modo que o
 * conjunto gerado contenha Lançamentos em faixa e fora de faixa.
 */
function buildTransactions(specs: TxSpec[], anchors: number[]): Transaction[] {
  return specs.map((s, i) => {
    const anchor = anchors[s.anchorIdx % anchors.length] ?? anchors[0] ?? 0;
    return {
      id: `t${i}`,
      userId: "u",
      categoryId: "c",
      type: s.type,
      description: "x",
      amount: s.amount,
      date: new Date(anchor + s.jitter),
      recurrenceId: null,
      createdAt: new Date(0),
    };
  });
}

/** Pertinência ao intervalo fechado/inclusivo `[start, end]` (ms). */
function withinInclusive(t: number, startMs: number, endMs: number): boolean {
  return !Number.isNaN(t) && t >= startMs && t <= endMs;
}

/** Totais de Receitas/Despesas dos Lançamentos em faixa, calculados à parte. */
function inRangeTotals(
  txs: Transaction[],
  startMs: number,
  endMs: number,
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (!withinInclusive(tx.date.getTime(), startMs, endMs)) {
      continue;
    }
    if (tx.type === "INCOME") {
      income += tx.amount;
    } else {
      expense += tx.amount;
    }
  }
  return { income, expense };
}

/**
 * Constrói âncoras a partir do intervalo: extremos e vizinhanças (para hits e
 * misses na fronteira inclusiva), o meio do intervalo, e pontos bem fora.
 */
function anchorsFor(startMs: number, endMs: number): number[] {
  const mid = startMs + Math.floor((endMs - startMs) / 2);
  return [
    startMs,
    endMs,
    startMs - 1,
    endMs + 1,
    mid,
    startMs - 30 * DAY_MS,
    endMs + 30 * DAY_MS,
    startMs - YEAR_MS,
    endMs + YEAR_MS,
    mid + DAY_MS,
  ];
}

// ---------------------------------------------------------------------------
// Property 28 — Comparativo mensal (Req. 10.3)
// ---------------------------------------------------------------------------

describe("Property 28: conservação de soma no comparativo mensal", () => {
  it("a soma das linhas mensais iguala os totais em faixa (sem perda nem duplicidade)", () => {
    fc.assert(
      fc.property(baseTimeArb, rangeSpecArb, txSpecsArb, (baseMs, rangeSpec, specs) => {
        const { start, end } = buildRange(rangeSpec, baseMs);
        const startMs = start.getTime();
        const endMs = end.getTime();

        const txs = buildTransactions(specs, anchorsFor(startMs, endMs));

        const expected = inRangeTotals(txs, startMs, endMs);

        const rows = buildMonthlyComparison(txs, start, end);

        const sumIncome = rows.reduce((acc, r) => acc + r.income, 0);
        const sumExpense = rows.reduce((acc, r) => acc + r.expense, 0);

        // Conservação por tipo.
        expect(sumIncome).toBe(expected.income);
        expect(sumExpense).toBe(expected.expense);

        // Sem dupla contagem: soma total das linhas = total em faixa.
        const sumAll = rows.reduce((acc, r) => acc + r.income + r.expense, 0);
        expect(sumAll).toBe(expected.income + expected.expense);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28 — Comparativo anual (Req. 10.4)
// ---------------------------------------------------------------------------

describe("Property 28: conservação de soma no comparativo anual", () => {
  it("a soma das linhas anuais iguala os totais em faixa (sem perda nem duplicidade)", () => {
    fc.assert(
      fc.property(baseTimeArb, rangeSpecArb, txSpecsArb, (baseMs, rangeSpec, specs) => {
        const { start, end } = buildRange(rangeSpec, baseMs);
        const startMs = start.getTime();
        const endMs = end.getTime();

        const txs = buildTransactions(specs, anchorsFor(startMs, endMs));

        const expected = inRangeTotals(txs, startMs, endMs);

        const rows = buildAnnualComparison(txs, start, end);

        const sumIncome = rows.reduce((acc, r) => acc + r.income, 0);
        const sumExpense = rows.reduce((acc, r) => acc + r.expense, 0);

        expect(sumIncome).toBe(expected.income);
        expect(sumExpense).toBe(expected.expense);

        const sumAll = rows.reduce((acc, r) => acc + r.income + r.expense, 0);
        expect(sumAll).toBe(expected.income + expected.expense);
      }),
    );
  });

  it("mensal e anual conservam o mesmo total agregado em faixa", () => {
    fc.assert(
      fc.property(baseTimeArb, rangeSpecArb, txSpecsArb, (baseMs, rangeSpec, specs) => {
        const { start, end } = buildRange(rangeSpec, baseMs);
        const txs = buildTransactions(specs, anchorsFor(start.getTime(), end.getTime()));

        const monthly = buildMonthlyComparison(txs, start, end);
        const annual = buildAnnualComparison(txs, start, end);

        const monthlyAll = monthly.reduce((acc, r) => acc + r.income + r.expense, 0);
        const annualAll = annual.reduce((acc, r) => acc + r.income + r.expense, 0);

        expect(monthlyAll).toBe(annualAll);
      }),
    );
  });
});
