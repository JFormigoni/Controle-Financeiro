/**
 * Distribuição por categoria (domínio puro) — Dashboard (Req. 5.4).
 *
 * Calcula, para um conjunto de {@link Transaction}, a participação de cada
 * Categoria dentro de um {@link Period} e de um {@link TransactionType}
 * (Receita ou Despesa). Para cada categoria presente no período, produz o
 * **valor acumulado** (soma dos lançamentos daquela categoria, em centavos) e o
 * **percentual** que esse valor representa em relação ao total do tipo no
 * período. Esses dados alimentam os gráficos de distribuição de Receitas e de
 * Despesas por Categoria do dashboard.
 *
 * ## Pureza e totalidade
 *
 * As funções deste módulo são **puras** (sem I/O, sem mutação da entrada) e
 * **totais** (não lançam). A única dependência externa opcional é o instante de
 * referência `now`, usado apenas para resolver os períodos relativos
 * (`CURRENT_MONTH`, `PREVIOUS_MONTH`, `CURRENT_YEAR`). Quando `now` é omitido,
 * o relógio do sistema é lido **uma única vez** na borda da chamada como
 * conveniência; para resultados determinísticos (e em testes), informe `now`
 * explicitamente. Dado um mesmo `now`, a função é determinística.
 *
 * ## Resolução de período (calendário civil, UTC)
 *
 * Para manter a saída **independente de fuso horário** e determinística, todos
 * os limites de período são calculados com **componentes UTC** (`Date.UTC`,
 * `getUTC*`), seguindo o calendário civil:
 *
 * - `CURRENT_MONTH`  — do primeiro instante do mês civil de `now` ao último.
 * - `PREVIOUS_MONTH` — do primeiro ao último instante do mês civil anterior
 *   (com tratamento de virada de ano).
 * - `CURRENT_YEAR`   — de 1º de janeiro 00:00:00.000 a 31 de dezembro
 *   23:59:59.999 do ano civil de `now`.
 * - `CUSTOM`         — o intervalo `[start, end]` informado, tal e qual.
 *
 * O intervalo resolvido é **fechado e inclusivo** em ambas as extremidades. Um
 * lançamento pertence ao período quando `start <= date <= end` (comparação por
 * instante absoluto, em milissegundos). Datas inválidas (`NaN`), seja no
 * lançamento, seja em um período `CUSTOM` mal-formado (`start > end` ou datas
 * inválidas), simplesmente não casam, resultando em distribuição vazia.
 *
 * ## Percentuais e arredondamento
 *
 * O percentual de cada categoria é a razão exata `100 * value / total`, em que
 * `total` é a soma de **todos** os lançamentos do tipo no período. Os
 * percentuais são mantidos **sem arredondamento** para casas fixas: dessa
 * forma, em aritmética exata, somam exatamente 100. Como `value` e `total` são
 * inteiros de centavos e a soma dos `value` é igual a `total`, a soma dos
 * percentuais equivale a `100 * total / total = 100`. A única imprecisão
 * possível é a representação IEEE-754 da divisão (erro da ordem de 1e-13),
 * inerente a ponto flutuante; nenhum arredondamento adicional é introduzido por
 * este módulo (Req. 5.4, Property 14).
 *
 * Quando o total do tipo no período é zero (nenhum lançamento), **não há fatias
 * a exibir** e a função retorna uma lista vazia (`[]`); os percentuais só são
 * exigíveis (e só somam 100) quando o total é positivo.
 *
 * Referência: design.md, "Serviço de Dashboard" e
 * "Property 14: Distribuição por categoria".
 */

import {
  type DateRange,
  type Money,
  type Period,
  type Transaction,
  type TransactionType,
} from "@/domain/types";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Participação de uma Categoria na distribuição de um tipo de lançamento em um
 * período.
 */
export interface CategoryShare {
  /** Identificador da categoria. */
  categoryId: string;
  /** Valor acumulado da categoria no período, em centavos (sempre positivo). */
  value: Money;
  /**
   * Percentual do valor da categoria em relação ao total do tipo no período,
   * na faixa `(0, 100]`. Razão exata `100 * value / total`, sem arredondamento
   * para casas fixas (ver a documentação do módulo).
   */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Resolução de período (UTC)
// ---------------------------------------------------------------------------

/**
 * Intervalo fechado e inclusivo `[start, end]` do mês civil `month`
 * (0 = janeiro .. 11 = dezembro) do ano `year`, em UTC. O dia 0 do mês seguinte
 * corresponde ao último dia deste mês.
 */
function monthRangeUTC(year: number, month: number): DateRange {
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  };
}

/**
 * Resolve um {@link Period} em um {@link DateRange} fechado e inclusivo,
 * usando o calendário civil em UTC e `now` como instante de referência para os
 * períodos relativos. Para `CUSTOM`, devolve o intervalo informado sem ajuste.
 */
function resolvePeriod(period: Period, now: Date): DateRange {
  switch (period.kind) {
    case "CURRENT_MONTH":
      return monthRangeUTC(now.getUTCFullYear(), now.getUTCMonth());
    case "PREVIOUS_MONTH": {
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const previousYear = month === 0 ? year - 1 : year;
      const previousMonth = month === 0 ? 11 : month - 1;
      return monthRangeUTC(previousYear, previousMonth);
    }
    case "CURRENT_YEAR": {
      const year = now.getUTCFullYear();
      return {
        start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
        end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      };
    }
    case "CUSTOM":
      return { start: period.start, end: period.end };
    default: {
      // Exaustividade: todas as variantes de `Period` são tratadas acima.
      const exhaustive: never = period;
      return exhaustive;
    }
  }
}

/**
 * Verdadeiro quando `date` é uma data válida e seu instante está contido no
 * intervalo fechado `[range.start, range.end]`. Datas inválidas (`NaN`) ou
 * intervalos mal-formados (extremos inválidos, ou `start > end`) nunca casam.
 */
function isWithin(date: Date, range: DateRange): boolean {
  const t = date.getTime();
  const start = range.start.getTime();
  const end = range.end.getTime();
  if (Number.isNaN(t) || Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return t >= start && t <= end;
}

// ---------------------------------------------------------------------------
// Distribuição por categoria
// ---------------------------------------------------------------------------

/**
 * Calcula a distribuição por categoria de um tipo de lançamento em um período.
 *
 * Filtra `txs` pelo `type` informado e pelo `period` resolvido (UTC, inclusivo),
 * agrupa por `categoryId` e, para cada categoria, produz o valor acumulado e o
 * percentual em relação ao total do tipo no período
 * (`percentage = 100 * value / total`). As fatias seguem a ordem de **primeira
 * aparição** de cada categoria em `txs` (determinística para uma mesma entrada).
 *
 * Quando o total do tipo no período é zero (nenhum lançamento correspondente),
 * retorna `[]` — não há fatias e nenhum percentual é definido. Caso contrário,
 * a soma dos `value` é igual ao total e a soma dos `percentage` é 100 (a menos
 * de erro de representação IEEE-754; ver a documentação do módulo).
 *
 * Função pura e total: não muta `txs` nem lê o relógio quando `now` é informado.
 *
 * @param txs Lançamentos candidatos (de um ou mais tipos/categorias).
 * @param period Período selecionado no dashboard.
 * @param type Tipo de lançamento considerado (Receita ou Despesa).
 * @param now Instante de referência para períodos relativos; padrão: agora.
 * @returns Fatias por categoria; lista vazia quando o total é zero.
 */
export function distributionByCategory(
  txs: Transaction[],
  period: Period,
  type: TransactionType,
  now: Date = new Date(),
): CategoryShare[] {
  const range = resolvePeriod(period, now);

  // Agrupa o valor por categoria preservando a ordem de primeira aparição.
  const valueByCategory = new Map<string, Money>();
  let total = 0;

  for (const tx of txs) {
    if (tx.type !== type) {
      continue;
    }
    if (!isWithin(tx.date, range)) {
      continue;
    }
    const accumulated = valueByCategory.get(tx.categoryId) ?? 0;
    valueByCategory.set(tx.categoryId, accumulated + tx.amount);
    total += tx.amount;
  }

  // Sem total positivo não há distribuição a apresentar (Req. 5.4).
  if (total <= 0) {
    return [];
  }

  const shares: CategoryShare[] = [];
  for (const [categoryId, value] of valueByCategory) {
    shares.push({
      categoryId,
      value,
      percentage: (100 * value) / total,
    });
  }
  return shares;
}
