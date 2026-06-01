import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  distributionByCategory,
  type CategoryShare,
} from "@/domain/dashboard/distribution";
import {
  type Period,
  type Transaction,
  type TransactionType,
} from "@/domain/types";

/**
 * Teste de propriedade — Distribuição por categoria (Dashboard).
 *
 * Feature: financial-management-platform, Property 14: Distribuição por categoria
 *
 * *Para qualquer* conjunto de lançamentos de um tipo com total positivo em um
 * período, o valor de cada fatia da distribuição é igual à soma dos lançamentos
 * daquela categoria no período, e a soma dos percentuais de todas as categorias
 * daquele tipo é igual a 100%. Quando o total do tipo no período é zero (nenhum
 * lançamento correspondente), a distribuição é vazia (`[]`).
 *
 * Validates: Requirements 5.4
 */

// ---------------------------------------------------------------------------
// Janela de datas fixa + período CUSTOM cobrindo-a por completo
// ---------------------------------------------------------------------------

/**
 * Janela determinística para as datas dos lançamentos. Um período `CUSTOM` que
 * cobre exatamente `[WINDOW_START, WINDOW_END]` garante que **todos** os
 * lançamentos gerados pertencem ao período, isolando a propriedade de qualquer
 * dependência da data corrente (evita flakiness de períodos relativos).
 */
const WINDOW_START = Date.UTC(2020, 0, 1, 0, 0, 0, 0);
const WINDOW_END = Date.UTC(2030, 0, 1, 0, 0, 0, 0);

/** Período fechado e inclusivo cobrindo toda a janela de geração. */
const coveringPeriod: Period = {
  kind: "CUSTOM",
  start: new Date(WINDOW_START),
  end: new Date(WINDOW_END),
};

/**
 * Instante de referência explícito. Irrelevante para `CUSTOM` (não há
 * resolução relativa), mas informado para tornar a chamada determinística.
 */
const now = new Date(WINDOW_START);

// ---------------------------------------------------------------------------
// Geradores (smart generators)
// ---------------------------------------------------------------------------

const typeArb = fc.constantFrom<TransactionType>("INCOME", "EXPENSE");

/** Poucas categorias para forçar agrupamento (várias txs por categoria). */
const categoryIdArb = fc.constantFrom(
  "cat-0",
  "cat-1",
  "cat-2",
  "cat-3",
  "cat-4",
);

/**
 * Valor em centavos sempre positivo (≥ 1), limitado de modo que somas de
 * dezenas de lançamentos permaneçam muito abaixo de `Number.MAX_SAFE_INTEGER`,
 * mantendo a aritmética inteira exata.
 */
const amountArb = fc.integer({ min: 1, max: 1_000_000_000 });

/** Data dentro da janela coberta pelo período `CUSTOM`. */
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

/** Constrói lançamentos com ids distintos a partir das sementes geradas. */
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

// ---------------------------------------------------------------------------
// Oráculo independente: agrupa por categoria e soma (apenas o tipo escolhido)
// ---------------------------------------------------------------------------

/**
 * Reimplementa, de forma independente e simples, o agrupamento esperado: soma
 * por `categoryId` para o `type` escolhido (todas as datas já estão no período
 * por construção). Devolve o mapa categoria → valor e o total do tipo.
 */
function groupExpected(
  txs: Transaction[],
  type: TransactionType,
): { byCategory: Map<string, number>; total: number } {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== type) {
      continue;
    }
    byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount);
    total += tx.amount;
  }
  return { byCategory, total };
}

// ---------------------------------------------------------------------------
// Property 14
// ---------------------------------------------------------------------------

describe("Property 14: distribuição por categoria", () => {
  it("cada fatia = soma da categoria, percentual exato e soma dos percentuais ≈ 100", () => {
    fc.assert(
      fc.property(transactionsArb, typeArb, (txs, type) => {
        const { byCategory, total } = groupExpected(txs, type);

        const shares: CategoryShare[] = distributionByCategory(
          txs,
          coveringPeriod,
          type,
          now,
        );

        // Total zero (nenhum lançamento do tipo no período) ⇒ distribuição vazia.
        if (total === 0) {
          expect(shares).toEqual([]);
          return;
        }

        // Conjunto de categorias coincide com o oráculo (sem duplicatas).
        const seen = new Set<string>();
        let percentageSum = 0;

        for (const share of shares) {
          // Cada categoria aparece uma única vez.
          expect(seen.has(share.categoryId)).toBe(false);
          seen.add(share.categoryId);

          // Valor da fatia = soma independente dos lançamentos da categoria.
          expect(byCategory.has(share.categoryId)).toBe(true);
          expect(share.value).toBe(byCategory.get(share.categoryId));

          // Percentual é a razão exata, sem arredondamento.
          expect(share.percentage).toBe((100 * share.value) / total);

          percentageSum += share.percentage;
        }

        // Todas as categorias do oráculo estão presentes na saída.
        expect(seen.size).toBe(byCategory.size);

        // Soma dos percentuais é 100 a menos do erro de representação IEEE-754.
        expect(Math.abs(percentageSum - 100)).toBeLessThanOrEqual(1e-6);
      }),
    );
  });

  it("total zero (nenhum lançamento do tipo consultado no período) ⇒ []", () => {
    fc.assert(
      fc.property(transactionsArb, typeArb, (txs, presentType) => {
        // Mantém apenas lançamentos de um único tipo...
        const singleType = txs.filter((tx) => tx.type === presentType);
        // ...e consulta o tipo oposto, garantindo total zero no período.
        const queriedType: TransactionType =
          presentType === "INCOME" ? "EXPENSE" : "INCOME";

        const shares = distributionByCategory(
          singleType,
          coveringPeriod,
          queriedType,
          now,
        );

        expect(shares).toEqual([]);
      }),
    );
  });
});
