/**
 * Relatório de fluxo de caixa — domínio puro de Relatórios (Req. 10.5).
 *
 * Modela, como função pura e total, o relatório de fluxo de caixa de um
 * Usuário: para um intervalo fechado `[start, end]`, apresenta, **por dia**, as
 * entradas (Receitas), as saídas (Despesas) e o **Saldo_Atual acumulado** ao
 * longo do intervalo.
 *
 * ## Granularidade e ordenação
 *
 * As linhas são **agrupadas por dia civil em UTC**: todos os lançamentos cuja
 * data cai no mesmo dia (componentes `getUTCFullYear/Month/Date`) compõem uma
 * única linha. A escolha de UTC torna o agrupamento **determinístico e
 * independente de fuso horário**, em linha com o cálculo de datas de
 * `recurrence.ts`. A `date` de cada linha é a **meia-noite UTC** do dia
 * correspondente (`Date.UTC(y, m, d)`).
 *
 * As linhas são ordenadas de forma **crescente por data** (do dia mais antigo
 * ao mais recente). Somente dias que possuem ao menos um lançamento no intervalo
 * geram uma linha (dias sem movimentação não aparecem).
 *
 * ## Saldo acumulado (running balance)
 *
 * O `balance` de cada linha é o saldo **acumulado** carregado entre as linhas:
 * para cada linha, `balance = (soma de todas as entradas até e incluindo essa
 * linha) - (soma de todas as saídas até e incluindo essa linha)`. Como as
 * linhas estão em ordem crescente e o saldo é carregado adiante, o `balance` da
 * **última** linha é igual ao total de entradas menos o total de saídas de todo
 * o intervalo. Os campos `inflow`/`outflow` de cada linha referem-se apenas às
 * movimentações **daquele dia**.
 *
 * Convenção de tipo: `INCOME` é tratado como entrada (`inflow`) e `EXPENSE`
 * como saída (`outflow`). Todos os valores são inteiros de **centavos**
 * (`Money`), com aritmética exata via `@/domain/money`.
 *
 * Este módulo é **puro e total**: não acessa banco de dados, rede nem relógio,
 * e **não muta** a lista de entrada. Isso viabiliza o teste baseado em
 * propriedades (Property 29) sem mocks nem I/O.
 *
 * Referência: design.md, "Property 29: Saldo acumulado no fluxo de caixa";
 * requirements.md, critério 10.5.
 */

import type { Money, Transaction } from "@/domain/types";
import { add, subtract } from "@/domain/money";

// ---------------------------------------------------------------------------
// Tipo de linha do relatório
// ---------------------------------------------------------------------------

/**
 * Linha do relatório de fluxo de caixa, correspondente a um dia civil (UTC)
 * com ao menos um lançamento no intervalo.
 */
export interface CashFlowRow {
  /** Meia-noite UTC do dia civil agrupado (`Date.UTC(y, m, d)`). */
  date: Date;
  /** Total de entradas (Receitas) **do dia**, em centavos. */
  inflow: Money;
  /** Total de saídas (Despesas) **do dia**, em centavos. */
  outflow: Money;
  /**
   * Saldo **acumulado** até e incluindo este dia, em centavos:
   * (soma das entradas até aqui) − (soma das saídas até aqui).
   */
  balance: Money;
}

// ---------------------------------------------------------------------------
// Auxiliares puros
// ---------------------------------------------------------------------------

/** Verdadeiro quando `date` é um `Date` com instante válido (não `NaN`). */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Chave inteira do dia civil em UTC (milissegundos da meia-noite UTC). Dois
 * instantes no mesmo dia civil UTC produzem a mesma chave.
 */
function utcDayKey(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Acumulador mutável interno de um dia (entradas e saídas do dia). */
interface DayBucket {
  inflow: Money;
  outflow: Money;
}

// ---------------------------------------------------------------------------
// Construção do relatório
// ---------------------------------------------------------------------------

/**
 * Constrói o relatório de fluxo de caixa de um Usuário para o intervalo fechado
 * `[start, end]` (Req. 10.5).
 *
 * Filtra `txs` para o intervalo **inclusivo** `[start, end]` (comparação por
 * instante, `start.getTime() <= tx.date.getTime() <= end.getTime()`), agrupa os
 * lançamentos por **dia civil em UTC**, soma entradas (`INCOME`) e saídas
 * (`EXPENSE`) de cada dia e calcula o **saldo acumulado** carregado entre as
 * linhas, em ordem **crescente por data**.
 *
 * Garante que, para cada linha, `balance` é igual à soma de todas as entradas
 * menos a soma de todas as saídas **até e incluindo** aquela linha; o `balance`
 * da última linha é igual ao total de entradas menos o total de saídas do
 * intervalo. Lançamentos com data inválida são ignorados, mantendo a função
 * total.
 *
 * É **pura e total**: não muta `txs` nem realiza I/O. Quando `start`/`end` são
 * inválidos ou `start > end`, retorna uma lista vazia.
 *
 * @param txs Lista de Lançamentos a considerar.
 * @param start Início do intervalo (inclusivo).
 * @param end Fim do intervalo (inclusivo).
 * @returns Linhas do fluxo de caixa, uma por dia com movimentação, em ordem
 *   crescente por data, com o saldo acumulado em cada linha.
 */
export function buildCashFlow(
  txs: Transaction[],
  start: Date,
  end: Date,
): CashFlowRow[] {
  if (!isValidDate(start) || !isValidDate(end)) {
    return [];
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs > endMs) {
    return [];
  }

  // Agrupa por dia civil UTC, somando entradas e saídas de cada dia.
  const buckets = new Map<number, DayBucket>();
  for (const tx of txs) {
    if (!isValidDate(tx.date)) {
      continue;
    }
    const ms = tx.date.getTime();
    if (ms < startMs || ms > endMs) {
      continue;
    }

    const key = utcDayKey(tx.date);
    const bucket = buckets.get(key) ?? { inflow: 0, outflow: 0 };
    if (tx.type === "INCOME") {
      bucket.inflow = add(bucket.inflow, tx.amount);
    } else {
      bucket.outflow = add(bucket.outflow, tx.amount);
    }
    buckets.set(key, bucket);
  }

  // Ordena os dias de forma crescente e carrega o saldo acumulado adiante.
  const orderedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  const rows: CashFlowRow[] = [];
  let runningBalance: Money = 0;
  for (const key of orderedKeys) {
    const bucket = buckets.get(key) as DayBucket;
    // saldo acumulado = saldo anterior + entradas do dia - saídas do dia.
    runningBalance = subtract(add(runningBalance, bucket.inflow), bucket.outflow);
    rows.push({
      date: new Date(key),
      inflow: bucket.inflow,
      outflow: bucket.outflow,
      balance: runningBalance,
    });
  }

  return rows;
}
