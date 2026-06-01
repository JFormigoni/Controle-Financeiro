/**
 * Relatórios de Receitas/Despesas por intervalo de datas — domínio puro de
 * Relatórios (Req. 10.1, 10.2, 10.8).
 *
 * Modela, como funções **puras e totais**, a geração de um relatório tabular de
 * Receitas ou de Despesas restrito a um intervalo de datas **fechado e
 * inclusivo** `[início, fim]`. O relatório resultante é uma estrutura tabular
 * (cabeçalho implícito + linhas) projetada para ser consumida sem alterações
 * pelos serializadores de exportação CSV/XLSX/PDF (tarefas 14.9/14.11), que
 * esperam justamente "cabeçalhos + linhas".
 *
 * ## Filtragem
 *
 * Cada função inclui exatamente os Lançamentos que satisfazem **todos** os
 * critérios:
 * - **Tipo**: `INCOME` em {@link buildIncomeReport}, `EXPENSE` em
 *   {@link buildExpenseReport};
 * - **Intervalo**: `start <= tx.date <= end` (intervalo fechado, ambas as
 *   extremidades inclusive), comparado por instante (`getTime()`);
 * - **Dono**: o relatório considera **apenas** os Lançamentos recebidos em
 *   `txs`. A autorização por proprietário ocorre na borda I/O, que passa
 *   somente os Lançamentos do próprio Usuário (Req. 6.7/7.7). Este módulo não
 *   conhece `userId` e não filtra por dono — ele assume que `txs` já é o
 *   conjunto do dono.
 *
 * ## Estado vazio (Req. 10.8)
 *
 * Quando nenhum Lançamento satisfaz os critérios, o relatório é gerado com
 * `rows: []` e `total: 0` (totais zerados), indicando ausência de dados no
 * período. A ausência de dados nunca é um erro — a função é total.
 *
 * ## Ordem das linhas
 *
 * As linhas são ordenadas de forma **decrescente por data** e, em caso de
 * datas iguais, de forma **decrescente pela data de criação** (`createdAt`),
 * coerente com a ordenação do histórico de Lançamentos (Req. 6.6, 7.6 — ver
 * `@/domain/transaction/history-sort`). A ordem é determinística, garantindo
 * exportações reprodutíveis.
 *
 * Este módulo é **puro**: não acessa banco de dados, rede nem relógio, e não
 * muta a entrada. Isso permite o teste baseado em propriedades (Property 27)
 * sem mocks nem I/O.
 *
 * Referências: design.md, "Serviço de Relatórios (Req. 10)" e "Property 27:
 * Relatório por intervalo de datas"; requirements.md, critérios 10.1, 10.2,
 * 10.8.
 */

import type {
  DateRange,
  Money,
  Transaction,
  TransactionType,
} from "@/domain/types";
import { sum } from "@/domain/money";
import { sortTransactionHistory } from "@/domain/transaction/history-sort";

// ---------------------------------------------------------------------------
// Tipos compartilhados do relatório tabular
// ---------------------------------------------------------------------------

/**
 * Linha de um relatório tabular, projetada a partir de um {@link Transaction}.
 *
 * Contém os campos exibidos/exportados de cada Lançamento. É deliberadamente
 * geral para ser reaproveitada por outros módulos de relatório e pelos
 * serializadores de exportação (CSV/XLSX/PDF), que produzem uma coluna por
 * campo.
 */
export interface ReportRow {
  /** Identificador do Lançamento de origem. */
  id: string;
  /** Descrição do Lançamento (1..200 caracteres). */
  description: string;
  /** Data do Lançamento. */
  date: Date;
  /** Valor em centavos (inteiro). */
  amount: Money;
  /** Categoria que classifica o Lançamento. */
  categoryId: string;
}

/**
 * Relatório tabular de Lançamentos em um intervalo de datas.
 *
 * Estrutura compartilhada, consumida sem alterações pelos serializadores de
 * exportação (`toCSV`/`toXLSX`/`toPDF`): as colunas derivam dos campos de
 * {@link ReportRow} e `rows` fornece as linhas de dados. É mantida geral para
 * que outros módulos de relatório possam reutilizá-la.
 */
export interface Report {
  /**
   * Tipo dos Lançamentos do relatório (`INCOME` ou `EXPENSE`). Opcional para
   * relatórios que não se restringem a um único tipo; sempre definido pelos
   * relatórios de Receitas/Despesas deste módulo.
   */
  type?: TransactionType;
  /** Linhas do relatório, na ordem de apresentação (data desc, createdAt desc). */
  rows: ReportRow[];
  /** Soma dos valores das linhas, em centavos; `0` no estado vazio (Req. 10.8). */
  total: Money;
  /** Intervalo fechado `[start, end]` solicitado para o relatório. */
  range: DateRange;
}

// ---------------------------------------------------------------------------
// Núcleo da construção do relatório
// ---------------------------------------------------------------------------

/**
 * Verdadeiro quando a data do Lançamento pertence ao intervalo fechado
 * `[start, end]` (ambas as extremidades inclusive). Compara por instante
 * (`getTime()`), relação numérica total e determinística.
 */
function isWithinClosedRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Projeta um {@link Transaction} na linha tabular {@link ReportRow}. */
function toReportRow(tx: Transaction): ReportRow {
  return {
    id: tx.id,
    description: tx.description,
    date: tx.date,
    amount: tx.amount,
    categoryId: tx.categoryId,
  };
}

/**
 * Constrói um {@link Report} para um único `type`, filtrando `txs` pelo tipo e
 * pelo intervalo fechado `[start, end]`, ordenando as linhas (data desc,
 * `createdAt` desc) e somando os valores. Pura e total: entradas sem
 * correspondência produzem `rows: []` e `total: 0` (Req. 10.8).
 */
function buildRangeReport(
  txs: Transaction[],
  type: TransactionType,
  start: Date,
  end: Date,
): Report {
  const matching = txs.filter(
    (tx) => tx.type === type && isWithinClosedRange(tx.date, start, end),
  );
  const ordered = sortTransactionHistory(matching);
  const rows = ordered.map(toReportRow);
  const total = sum(rows.map((row) => row.amount));
  return {
    type,
    rows,
    total,
    range: { start, end },
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Gera o relatório de **Receitas** do intervalo fechado `[start, end]`
 * (Req. 10.1).
 *
 * Inclui exatamente os Lançamentos de `txs` com `type === "INCOME"` cuja data
 * pertence a `[start, end]` (inclusive), ordenados de forma decrescente por
 * data e, em empate, por `createdAt`. `total` é a soma em centavos dos valores
 * incluídos. Sem correspondências, retorna `rows: []` e `total: 0` (estado
 * vazio, Req. 10.8).
 *
 * O relatório considera apenas os Lançamentos recebidos em `txs`; a borda I/O
 * deve passar somente os Lançamentos do próprio Usuário (Req. 6.7).
 *
 * @param txs Lançamentos do Usuário a considerar.
 * @param start Data inicial do intervalo (inclusive).
 * @param end Data final do intervalo (inclusive).
 * @returns Relatório tabular de Receitas com `type: "INCOME"`.
 */
export function buildIncomeReport(
  txs: Transaction[],
  start: Date,
  end: Date,
): Report {
  return buildRangeReport(txs, "INCOME", start, end);
}

/**
 * Gera o relatório de **Despesas** do intervalo fechado `[start, end]`
 * (Req. 10.2).
 *
 * Inclui exatamente os Lançamentos de `txs` com `type === "EXPENSE"` cuja data
 * pertence a `[start, end]` (inclusive), ordenados de forma decrescente por
 * data e, em empate, por `createdAt`. `total` é a soma em centavos dos valores
 * incluídos. Sem correspondências, retorna `rows: []` e `total: 0` (estado
 * vazio, Req. 10.8).
 *
 * O relatório considera apenas os Lançamentos recebidos em `txs`; a borda I/O
 * deve passar somente os Lançamentos do próprio Usuário (Req. 7.7).
 *
 * @param txs Lançamentos do Usuário a considerar.
 * @param start Data inicial do intervalo (inclusive).
 * @param end Data final do intervalo (inclusive).
 * @returns Relatório tabular de Despesas com `type: "EXPENSE"`.
 */
export function buildExpenseReport(
  txs: Transaction[],
  start: Date,
  end: Date,
): Report {
  return buildRangeReport(txs, "EXPENSE", start, end);
}
