/**
 * Ordenação do histórico de lançamentos — domínio puro de Lançamentos.
 *
 * Modela, como função pura e total, a ordem em que o histórico de Lançamentos
 * (Receitas e Despesas) é apresentado ao Usuário: **decrescente por data** e,
 * em caso de datas iguais, **decrescente pela data de criação** (`createdAt`).
 *
 * O resultado é sempre uma **permutação** da entrada — os mesmos elementos, sem
 * inclusões nem remoções, apenas reordenados. Receitas e Despesas compartilham
 * a mesma entidade `Transaction` (discriminada por `type`), portanto a mesma
 * regra de ordenação atende aos dois serviços (Req. 6.6 e 7.6 são espelhados).
 *
 * Este módulo é **puro**: não acessa banco de dados, rede nem relógio, e **não
 * muta** o array de entrada (a ordenação ocorre sobre uma cópia). Isso permite
 * o teste baseado em propriedades (Property 18) sem mocks nem I/O.
 *
 * Referência: design.md, "Property 18: Ordenação de histórico de lançamentos";
 * requirements.md, critérios 6.6 e 7.6.
 */

import type { Transaction } from "@/domain/types";

// ---------------------------------------------------------------------------
// Comparador puro e total
// ---------------------------------------------------------------------------

/**
 * Comparador total entre dois Lançamentos para a ordem do histórico.
 *
 * Ordena de forma **decrescente por `date`** e, quando as datas são iguais, de
 * forma **decrescente por `createdAt`**. Quando ambos os instantes coincidem,
 * retorna `0` (empate), preservando a estabilidade da ordenação.
 *
 * A comparação usa `getTime()` (milissegundos desde a época), garantindo uma
 * relação numérica total e determinística entre as datas.
 *
 * @param a Primeiro Lançamento.
 * @param b Segundo Lançamento.
 * @returns Número negativo se `a` precede `b`, positivo se `a` sucede `b`, `0`
 *   em caso de empate.
 */
function compareByDateThenCreatedAtDesc(a: Transaction, b: Transaction): number {
  const dateDiff = b.date.getTime() - a.date.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return b.createdAt.getTime() - a.createdAt.getTime();
}

// ---------------------------------------------------------------------------
// Ordenação do histórico
// ---------------------------------------------------------------------------

/**
 * Ordena o histórico de Lançamentos de um Usuário (Req. 6.6, 7.6).
 *
 * Retorna um **novo** array contendo exatamente os mesmos elementos de `txs`
 * (uma permutação da entrada), ordenado de forma **decrescente por data** e, em
 * caso de datas iguais, de forma **decrescente pela data de criação**.
 *
 * É **pura e total**: não muta o array de entrada — a ordenação é aplicada
 * sobre uma cópia rasa — e não realiza I/O.
 *
 * @param txs Lista de Lançamentos a ordenar.
 * @returns Novo array ordenado conforme a regra do histórico.
 */
export function sortTransactionHistory(txs: Transaction[]): Transaction[] {
  return txs.slice().sort(compareByDateThenCreatedAtDesc);
}
