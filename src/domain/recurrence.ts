/**
 * Motor de Recorrência (domínio puro).
 *
 * Gera a sequência de ocorrências de um {@link Lançamento_Recorrente} a partir
 * de um modelo (`RecurringTransaction`) e de uma data de término opcional. Cada
 * ocorrência é materializada como um objeto de dados pronto para persistência
 * (sem `id`/`createdAt`, que são atribuídos na fronteira de I/O), e todas as
 * ocorrências de uma mesma série compartilham o mesmo `recurrenceId`
 * (design.md, "Recorrência materializada"; Req. 6.5, 7.5).
 *
 * ## Regras de geração
 *
 * - A **primeira ocorrência coincide com a data inicial** (`startDate`); as
 *   demais são espaçadas exatamente por um intervalo da frequência
 *   (diária/semanal/mensal/anual).
 * - Quando `endDate` é informada, a geração segue **até** essa data, de forma
 *   **inclusiva**: uma ocorrência que caia exatamente em `endDate` é incluída;
 *   a primeira ocorrência cujo cálculo ultrapasse `endDate` encerra a série.
 * - Quando `endDate` é `null`, a geração é limitada à janela dos **12 meses
 *   seguintes à data inicial**, também de forma **inclusiva** — uma ocorrência
 *   que caia exatamente no aniversário de 12 meses (`startDate + 12 meses`, com
 *   o mesmo arredondamento de fim de mês descrito abaixo) é incluída.
 *
 * ## Aritmética de data determinística (UTC) e ancoragem
 *
 * Todo o cálculo de datas usa **componentes UTC** (`Date.UTC`,
 * `getUTC*`), tornando a geração **independente de fuso horário** e
 * **determinística**. O horário do dia (`hh:mm:ss.mmm`) de `startDate` é
 * preservado em todas as ocorrências.
 *
 * A n-ésima ocorrência é calculada **a partir da data inicial** (ancoragem na
 * origem), e não acumulando incrementos sobre a ocorrência anterior. Isso
 * evita "deriva" (*drift*) no caso mensal/anual com arredondamento de fim de
 * mês: por exemplo, uma série mensal iniciada em 31/jan produz 28/fev (ou
 * 29/fev em ano bissexto) e depois **31/mar** — e não 28/mar.
 *
 * ## Política de arredondamento de fim de mês (*clamping*)
 *
 * Para as frequências **mensal** e **anual**, quando o dia da data inicial não
 * existe no mês de destino (ex.: 31 em fevereiro, 29/fev em ano não bissexto),
 * a ocorrência é **fixada no último dia válido do mês de destino** (*clamp to
 * last valid day of the month*). As frequências **diária** e **semanal** usam
 * deslocamento exato de dias e nunca precisam de arredondamento.
 *
 * ## Totalidade e limites
 *
 * A função é **pura e total**: não lê o relógio do sistema, não lança e não
 * muta a entrada. A terminação é garantida pelo limite temporal (`endDate` ou a
 * janela de 12 meses), pois os intervalos são estritamente positivos e as datas
 * crescem de forma monótona. Como salvaguarda defensiva contra entradas
 * patológicas (ex.: `endDate` muito distante com frequência diária), a saída é
 * limitada a {@link MAX_OCCURRENCES} ocorrências.
 *
 * Entradas degeneradas são tratadas sem exceção:
 * - `startDate` inválida (`NaN`) ⇒ retorna lista vazia.
 * - `endDate` inválida (`NaN`) ⇒ tratada como `null` (usa a janela de 12 meses).
 * - `endDate` anterior à `startDate` ⇒ retorna lista vazia (nenhuma ocorrência
 *   cabe no intervalo).
 *
 * Referência: design.md, "Motor de Recorrência" e "Property 21: Geração de
 * ocorrências recorrentes".
 */

import { type Frequency, type Money, type Transaction, type TransactionType } from "@/domain/types";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/**
 * Tamanho da janela padrão (em meses) usada quando nenhuma data de término é
 * informada: os 12 meses seguintes à data inicial (Req. 6.5, 7.5).
 */
export const DEFAULT_HORIZON_MONTHS = 12;

/**
 * Limite máximo defensivo de ocorrências geradas em uma única chamada. Mantém a
 * função total e protege contra estouro de memória diante de entradas
 * patológicas (ex.: `endDate` a séculos de distância com frequência diária). Em
 * uso normal — janela de 12 meses ou término próximo — esse limite nunca é
 * atingido (uma série diária de 12 meses gera ~366 ocorrências).
 */
export const MAX_OCCURRENCES = 100_000;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Modelo (template) de um lançamento recorrente. Contém a âncora temporal da
 * série (`startDate`), a `frequency` e os campos necessários para materializar
 * cada ocorrência como um `Transaction`.
 *
 * O `recurrenceId` é compartilhado por todas as ocorrências geradas, permitindo
 * que histórico, relatórios e filtros tratem a série de forma uniforme.
 */
export interface RecurringTransaction {
  /** Dono da série de lançamentos. */
  userId: string;
  /** Categoria aplicada a todas as ocorrências (mesmo tipo do lançamento). */
  categoryId: string;
  /** Tipo do lançamento (Receita ou Despesa) — comum a toda a série. */
  type: TransactionType;
  /** Descrição livre de 1 a 200 caracteres, replicada em cada ocorrência. */
  description: string;
  /** Valor em centavos (1 .. 99_999_999_999), comum a todas as ocorrências. */
  amount: Money;
  /** Data da **primeira** ocorrência e âncora dos cálculos subsequentes. */
  startDate: Date;
  /** Frequência de repetição (diária/semanal/mensal/anual). */
  frequency: Frequency;
  /** Identificador compartilhado por todas as ocorrências desta série. */
  recurrenceId: string;
}

/**
 * Ocorrência materializada, pronta para persistência. Equivale a um
 * `Transaction` sem os campos atribuídos pela camada de infraestrutura
 * (`id` e `createdAt`). O `recurrenceId` é sempre preenchido (a ocorrência
 * pertence a uma série).
 */
export type GeneratedOccurrence = Omit<Transaction, "id" | "createdAt">;

// ---------------------------------------------------------------------------
// Aritmética de data (UTC)
// ---------------------------------------------------------------------------

/** Verdadeiro quando `date` é um objeto `Date` com instante válido. */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * Número de dias do mês `month` (0 = janeiro .. 11 = dezembro) do ano `year`,
 * em UTC. O dia 0 do mês seguinte corresponde ao último dia deste mês.
 */
function daysInMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Calcula a **n-ésima ocorrência** (`n >= 0`, sendo `n = 0` a própria data
 * inicial) a partir de `start`, segundo a `frequency`. O cálculo é ancorado em
 * `start` para evitar deriva e preserva o horário do dia em UTC.
 *
 * Para as frequências mensal e anual, o dia é fixado no último dia válido do
 * mês de destino quando o dia original não existe nele (*clamping*).
 */
function occurrenceAt(start: Date, frequency: Frequency, n: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const hours = start.getUTCHours();
  const minutes = start.getUTCMinutes();
  const seconds = start.getUTCSeconds();
  const ms = start.getUTCMilliseconds();

  switch (frequency) {
    case "DAILY":
      // `Date.UTC` normaliza o transbordo de dias entre meses/anos.
      return new Date(Date.UTC(year, month, day + n, hours, minutes, seconds, ms));
    case "WEEKLY":
      return new Date(Date.UTC(year, month, day + 7 * n, hours, minutes, seconds, ms));
    case "MONTHLY": {
      const totalMonths = month + n;
      const targetYear = year + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const clampedDay = Math.min(day, daysInMonthUTC(targetYear, targetMonth));
      return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms));
    }
    case "YEARLY": {
      const targetYear = year + n;
      // Cobre 29/fev em série anual: fixa em 28/fev nos anos não bissextos.
      const clampedDay = Math.min(day, daysInMonthUTC(targetYear, month));
      return new Date(Date.UTC(targetYear, month, clampedDay, hours, minutes, seconds, ms));
    }
    default: {
      // Exaustividade: todas as frequências são tratadas acima.
      const exhaustive: never = frequency;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Geração de ocorrências
// ---------------------------------------------------------------------------

/**
 * Gera as ocorrências de um lançamento recorrente.
 *
 * Produz a primeira ocorrência na data inicial (`base.startDate`) e, em
 * seguida, uma ocorrência a cada intervalo da `base.frequency`, até `endDate`
 * (inclusive) ou, quando `endDate` for `null`/inválida, até o aniversário de
 * {@link DEFAULT_HORIZON_MONTHS} meses da data inicial (inclusive). Todas as
 * ocorrências compartilham o `base.recurrenceId`.
 *
 * Consulte a documentação do módulo para a política de arredondamento de fim de
 * mês, a aritmética UTC, o tratamento de entradas degeneradas e o limite
 * defensivo {@link MAX_OCCURRENCES}.
 *
 * @param base Modelo do lançamento recorrente.
 * @param endDate Data de término (inclusiva) ou `null` para a janela de 12 meses.
 * @returns Lista de ocorrências em ordem cronológica crescente.
 */
export function generateOccurrences(
  base: RecurringTransaction,
  endDate: Date | null,
): GeneratedOccurrence[] {
  const start = base.startDate;
  if (!isValidDate(start)) {
    return [];
  }

  // Limite superior efetivo (inclusivo). `endDate` inválida é tratada como
  // ausente, recaindo na janela de 12 meses.
  const effectiveEnd =
    endDate !== null && isValidDate(endDate)
      ? endDate
      : occurrenceAt(start, "MONTHLY", DEFAULT_HORIZON_MONTHS);
  const effectiveEndMs = effectiveEnd.getTime();

  const occurrences: GeneratedOccurrence[] = [];
  for (let n = 0; n < MAX_OCCURRENCES; n++) {
    const date = occurrenceAt(start, base.frequency, n);
    if (date.getTime() > effectiveEndMs) {
      break;
    }
    occurrences.push(materialize(base, date));
  }
  return occurrences;
}

/** Materializa uma ocorrência da série na `date` indicada. */
function materialize(base: RecurringTransaction, date: Date): GeneratedOccurrence {
  return {
    userId: base.userId,
    categoryId: base.categoryId,
    type: base.type,
    description: base.description,
    amount: base.amount,
    date,
    recurrenceId: base.recurrenceId,
  };
}
