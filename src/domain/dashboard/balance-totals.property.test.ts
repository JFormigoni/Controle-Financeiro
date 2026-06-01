import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  computeTotals,
  computeMonthlyResult,
  resolvePeriod,
} from "@/domain/dashboard/balance";
import {
  type Month,
  type Period,
  type Transaction,
  type TransactionType,
} from "@/domain/types";

/**
 * Teste de propriedade — Totais por período e Resultado_Mensal.
 *
 * Feature: financial-management-platform, Property 13: Totais e resultado mensal por período
 *
 * *Para qualquer* conjunto de lançamentos e período selecionado:
 * - `computeTotals` considera **exatamente** os lançamentos do respectivo tipo
 *   (Receita/Despesa) cuja data pertence ao intervalo (inclusivo) resolvido por
 *   {@link resolvePeriod}, somando seus valores por tipo (Req. 5.2); e
 * - `computeMonthlyResult` de um mês civil é igual ao total de Receitas menos o
 *   total de Despesas daquele mês civil — `[primeiro instante, último instante]`
 *   em UTC (Req. 5.3).
 *
 * As expectativas são calculadas de forma **independente** da implementação,
 * porém derivando o intervalo de período a partir do próprio
 * {@link resolvePeriod} para que a convenção de fronteira (UTC, inclusiva)
 * coincida com a da implementação sob teste.
 *
 * Validates: Requirements 5.2, 5.3
 */

// ---------------------------------------------------------------------------
// Constantes e geradores (smart generators)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

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
 * Jitter aplicado sobre um instante-âncora. Mistura deslocamentos de pouquíssimos
 * milissegundos (para cair exatamente dentro/fora da fronteira inclusiva) com
 * deslocamentos de até ±2 dias (para straddle de fronteiras de mês/ano).
 */
const jitterArb = fc.oneof(
  fc.constantFrom(-2, -1, 0, 1, 2),
  fc.integer({ min: -2 * DAY_MS, max: 2 * DAY_MS }),
);

/**
 * Especificação de um lançamento independente do instante concreto: o tipo, o
 * valor, qual âncora temporal usar (`anchorIdx`, resolvido módulo a lista de
 * âncoras montada no corpo do teste), um deslocamento absoluto (para hits no
 * meio do intervalo) e o jitter sobre a âncora.
 */
const txSpecArb = fc.record({
  type: typeArb,
  amount: amountArb,
  anchorIdx: fc.integer({ min: 0, max: 9 }),
  absOffset: fc.integer({ min: -400 * DAY_MS, max: 400 * DAY_MS }),
  jitter: jitterArb,
});

const txSpecsArb = fc.array(txSpecArb, { maxLength: 25 });

type TxSpec = ArbValue<typeof txSpecArb>;

/** Monta lançamentos a partir das especificações e de uma lista de âncoras (ms). */
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
  return t >= startMs && t <= endMs;
}

// ---------------------------------------------------------------------------
// Especificação de período (todos os quatro tipos)
// ---------------------------------------------------------------------------

const periodSpecArb = fc.oneof(
  fc.constant({ kind: "CURRENT_MONTH" as const }),
  fc.constant({ kind: "PREVIOUS_MONTH" as const }),
  fc.constant({ kind: "CURRENT_YEAR" as const }),
  fc.record({
    kind: fc.constant("CUSTOM" as const),
    // start <= end garantido por duration >= 0; ambos próximos de `now`.
    startOffset: fc.integer({ min: -200 * DAY_MS, max: 200 * DAY_MS }),
    duration: fc.integer({ min: 0, max: 200 * DAY_MS }),
  }),
);

type PeriodSpec = ArbValue<typeof periodSpecArb>;

/** Resolve a especificação de período em um {@link Period} concreto. */
function buildPeriod(spec: PeriodSpec, nowMs: number): Period {
  if (spec.kind === "CUSTOM") {
    return {
      kind: "CUSTOM",
      start: new Date(nowMs + spec.startOffset),
      end: new Date(nowMs + spec.startOffset + spec.duration),
    };
  }
  return { kind: spec.kind };
}

// ---------------------------------------------------------------------------
// Property 13 — Totais por período (Req. 5.2)
// ---------------------------------------------------------------------------

describe("Property 13: computeTotals considera exatamente os lançamentos do tipo dentro do período", () => {
  it("income/expense igualam a soma independente filtrada pelo intervalo resolvido (inclusivo)", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        periodSpecArb,
        txSpecsArb,
        (nowMs, periodSpec, specs) => {
          const now = new Date(nowMs);
          const period = buildPeriod(periodSpec, nowMs);

          // A expectativa deriva o intervalo do próprio resolvePeriod, para
          // coincidir com a convenção de fronteira da implementação.
          const range = resolvePeriod(period, now);
          const startMs = range.start.getTime();
          const endMs = range.end.getTime();

          const anchors = [
            startMs,
            endMs,
            startMs - 1,
            endMs + 1,
            nowMs,
            nowMs + specs.length, // pequena variação determinística
          ];

          const txs = buildTransactions(specs, anchors);

          let expectedIncome = 0;
          let expectedExpense = 0;
          for (const tx of txs) {
            if (!withinInclusive(tx.date.getTime(), startMs, endMs)) {
              continue;
            }
            if (tx.type === "INCOME") {
              expectedIncome += tx.amount;
            } else {
              expectedExpense += tx.amount;
            }
          }

          const actual = computeTotals(txs, period, now);

          expect(actual.income).toBe(expectedIncome);
          expect(actual.expense).toBe(expectedExpense);
        },
      ),
    );
  });

  it("período padrão (sem argumento) equivale a CURRENT_MONTH para o mesmo now", () => {
    fc.assert(
      fc.property(baseTimeArb, txSpecsArb, (nowMs, specs) => {
        const now = new Date(nowMs);
        const range = resolvePeriod({ kind: "CURRENT_MONTH" }, now);
        const anchors = [
          range.start.getTime(),
          range.end.getTime(),
          range.start.getTime() - 1,
          range.end.getTime() + 1,
          nowMs,
        ];
        const txs = buildTransactions(specs, anchors);

        const withDefault = computeTotals(txs, undefined, now);
        const explicit = computeTotals(txs, { kind: "CURRENT_MONTH" }, now);

        expect(withDefault.income).toBe(explicit.income);
        expect(withDefault.expense).toBe(explicit.expense);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13 — Resultado_Mensal por mês civil (Req. 5.3)
// ---------------------------------------------------------------------------

const monthArb: fc.Arbitrary<Month> = fc.record({
  year: fc.integer({ min: 2018, max: 2032 }),
  month: fc.integer({ min: 1, max: 12 }),
});

describe("Property 13: computeMonthlyResult = (receitas - despesas) do mês civil (UTC)", () => {
  it("iguala a diferença calculada independentemente sobre [primeiro instante, último instante] do mês", () => {
    fc.assert(
      fc.property(monthArb, txSpecsArb, (month, specs) => {
        // Mês civil em UTC: do primeiro instante do dia 1 ao último do último dia.
        const firstMs = Date.UTC(month.year, month.month - 1, 1, 0, 0, 0, 0);
        const lastMs = Date.UTC(month.year, month.month, 0, 23, 59, 59, 999);

        const anchors = [
          firstMs,
          lastMs,
          firstMs - 1,
          lastMs + 1,
          // hit no meio do mês: meio-dia do dia 15 (sempre existe).
          Date.UTC(month.year, month.month - 1, 15, 12, 0, 0, 0),
          firstMs + specs.length,
        ];

        const txs = buildTransactions(specs, anchors);

        let income = 0;
        let expense = 0;
        for (const tx of txs) {
          if (!withinInclusive(tx.date.getTime(), firstMs, lastMs)) {
            continue;
          }
          if (tx.type === "INCOME") {
            income += tx.amount;
          } else {
            expense += tx.amount;
          }
        }

        const expected = income - expense;
        const actual = computeMonthlyResult(txs, month);

        expect(actual).toBe(expected);
      }),
    );
  });

  it("coincide com computeTotals para o CUSTOM equivalente ao mês civil", () => {
    fc.assert(
      fc.property(monthArb, txSpecsArb, (month, specs) => {
        const firstMs = Date.UTC(month.year, month.month - 1, 1, 0, 0, 0, 0);
        const lastMs = Date.UTC(month.year, month.month, 0, 23, 59, 59, 999);

        const anchors = [firstMs, lastMs, firstMs - 1, lastMs + 1];
        const txs = buildTransactions(specs, anchors);

        const customPeriod: Period = {
          kind: "CUSTOM",
          start: new Date(firstMs),
          end: new Date(lastMs),
        };
        // `now` é irrelevante para CUSTOM; usa o primeiro instante do mês.
        const totals = computeTotals(txs, customPeriod, new Date(firstMs));

        expect(computeMonthlyResult(txs, month)).toBe(
          totals.income - totals.expense,
        );
      }),
    );
  });
});
