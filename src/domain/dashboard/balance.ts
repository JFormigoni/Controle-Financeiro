/**
 * Cálculos de saldo, totais por período e resultado mensal — domínio puro do
 * Dashboard (Req. 5.1, 5.2, 5.3).
 *
 * Este módulo concentra os três cálculos financeiros consolidados exibidos no
 * Dashboard:
 *
 * - **Saldo_Atual** ({@link computeCurrentBalance}): somatório de todas as
 *   Receitas menos o somatório de todas as Despesas registradas até a data
 *   corrente (`asOf`), **independentemente do período selecionado** (Req. 5.1).
 * - **Totais por período** ({@link computeTotals}): total de Receitas e total
 *   de Despesas cujas datas pertencem ao período selecionado, separados por
 *   tipo, adotando o **mês civil corrente** como período padrão (Req. 5.2).
 * - **Resultado_Mensal** ({@link computeMonthlyResult}): Receitas menos
 *   Despesas de um mês civil (Req. 5.3).
 *
 * A resolução de um {@link Period} para um intervalo concreto de datas é
 * exposta em {@link resolvePeriod}, pois é reutilizada por outros módulos do
 * Dashboard (distribuição por categoria, indicadores) e pelos testes de
 * propriedade.
 *
 * ## Convenção de calendário (UTC) e limites inclusivos
 *
 * Todos os limites de mês e de ano são calculados em **UTC** (`Date.UTC`,
 * `getUTC*`), tornando os cálculos **determinísticos e independentes de fuso
 * horário** — a mesma estratégia adotada pelo motor de recorrência
 * (`@/domain/recurrence`). Optou-se por UTC (e não pela hora local) para que o
 * resultado não dependa do fuso do servidor/cliente que executa o código.
 *
 * Os intervalos retornados por {@link resolvePeriod} seguem o contrato de
 * {@link DateRange}: são **fechados e inclusivos** em ambas as extremidades,
 * `[start, end]`. Para os períodos de calendário (mês corrente, mês anterior,
 * ano corrente), `start` é o **primeiro instante** do primeiro dia
 * (`00:00:00.000`) e `end` é o **último instante** do último dia
 * (`23:59:59.999`), de modo que qualquer lançamento daquele mês/ano — em
 * qualquer horário — é considerado dentro do período. Para o período
 * personalizado (`CUSTOM`), o intervalo é exatamente `[start, end]` conforme
 * informado pelo solicitante, também inclusivo em ambas as pontas.
 *
 * ## Totalidade
 *
 * As funções são **puras e totais**: não realizam I/O, não mutam a entrada e
 * não lançam. Lançamentos com data inválida (`NaN`) ou fora do período/recorte
 * simplesmente não contribuem para os somatórios — comparações com `NaN`
 * resultam em `false`, excluindo o lançamento de forma segura. Quando não há
 * lançamentos no recorte, os totais e o resultado são `0` (estado vazio do
 * Dashboard — Req. 5.6).
 *
 * Referência: design.md, "Serviço de Dashboard"; "Property 12: Saldo atual
 * independe do período"; "Property 13: Totais e resultado mensal por período".
 */

import {
  type DateRange,
  type Money,
  type Month,
  type Period,
  type Transaction,
} from "@/domain/types";
import { subtract, sum } from "@/domain/money";

// ---------------------------------------------------------------------------
// Limites de calendário (UTC)
// ---------------------------------------------------------------------------

/**
 * Primeiro instante (`00:00:00.000`, UTC) do dia 1 do mês `monthIndex`
 * (0 = janeiro .. 11 = dezembro) do ano `year`.
 */
function startOfMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

/**
 * Último instante (`23:59:59.999`, UTC) do último dia do mês `monthIndex`
 * (0 = janeiro .. 11 = dezembro) do ano `year`. O dia 0 do mês seguinte
 * corresponde ao último dia deste mês.
 */
function endOfMonthUTC(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

/** Primeiro instante (`01/jan 00:00:00.000`, UTC) do ano `year`. */
function startOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
}

/** Último instante (`31/dez 23:59:59.999`, UTC) do ano `year`. */
function endOfYearUTC(year: number): Date {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

// ---------------------------------------------------------------------------
// Resolução de período
// ---------------------------------------------------------------------------

/**
 * Resolve um {@link Period} para um intervalo concreto de datas
 * {@link DateRange}, fechado e **inclusivo** em ambas as extremidades, usando a
 * convenção de calendário UTC descrita na documentação do módulo.
 *
 * - `CURRENT_MONTH`  — mês civil de `now` (`[1º dia 00:00, último dia 23:59:59.999]`).
 * - `PREVIOUS_MONTH` — mês civil imediatamente anterior ao de `now`.
 * - `CURRENT_YEAR`   — ano civil de `now` (`[01/jan 00:00, 31/dez 23:59:59.999]`).
 * - `CUSTOM`         — exatamente `[period.start, period.end]` conforme informado.
 *
 * No caso `CUSTOM`, esta função não valida a consistência do intervalo
 * (`start <= end`); um intervalo invertido apenas resulta em um recorte vazio
 * nos cálculos que o consomem. A validação de período de relatório é tratada à
 * parte (Req. 10.6, 10.7).
 *
 * É **pura e determinística**: depende apenas de `period` e da referência
 * `now`, sem ler o relógio do sistema.
 *
 * @param period Período selecionado no Dashboard.
 * @param now Instante de referência para os períodos relativos de calendário.
 * @returns Intervalo `[start, end]` inclusivo correspondente ao período.
 */
export function resolvePeriod(period: Period, now: Date): DateRange {
  switch (period.kind) {
    case "CURRENT_MONTH": {
      const year = now.getUTCFullYear();
      const monthIndex = now.getUTCMonth();
      return {
        start: startOfMonthUTC(year, monthIndex),
        end: endOfMonthUTC(year, monthIndex),
      };
    }
    case "PREVIOUS_MONTH": {
      const year = now.getUTCFullYear();
      const monthIndex = now.getUTCMonth();
      // `Date.UTC` normaliza `monthIndex - 1 = -1` para dezembro do ano anterior.
      return {
        start: startOfMonthUTC(year, monthIndex - 1),
        end: endOfMonthUTC(year, monthIndex - 1),
      };
    }
    case "CURRENT_YEAR": {
      const year = now.getUTCFullYear();
      return {
        start: startOfYearUTC(year),
        end: endOfYearUTC(year),
      };
    }
    case "CUSTOM": {
      return { start: period.start, end: period.end };
    }
    default: {
      // Exaustividade: todos os tipos de período são tratados acima.
      const exhaustive: never = period;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Predicado de pertinência ao intervalo
// ---------------------------------------------------------------------------

/**
 * Verdadeiro quando `date` pertence ao intervalo fechado e inclusivo `range`
 * (`range.start <= date <= range.end`). Datas inválidas (`NaN`) resultam em
 * `false`, pois qualquer comparação com `NaN` é `false`.
 */
function isWithin(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

// ---------------------------------------------------------------------------
// Saldo atual (independe do período)
// ---------------------------------------------------------------------------

/**
 * Calcula o **Saldo_Atual** como o somatório de todas as Receitas menos o
 * somatório de todas as Despesas cuja data seja **anterior ou igual** a `asOf`
 * (lançamentos registrados até a data corrente), em centavos (Req. 5.1).
 *
 * O resultado **não depende de nenhum período selecionado** no Dashboard: leva
 * em conta todos os lançamentos do conjunto recortados apenas pelo instante
 * `asOf`. O valor pode ser negativo quando as Despesas superam as Receitas.
 *
 * É **pura e total**: lançamentos com data inválida (`NaN`) ou posterior a
 * `asOf` não contribuem; um conjunto sem lançamentos elegíveis resulta em `0`.
 *
 * @param txs Lançamentos do Usuário (Receitas e Despesas).
 * @param asOf Instante de corte (inclusivo); normalmente a data corrente.
 * @returns Saldo em centavos (`Money`), podendo ser negativo.
 */
export function computeCurrentBalance(txs: Transaction[], asOf: Date): Money {
  const cutoff = asOf.getTime();
  const incomes: Money[] = [];
  const expenses: Money[] = [];

  for (const tx of txs) {
    if (!(tx.date.getTime() <= cutoff)) {
      continue;
    }
    if (tx.type === "INCOME") {
      incomes.push(tx.amount);
    } else {
      expenses.push(tx.amount);
    }
  }

  return subtract(sum(incomes), sum(expenses));
}

// ---------------------------------------------------------------------------
// Totais por período
// ---------------------------------------------------------------------------

/**
 * Calcula o **total de Receitas** e o **total de Despesas** cujos lançamentos
 * têm data dentro do período selecionado, separados por tipo (Req. 5.2).
 *
 * O período é resolvido por {@link resolvePeriod} e a pertinência é
 * **inclusiva** em ambas as extremidades. Quando nenhum período é informado,
 * adota-se o **mês civil corrente** como padrão (Req. 5.2). A referência
 * temporal `now` (usada pelos períodos relativos de calendário) é opcional e,
 * quando ausente, assume o instante corrente; para resultados determinísticos
 * (e em testes), informe `now` explicitamente.
 *
 * É **pura e total**: lançamentos fora do período ou com data inválida não
 * contribuem; um recorte vazio resulta em `{ income: 0, expense: 0 }` (estado
 * vazio do Dashboard — Req. 5.6).
 *
 * @param txs Lançamentos do Usuário (Receitas e Despesas).
 * @param period Período selecionado; padrão: mês civil corrente.
 * @param now Instante de referência para períodos relativos; padrão: agora.
 * @returns Totais em centavos: `{ income, expense }`.
 */
export function computeTotals(
  txs: Transaction[],
  period: Period = { kind: "CURRENT_MONTH" },
  now: Date = new Date(),
): { income: Money; expense: Money } {
  const range = resolvePeriod(period, now);
  const incomes: Money[] = [];
  const expenses: Money[] = [];

  for (const tx of txs) {
    if (!isWithin(tx.date, range)) {
      continue;
    }
    if (tx.type === "INCOME") {
      incomes.push(tx.amount);
    } else {
      expenses.push(tx.amount);
    }
  }

  return { income: sum(incomes), expense: sum(expenses) };
}

// ---------------------------------------------------------------------------
// Resultado mensal
// ---------------------------------------------------------------------------

/**
 * Calcula o **Resultado_Mensal** de um mês civil: total de Receitas menos total
 * de Despesas cujos lançamentos têm data dentro daquele mês, em centavos
 * (Req. 5.3). O valor pode ser negativo quando as Despesas superam as Receitas.
 *
 * O mês é interpretado em UTC; `month.month` é 1..12 (janeiro = 1). A
 * pertinência ao mês é **inclusiva** (do primeiro instante do dia 1 ao último
 * instante do último dia).
 *
 * É **pura e total**: um mês sem lançamentos resulta em `0`.
 *
 * @param txs Lançamentos do Usuário (Receitas e Despesas).
 * @param month Mês civil de referência (`{ year, month }`, `month` 1..12).
 * @returns Resultado mensal em centavos (`Money`), podendo ser negativo.
 */
export function computeMonthlyResult(txs: Transaction[], month: Month): Money {
  const monthIndex = month.month - 1;
  const range: DateRange = {
    start: startOfMonthUTC(month.year, monthIndex),
    end: endOfMonthUTC(month.year, monthIndex),
  };

  const incomes: Money[] = [];
  const expenses: Money[] = [];

  for (const tx of txs) {
    if (!isWithin(tx.date, range)) {
      continue;
    }
    if (tx.type === "INCOME") {
      incomes.push(tx.amount);
    } else {
      expenses.push(tx.amount);
    }
  }

  return subtract(sum(incomes), sum(expenses));
}
