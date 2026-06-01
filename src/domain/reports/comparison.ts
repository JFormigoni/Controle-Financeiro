/**
 * Comparativos mensal e anual — domínio puro do Serviço de Relatórios.
 *
 * Modela, como funções **puras e totais**, os comparativos solicitados pelo
 * Usuário sobre um intervalo de datas (Req. 10.3, 10.4):
 *
 * - {@link buildMonthlyComparison} agrupa por **mês civil** do intervalo;
 * - {@link buildAnnualComparison} agrupa por **ano civil** do intervalo.
 *
 * Cada agrupamento apresenta o total de Receitas e o total de Despesas dos
 * Lançamentos do Usuário cuja data esteja contida no intervalo **fechado e
 * inclusivo** `[start, end]`.
 *
 * ## Bucketing por calendário civil (UTC)
 *
 * O mês/ano de um Lançamento é determinado pelos **componentes UTC** da sua
 * data (`getUTCFullYear`, `getUTCMonth`), tornando o agrupamento
 * **independente de fuso horário** e **determinístico** — a mesma convenção
 * usada pela aritmética de recorrência (`recurrence.ts`). O campo `month` das
 * linhas mensais é **1..12** (janeiro = 1), consistente com o tipo
 * {@link Month} do domínio.
 *
 * ## Uma linha por período civil do intervalo (inclusive períodos vazios)
 *
 * Interpretando "para cada mês civil do intervalo" (Req. 10.3) da forma mais
 * segura, emite-se **exatamente uma linha por mês civil** que intersecta o
 * intervalo — do mês de `start` ao mês de `end`, inclusive — mesmo quando o mês
 * não possui Lançamentos (nesse caso, totais zero). O comparativo anual segue a
 * mesma regra, do ano de `start` ao ano de `end`, inclusive. As linhas são
 * retornadas em ordem cronológica crescente.
 *
 * ## Conservação de soma (Property 28)
 *
 * Como todo Lançamento dentro de `[start, end]` cai em exatamente um mês civil
 * (e um ano civil) compreendido entre os de `start` e `end`, a soma dos totais
 * de Receitas (e de Despesas) de todas as linhas é **igual** ao total de
 * Receitas (e de Despesas) do intervalo completo: nenhum Lançamento em faixa é
 * descartado ou contado em duplicidade.
 *
 * Este módulo é **puro**: não acessa banco de dados, rede nem relógio, e **não
 * muta** o array de entrada. Entradas degeneradas (datas inválidas ou
 * `start > end`) produzem lista vazia.
 *
 * Referência: design.md, "Serviço de Relatórios" e "Property 28: Conservação
 * de soma nos comparativos"; requirements.md, critérios 10.3 e 10.4.
 */

import type { Money, Transaction } from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos de linha (auto-contidos neste módulo)
// ---------------------------------------------------------------------------

/**
 * Uma linha do comparativo **mensal**: um mês civil e os totais de Receitas e
 * Despesas dos Lançamentos do Usuário nesse mês, dentro do intervalo.
 */
export interface MonthlyComparisonRow {
  /** Ano civil (ex.: 2026), em UTC. */
  year: number;
  /** Mês civil de 1 (janeiro) a 12 (dezembro), em UTC. */
  month: number;
  /** Total de Receitas do mês, em centavos. */
  income: Money;
  /** Total de Despesas do mês, em centavos. */
  expense: Money;
}

/**
 * Uma linha do comparativo **anual**: um ano civil e os totais de Receitas e
 * Despesas dos Lançamentos do Usuário nesse ano, dentro do intervalo.
 */
export interface AnnualComparisonRow {
  /** Ano civil (ex.: 2026), em UTC. */
  year: number;
  /** Total de Receitas do ano, em centavos. */
  income: Money;
  /** Total de Despesas do ano, em centavos. */
  expense: Money;
}

// ---------------------------------------------------------------------------
// Auxiliares puros
// ---------------------------------------------------------------------------

/** Verdadeiro quando `d` é um `Date` com instante válido (não `NaN`). */
function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * Verdadeiro quando a data do Lançamento está dentro do intervalo fechado
 * `[start, end]` (inclusive). Datas inválidas ficam fora do intervalo.
 */
function isWithinRange(date: Date, startTime: number, endTime: number): boolean {
  const t = date.getTime();
  return !Number.isNaN(t) && t >= startTime && t <= endTime;
}

/** Acumula o valor do Lançamento na linha conforme o tipo (Receita/Despesa). */
function accumulate(
  row: { income: Money; expense: Money },
  tx: Transaction,
): void {
  if (tx.type === "INCOME") {
    row.income += tx.amount;
  } else {
    row.expense += tx.amount;
  }
}

// ---------------------------------------------------------------------------
// Comparativo mensal (Req. 10.3)
// ---------------------------------------------------------------------------

/**
 * Constrói o comparativo **mensal** sobre o intervalo `[start, end]`.
 *
 * Emite uma linha por mês civil (UTC) do intervalo — do mês de `start` ao mês
 * de `end`, inclusive — com os totais de Receitas e Despesas dos Lançamentos
 * cuja data esteja contida no intervalo fechado. Meses sem Lançamentos recebem
 * totais zero. As linhas são ordenadas cronologicamente.
 *
 * Função **pura e total**: não muta `txs`; retorna `[]` para entradas
 * degeneradas (datas inválidas ou `start > end`).
 *
 * @param txs Lançamentos a considerar (Receitas e Despesas).
 * @param start Início do intervalo (inclusive).
 * @param end Fim do intervalo (inclusive).
 * @returns Linhas mensais em ordem cronológica crescente.
 */
export function buildMonthlyComparison(
  txs: Transaction[],
  start: Date,
  end: Date,
): MonthlyComparisonRow[] {
  if (!isValidDate(start) || !isValidDate(end) || start.getTime() > end.getTime()) {
    return [];
  }

  const startTime = start.getTime();
  const endTime = end.getTime();

  // Enumera todos os meses civis (UTC) do intervalo, em ordem cronológica.
  const startYear = start.getUTCFullYear();
  const startMonth0 = start.getUTCMonth(); // 0..11
  const endYear = end.getUTCFullYear();
  const endMonth0 = end.getUTCMonth();

  const rows: MonthlyComparisonRow[] = [];
  // Índice absoluto de mês (ano * 12 + mês0) -> posição na lista `rows`.
  const indexByMonthKey = new Map<number, number>();

  const firstKey = startYear * 12 + startMonth0;
  const lastKey = endYear * 12 + endMonth0;
  for (let key = firstKey; key <= lastKey; key++) {
    const year = Math.floor(key / 12);
    const month0 = key - year * 12;
    indexByMonthKey.set(key, rows.length);
    rows.push({ year, month: month0 + 1, income: 0, expense: 0 });
  }

  for (const tx of txs) {
    if (!isWithinRange(tx.date, startTime, endTime)) {
      continue;
    }
    const key = tx.date.getUTCFullYear() * 12 + tx.date.getUTCMonth();
    const idx = indexByMonthKey.get(key);
    // Todo Lançamento em faixa cai em um mês compreendido no intervalo, logo
    // `idx` é sempre definido; a guarda mantém a função total por segurança.
    if (idx !== undefined) {
      const row = rows[idx];
      if (row !== undefined) {
        accumulate(row, tx);
      }
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Comparativo anual (Req. 10.4)
// ---------------------------------------------------------------------------

/**
 * Constrói o comparativo **anual** sobre o intervalo `[start, end]`.
 *
 * Emite uma linha por ano civil (UTC) do intervalo — do ano de `start` ao ano
 * de `end`, inclusive — com os totais de Receitas e Despesas dos Lançamentos
 * cuja data esteja contida no intervalo fechado. Anos sem Lançamentos recebem
 * totais zero. As linhas são ordenadas cronologicamente.
 *
 * Função **pura e total**: não muta `txs`; retorna `[]` para entradas
 * degeneradas (datas inválidas ou `start > end`).
 *
 * @param txs Lançamentos a considerar (Receitas e Despesas).
 * @param start Início do intervalo (inclusive).
 * @param end Fim do intervalo (inclusive).
 * @returns Linhas anuais em ordem cronológica crescente.
 */
export function buildAnnualComparison(
  txs: Transaction[],
  start: Date,
  end: Date,
): AnnualComparisonRow[] {
  if (!isValidDate(start) || !isValidDate(end) || start.getTime() > end.getTime()) {
    return [];
  }

  const startTime = start.getTime();
  const endTime = end.getTime();

  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  const rows: AnnualComparisonRow[] = [];
  const indexByYear = new Map<number, number>();

  for (let year = startYear; year <= endYear; year++) {
    indexByYear.set(year, rows.length);
    rows.push({ year, income: 0, expense: 0 });
  }

  for (const tx of txs) {
    if (!isWithinRange(tx.date, startTime, endTime)) {
      continue;
    }
    const idx = indexByYear.get(tx.date.getUTCFullYear());
    if (idx !== undefined) {
      const row = rows[idx];
      if (row !== undefined) {
        accumulate(row, tx);
      }
    }
  }

  return rows;
}
