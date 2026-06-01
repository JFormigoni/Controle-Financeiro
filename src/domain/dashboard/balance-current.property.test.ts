import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeCurrentBalance, computeTotals } from "@/domain/dashboard/balance";
import {
  type Period,
  type Transaction,
  type TransactionType,
} from "@/domain/types";
import { MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS } from "@/domain/money";

/**
 * Teste de propriedade do **Saldo_Atual** (Property 12).
 *
 * Verifica que {@link computeCurrentBalance}:
 *  1. é igual ao somatório de todas as Receitas menos o somatório de todas as
 *     Despesas cuja data é **anterior ou igual** a `asOf` (cálculo de
 *     referência computado de forma independente, com o mesmo predicado de
 *     corte da implementação);
 *  2. **não depende do período** selecionado no Dashboard — a função sequer
 *     recebe um `Period`. A independência é demonstrada calculando o saldo uma
 *     única vez e afirmando que, para uma coleção arbitrária de períodos
 *     (inclusive os usados por outros cálculos do Dashboard via
 *     {@link computeTotals}), o saldo permanece **inalterado** e igual ao valor
 *     de referência.
 *
 * Os instantes de `date` e `asOf` são sorteados de faixas sobrepostas (com
 * fronteiras fixas), de modo a forçar com frequência os casos de igualdade
 * (`date === asOf`, limite inclusivo) e de corte (`date > asOf`).
 *
 * Feature: financial-management-platform, Property 12: Saldo atual independe do período
 *
 * _Requirements: 5.1_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes (foco no espaço de entrada relevante: o corte por
// `asOf`, ambos os tipos de lançamento e a faixa válida de valores)
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: readonly TransactionType[] = ["INCOME", "EXPENSE"];

/**
 * Conjunto de instantes de fronteira (UTC, ms desde a época) reutilizado para
 * `date` e `asOf`. A baixa cardinalidade aumenta a chance de empates exatos
 * (`date === asOf`), exercitando o limite inclusivo do corte.
 */
const BOUNDARY_TIMESTAMPS: readonly number[] = [
  Date.UTC(2020, 0, 1),
  Date.UTC(2025, 5, 15),
  Date.UTC(2026, 0, 1),
  Date.UTC(2026, 5, 15, 9, 30),
  Date.UTC(2026, 11, 31, 23, 59, 59, 999),
  Date.UTC(2030, 0, 1),
];

/**
 * Instante arbitrário: ora de fronteira (para forçar empates), ora aleatório
 * em uma janela ampla que envolve as fronteiras.
 */
const timestampArb: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(...BOUNDARY_TIMESTAMPS),
  fc.integer({ min: Date.UTC(2019, 0, 1), max: Date.UTC(2031, 0, 1) }),
);

/** Valor de lançamento na faixa válida (centavos inteiros). */
const amountArb: fc.Arbitrary<number> = fc.integer({
  min: MIN_AMOUNT_CENTS,
  max: MAX_AMOUNT_CENTS,
});

/** Lançamento arbitrário; campos irrelevantes ao saldo recebem valores fixos. */
function transactionArb(id: string): fc.Arbitrary<Transaction> {
  return fc
    .record({
      type: fc.constantFrom(...TRANSACTION_TYPES),
      amount: amountArb,
      date: timestampArb,
    })
    .map(({ type, amount, date }) => ({
      id,
      userId: "user-1",
      categoryId: "cat-1",
      type,
      description: "lançamento",
      amount,
      date: new Date(date),
      recurrenceId: null,
      createdAt: new Date(date),
    }));
}

/** Lista de lançamentos (possivelmente vazia) com ids distintos. */
const transactionsArb: fc.Arbitrary<Transaction[]> = fc
  .array(fc.boolean(), { maxLength: 25 })
  .chain((markers) =>
    markers.length === 0
      ? fc.constant<Transaction[]>([])
      : fc.tuple(...markers.map((_, index) => transactionArb(`tx-${index}`))),
  );

/** Período arbitrário do Dashboard (cobre todas as variantes de `Period`). */
const periodArb: fc.Arbitrary<Period> = fc.oneof(
  fc.constant<Period>({ kind: "CURRENT_MONTH" }),
  fc.constant<Period>({ kind: "PREVIOUS_MONTH" }),
  fc.constant<Period>({ kind: "CURRENT_YEAR" }),
  fc
    .tuple(timestampArb, timestampArb)
    .map<Period>(([a, b]) => ({
      kind: "CUSTOM",
      start: new Date(Math.min(a, b)),
      end: new Date(Math.max(a, b)),
    })),
);

// ---------------------------------------------------------------------------
// Cálculo de referência independente (mesmo predicado de corte da implementação)
// ---------------------------------------------------------------------------

/**
 * Saldo esperado: soma das Receitas menos soma das Despesas com `date <= asOf`.
 * Reproduz o predicado de corte inclusivo da implementação sem reusar seu
 * código, servindo como oráculo independente.
 */
function expectedBalance(txs: Transaction[], asOf: Date): number {
  const cutoff = asOf.getTime();
  let total = 0;
  for (const tx of txs) {
    if (tx.date.getTime() <= cutoff) {
      total += tx.type === "INCOME" ? tx.amount : -tx.amount;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Property 12: Saldo atual independe do período
// ---------------------------------------------------------------------------

describe("Property 12: Saldo atual independe do período", () => {
  // Feature: financial-management-platform, Property 12: Saldo atual independe do período
  // Para qualquer conjunto de lançamentos e data de corte `asOf`,
  // computeCurrentBalance é igual ao somatório das Receitas menos o das
  // Despesas registradas até `asOf`, e seu valor é invariante ao período
  // selecionado no Dashboard.
  it("é (Σ Receitas − Σ Despesas) até asOf e invariante ao período", () => {
    fc.assert(
      fc.property(
        transactionsArb,
        timestampArb,
        timestampArb,
        fc.array(periodArb, { maxLength: 6 }),
        (txs, asOfTs, nowTs, periods) => {
          const asOf = new Date(asOfTs);
          const now = new Date(nowTs);

          // (1) Igualdade com o oráculo independente.
          const expected = expectedBalance(txs, asOf);
          const balance = computeCurrentBalance(txs, asOf);
          expect(balance).toBe(expected);

          // (2) Independência do período: para cada período arbitrário (mesmo
          // os consumidos por outros cálculos do Dashboard), o saldo atual
          // permanece inalterado e igual ao valor de referência. A própria
          // assinatura de computeCurrentBalance não recebe Period; chamamos
          // computeTotals para variar o período "em outro lugar" do Dashboard.
          for (const period of periods) {
            // Exercita o uso do período em outro cálculo do Dashboard.
            computeTotals(txs, period, now);
            // O saldo atual não é afetado por nenhum período.
            expect(computeCurrentBalance(txs, asOf)).toBe(expected);
          }
        },
      ),
    );
  });
});
