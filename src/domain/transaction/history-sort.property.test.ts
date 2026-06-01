import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { sortTransactionHistory } from "@/domain/transaction/history-sort";
import { type Transaction, type TransactionType } from "@/domain/types";

/**
 * Teste de propriedade da **ordenação do histórico de lançamentos** (Property 18).
 *
 * Verifica que {@link sortTransactionHistory}:
 *  1. retorna uma **permutação** da entrada (mesmo multiconjunto de elementos);
 *  2. respeita a **invariante de ordem**: decrescente por `date` e, em caso de
 *     datas iguais, decrescente por `createdAt`;
 *  3. **não muta** o array de entrada.
 *
 * Os timestamps de `date` e `createdAt` são sorteados de um conjunto pequeno e
 * fixo, de modo a **forçar empates de data** com frequência — caso contrário,
 * com instantes totalmente aleatórios, o ramo de desempate por `createdAt`
 * quase nunca seria exercitado.
 *
 * Feature: financial-management-platform, Property 18: Ordenação de histórico de lançamentos
 *
 * _Requirements: 6.6, 7.6_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes (foco em forçar empates de data para exercitar o
// desempate por createdAt)
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: readonly TransactionType[] = ["INCOME", "EXPENSE"];

/**
 * Conjunto pequeno de instantes (ms desde a época) reutilizado tanto para
 * `date` quanto para `createdAt`. A baixa cardinalidade aumenta a chance de
 * colisões, forçando o ramo de desempate por `createdAt`.
 */
const TIMESTAMPS: readonly number[] = [
  0,
  Date.UTC(2026, 0, 1),
  Date.UTC(2026, 0, 1, 12),
  Date.UTC(2026, 5, 15),
  Date.UTC(2026, 5, 15, 9, 30),
  Date.UTC(2026, 11, 31),
];

/** Instante arbitrário a partir do conjunto restrito (para gerar empates). */
const timestampArb: fc.Arbitrary<number> = fc.constantFrom(...TIMESTAMPS);

/**
 * Dados de ordenação de um lançamento (apenas `date`, `createdAt` e `type`); os
 * demais campos recebem valores fixos. O `id` único é atribuído depois, por
 * índice, garantindo distinção para a comparação por multiconjunto de ids.
 */
interface TxSeed {
  date: number;
  createdAt: number;
  type: TransactionType;
}

const txSeedArb: fc.Arbitrary<TxSeed> = fc.record({
  date: timestampArb,
  createdAt: timestampArb,
  type: fc.constantFrom(...TRANSACTION_TYPES),
});

/** Lista de lançamentos com ids distintos (permite comparação por multiconjunto de ids). */
const transactionsArb: fc.Arbitrary<Transaction[]> = fc
  .array(txSeedArb, { maxLength: 20 })
  .map((seeds) =>
    seeds.map((seed, index) => ({
      id: `tx-${index}`,
      userId: "user-1",
      categoryId: "cat-1",
      type: seed.type,
      description: "lançamento",
      amount: 1000,
      date: new Date(seed.date),
      recurrenceId: null,
      createdAt: new Date(seed.createdAt),
    })),
  );

// ---------------------------------------------------------------------------
// Auxiliares de verificação
// ---------------------------------------------------------------------------

/** Multiconjunto de ids ordenado, para comparar elementos independente da ordem. */
function idMultiset(txs: Transaction[]): string[] {
  return txs.map((tx) => tx.id).sort();
}

/** Snapshot raso dos campos relevantes, para detectar mutação da entrada. */
function snapshot(txs: Transaction[]): Array<[string, number, number]> {
  return txs.map((tx) => [tx.id, tx.date.getTime(), tx.createdAt.getTime()]);
}

// ---------------------------------------------------------------------------
// Property 18: Ordenação de histórico de lançamentos
// ---------------------------------------------------------------------------

describe("Property 18: Ordenação de histórico de lançamentos", () => {
  // Feature: financial-management-platform, Property 18: Ordenação de histórico de lançamentos
  // Para qualquer lista de lançamentos, sortTransactionHistory retorna uma
  // permutação da entrada, ordenada decrescente por date e, em empate, decrescente
  // por createdAt, sem mutar a entrada.
  it("retorna permutação ordenada (date desc, createdAt desc) sem mutar a entrada", () => {
    fc.assert(
      fc.property(transactionsArb, (txs) => {
        const before = snapshot(txs);
        const result = sortTransactionHistory(txs);

        // (1) Permutação: mesmo comprimento e mesmo multiconjunto de ids.
        expect(result).toHaveLength(txs.length);
        expect(idMultiset(result)).toEqual(idMultiset(txs));

        // (2) Invariante de ordem para todo par adjacente.
        for (let i = 0; i + 1 < result.length; i++) {
          const a = result[i]!;
          const b = result[i + 1]!;
          expect(a.date.getTime()).toBeGreaterThanOrEqual(b.date.getTime());
          if (a.date.getTime() === b.date.getTime()) {
            expect(a.createdAt.getTime()).toBeGreaterThanOrEqual(
              b.createdAt.getTime(),
            );
          }
        }

        // (3) Não mutação: a entrada permanece idêntica (ordem e valores).
        expect(snapshot(txs)).toEqual(before);
      }),
    );
  });
});
