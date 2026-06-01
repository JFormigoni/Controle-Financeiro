/**
 * Teste de propriedade do Motor de Recorrência (`src/domain/recurrence.ts`).
 *
 * Cobre a **Property 21: Geração de ocorrências recorrentes** (design.md;
 * Req. 6.5, 7.5):
 *
 *   Para qualquer lançamento recorrente (frequência diária, semanal, mensal ou
 *   anual) e qualquer término informado (`null` ou uma data >= data inicial
 *   dentro de um horizonte razoável), `generateOccurrences`:
 *     - produz a primeira ocorrência exatamente na data inicial;
 *     - mantém todas as ocorrências dentro de `[startDate, effectiveEnd]`
 *       (inclusive), onde `effectiveEnd` é `endDate` ou `startDate + 12 meses`
 *       quando `endDate` é `null`; nenhuma ultrapassa esse limite;
 *     - gera datas estritamente crescentes, espaçadas pelo intervalo da
 *       frequência (espaçamento exato em ms para diária/semanal; avanço de
 *       1 mês/1 ano civil com arredondamento de fim de mês para mensal/anual);
 *     - replica em cada ocorrência os campos do modelo (userId, categoryId,
 *       type, description, amount) e o mesmo `recurrenceId`;
 *     - tem contagem limitada (>= 1 quando `start <= effectiveEnd`; diária com
 *       término nulo ~ 366/367; mensal com término nulo = 13).
 *
 * A expectativa é derivada de um **oráculo independente** (`occurrenceAtOracle`)
 * que reimplementa a aritmética UTC ancorada e documentada — para diária/semanal
 * via múltiplos exatos de milissegundos (independente do transbordo de
 * `Date.UTC`), e para mensal/anual via componentes UTC com *clamping* ao último
 * dia válido do mês. Além da igualdade contra o oráculo, são verificados os
 * invariantes mais fracos-porém-verdadeiros (monotonicidade estrita, limites,
 * passo de calendário e preservação do horário) recomendados pela tarefa.
 *
 * _Requirements: 6.5, 7.5_
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  DEFAULT_HORIZON_MONTHS,
  MAX_OCCURRENCES,
  type RecurringTransaction,
  generateOccurrences,
} from "@/domain/recurrence";
import { type Frequency, type TransactionType } from "@/domain/types";

// ---------------------------------------------------------------------------
// Constantes e oráculo independente
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Número de dias do mês `month` (0..11) do ano `year`, em UTC. */
function daysInMonthUTC(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Oráculo independente da n-ésima ocorrência (`n >= 0`, `n = 0` é a própria
 * data inicial), conforme a semântica documentada em `recurrence.ts`.
 *
 * Diária/semanal usam múltiplos exatos de milissegundos a partir do instante
 * inicial (sem depender da normalização de transbordo do `Date.UTC`). Mensal/
 * anual ancoram na origem e fixam (*clamp*) o dia no último dia válido do mês de
 * destino, preservando o horário do dia (UTC).
 */
function occurrenceAtOracle(start: Date, frequency: Frequency, n: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const hh = start.getUTCHours();
  const mm = start.getUTCMinutes();
  const ss = start.getUTCSeconds();
  const ms = start.getUTCMilliseconds();

  switch (frequency) {
    case "DAILY":
      return new Date(start.getTime() + n * DAY_MS);
    case "WEEKLY":
      return new Date(start.getTime() + n * WEEK_MS);
    case "MONTHLY": {
      const totalMonths = month + n;
      const targetYear = year + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const clampedDay = Math.min(day, daysInMonthUTC(targetYear, targetMonth));
      return new Date(Date.UTC(targetYear, targetMonth, clampedDay, hh, mm, ss, ms));
    }
    case "YEARLY": {
      const targetYear = year + n;
      const clampedDay = Math.min(day, daysInMonthUTC(targetYear, month));
      return new Date(Date.UTC(targetYear, month, clampedDay, hh, mm, ss, ms));
    }
  }
}

/** `effectiveEnd` documentado: `endDate` (se válida) ou `startDate + 12 meses`. */
function effectiveEndOf(start: Date, endDate: Date | null): Date {
  if (endDate !== null && !Number.isNaN(endDate.getTime())) {
    return endDate;
  }
  return occurrenceAtOracle(start, "MONTHLY", DEFAULT_HORIZON_MONTHS);
}

/** Sequência de datas esperada, iterando o oráculo contra `effectiveEnd`. */
function expectedDates(start: Date, frequency: Frequency, endDate: Date | null): Date[] {
  const endMs = effectiveEndOf(start, endDate).getTime();
  const dates: Date[] = [];
  for (let n = 0; n < MAX_OCCURRENCES; n++) {
    const d = occurrenceAtOracle(start, frequency, n);
    if (d.getTime() > endMs) {
      break;
    }
    dates.push(d);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Geradores inteligentes
// ---------------------------------------------------------------------------

const FREQUENCIES: readonly Frequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const TYPES: readonly TransactionType[] = ["INCOME", "EXPENSE"];

/**
 * Data inicial válida em UTC. O dia bruto (1..31) é fixado ao último dia válido
 * do mês, enviesando a geração para finais de mês (28..31) e exercitando o
 * arredondamento (*clamping*) das frequências mensal/anual. O horário do dia é
 * sorteado para validar sua preservação.
 */
const startDateArb: fc.Arbitrary<Date> = fc
  .record({
    year: fc.integer({ min: 2000, max: 2060 }),
    month: fc.integer({ min: 0, max: 11 }),
    dayRaw: fc.integer({ min: 1, max: 31 }),
    hours: fc.integer({ min: 0, max: 23 }),
    minutes: fc.integer({ min: 0, max: 59 }),
    seconds: fc.integer({ min: 0, max: 59 }),
    millis: fc.integer({ min: 0, max: 999 }),
  })
  .map(({ year, month, dayRaw, hours, minutes, seconds, millis }) => {
    const day = Math.min(dayRaw, daysInMonthUTC(year, month));
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds, millis));
  });

/** Limite de passos por frequência, mantendo as contagens (e o teste) modestos. */
const MAX_STEPS: Record<Frequency, number> = {
  DAILY: 120,
  WEEKLY: 104,
  MONTHLY: 36,
  YEARLY: 20,
};

/**
 * Término dependente da frequência: `null` (janela de 12 meses) ou uma data
 * `>= start` posicionada na k-ésima ocorrência mais um deslocamento dentro do
 * intervalo seguinte. Isso cobre tanto a **fronteira inclusiva** (deslocamento
 * 0, término exatamente sobre uma ocorrência) quanto cortes no meio do
 * intervalo, sempre respeitando `endDate >= startDate`.
 */
function endDateArb(start: Date, frequency: Frequency): fc.Arbitrary<Date | null> {
  const within = fc.integer({ min: 0, max: MAX_STEPS[frequency] }).chain((k) => {
    const thisMs = occurrenceAtOracle(start, frequency, k).getTime();
    const nextMs = occurrenceAtOracle(start, frequency, k + 1).getTime();
    return fc
      .integer({ min: 0, max: nextMs - thisMs - 1 })
      .map((extra) => new Date(thisMs + extra));
  });
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant(null) },
    { weight: 4, arbitrary: within },
  );
}

/** Modelo de série recorrente com campos arbitrários e a `startDate`/`frequency` dadas. */
function baseArb(start: Date, frequency: Frequency): fc.Arbitrary<RecurringTransaction> {
  return fc.record({
    userId: fc.string({ minLength: 1, maxLength: 24 }),
    categoryId: fc.string({ minLength: 1, maxLength: 24 }),
    type: fc.constantFrom(...TYPES),
    description: fc.string({ minLength: 1, maxLength: 200 }),
    amount: fc.integer({ min: 1, max: 99_999_999_999 }),
    recurrenceId: fc.string({ minLength: 1, maxLength: 36 }),
    startDate: fc.constant(start),
    frequency: fc.constant(frequency),
  });
}

/** Caso completo: frequência, modelo (com startDate) e término coerente. */
const caseArb: fc.Arbitrary<{ base: RecurringTransaction; endDate: Date | null }> = fc
  .constantFrom(...FREQUENCIES)
  .chain((frequency) =>
    startDateArb.chain((start) =>
      fc.record({
        base: baseArb(start, frequency),
        endDate: endDateArb(start, frequency),
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Property 21: Geração de ocorrências recorrentes
// ---------------------------------------------------------------------------

describe("Property 21: Geração de ocorrências recorrentes", () => {
  // Feature: financial-management-platform, Property 21: Geração de ocorrências recorrentes
  // Para qualquer base recorrente e término (null ou data >= startDate): a primeira
  // ocorrência é a data inicial; todas ficam em [startDate, effectiveEnd] (inclusive);
  // as datas são estritamente crescentes e espaçadas pelo intervalo da frequência
  // (com clamping de fim de mês para mensal/anual); todas replicam recurrenceId e os
  // campos do modelo; e a contagem é limitada (>= 1 quando start <= effectiveEnd).
  it("respeita primeira ocorrência, limites inclusivos, espaçamento e metadados", () => {
    fc.assert(
      fc.property(caseArb, ({ base, endDate }) => {
        const start = base.startDate;
        const frequency = base.frequency;
        const effectiveEnd = effectiveEndOf(start, endDate);
        const expected = expectedDates(start, frequency, endDate);

        const result = generateOccurrences(base, endDate);

        // Contagem: igual ao oráculo e >= 1 (start <= effectiveEnd por construção).
        expect(result).toHaveLength(expected.length);
        expect(result.length).toBeGreaterThanOrEqual(1);

        // Igualdade contra o oráculo independente (cobre espaçamento e clamping).
        for (let i = 0; i < result.length; i++) {
          expect(result[i]?.date.getTime()).toBe(expected[i]?.getTime());
        }

        // Primeira ocorrência coincide exatamente com a data inicial.
        expect(result[0]?.date.getTime()).toBe(start.getTime());

        const startMs = start.getTime();
        const endMs = effectiveEnd.getTime();
        for (let i = 0; i < result.length; i++) {
          const occ = result[i]!;
          const occMs = occ.date.getTime();

          // Limites inclusivos: nenhuma ocorrência fora de [start, effectiveEnd].
          expect(occMs).toBeGreaterThanOrEqual(startMs);
          expect(occMs).toBeLessThanOrEqual(endMs);

          // Metadados replicados do modelo + recurrenceId compartilhado.
          expect(occ.userId).toBe(base.userId);
          expect(occ.categoryId).toBe(base.categoryId);
          expect(occ.type).toBe(base.type);
          expect(occ.description).toBe(base.description);
          expect(occ.amount).toBe(base.amount);
          expect(occ.recurrenceId).toBe(base.recurrenceId);

          // Horário do dia (UTC) preservado em todas as ocorrências.
          expect(occ.date.getUTCHours()).toBe(start.getUTCHours());
          expect(occ.date.getUTCMinutes()).toBe(start.getUTCMinutes());
          expect(occ.date.getUTCSeconds()).toBe(start.getUTCSeconds());
          expect(occ.date.getUTCMilliseconds()).toBe(start.getUTCMilliseconds());

          // Estritamente crescente.
          if (i > 0) {
            expect(occMs).toBeGreaterThan(result[i - 1]!.date.getTime());
          }

          // Invariantes de passo por frequência (independentes do oráculo).
          if (i > 0) {
            const prev = result[i - 1]!.date;
            assertStep(prev, occ.date, frequency, start);
          }
        }
      }),
    );
  });

  it("janela de 12 meses para término nulo: diária gera 366 ou 367 ocorrências", () => {
    fc.assert(
      fc.property(startDateArb, baseFieldsArb, (start, fields) => {
        const base: RecurringTransaction = {
          ...fields,
          startDate: start,
          frequency: "DAILY",
        };
        const result = generateOccurrences(base, null);
        // 12 meses civis abrangem 365 ou 366 dias → 366/367 ocorrências inclusivas.
        expect(result.length).toBeGreaterThanOrEqual(366);
        expect(result.length).toBeLessThanOrEqual(367);
        expect(result[0]?.date.getTime()).toBe(start.getTime());
        expect(result.at(-1)?.date.getTime()).toBe(
          occurrenceAtOracle(start, "MONTHLY", DEFAULT_HORIZON_MONTHS).getTime(),
        );
      }),
    );
  });

  it("janela de 12 meses para término nulo: mensal gera exatamente 13 ocorrências", () => {
    fc.assert(
      fc.property(startDateArb, baseFieldsArb, (start, fields) => {
        const base: RecurringTransaction = {
          ...fields,
          startDate: start,
          frequency: "MONTHLY",
        };
        const result = generateOccurrences(base, null);
        expect(result).toHaveLength(DEFAULT_HORIZON_MONTHS + 1);
        expect(result[0]?.date.getTime()).toBe(start.getTime());
      }),
    );
  });
});

/** Campos do modelo, sem `startDate`/`frequency` (definidos por cada teste). */
const baseFieldsArb = fc.record({
  userId: fc.string({ minLength: 1, maxLength: 24 }),
  categoryId: fc.string({ minLength: 1, maxLength: 24 }),
  type: fc.constantFrom(...TYPES),
  description: fc.string({ minLength: 1, maxLength: 200 }),
  amount: fc.integer({ min: 1, max: 99_999_999_999 }),
  recurrenceId: fc.string({ minLength: 1, maxLength: 36 }),
});

/**
 * Verifica o passo entre duas ocorrências consecutivas conforme a frequência:
 * - diária/semanal: diferença exata em milissegundos (1 ou 7 dias);
 * - mensal: avanço de exatamente 1 mês civil, com o dia fixado ao último dia
 *   válido do mês (*clamping*) e ancorado na origem;
 * - anual: avanço de exatamente 1 ano civil, mesmo mês, com clamping de 29/fev.
 */
function assertStep(prev: Date, curr: Date, frequency: Frequency, start: Date): void {
  const startDay = start.getUTCDate();
  switch (frequency) {
    case "DAILY":
      expect(curr.getTime() - prev.getTime()).toBe(DAY_MS);
      break;
    case "WEEKLY":
      expect(curr.getTime() - prev.getTime()).toBe(WEEK_MS);
      break;
    case "MONTHLY": {
      const prevIdx = prev.getUTCFullYear() * 12 + prev.getUTCMonth();
      const currIdx = curr.getUTCFullYear() * 12 + curr.getUTCMonth();
      expect(currIdx - prevIdx).toBe(1);
      // Dia da ocorrência fixado ao último dia válido do mês (não-clamp = dia da origem).
      expect(curr.getUTCDate()).toBe(
        Math.min(startDay, daysInMonthUTC(curr.getUTCFullYear(), curr.getUTCMonth())),
      );
      break;
    }
    case "YEARLY": {
      expect(curr.getUTCFullYear() - prev.getUTCFullYear()).toBe(1);
      expect(curr.getUTCMonth()).toBe(start.getUTCMonth());
      expect(curr.getUTCDate()).toBe(
        Math.min(startDay, daysInMonthUTC(curr.getUTCFullYear(), curr.getUTCMonth())),
      );
      break;
    }
  }
}
