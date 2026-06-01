/**
 * Testes unitários do Motor de Recorrência (`src/domain/recurrence.ts`).
 *
 * Cobrem exemplos concretos e edge cases das decisões documentadas: primeira
 * ocorrência na data inicial, espaçamento por frequência, fronteira inclusiva
 * de `endDate`, janela de 12 meses quando `endDate` é nulo, arredondamento de
 * fim de mês (clamping) para mensal/anual e tratamento de entradas degeneradas.
 *
 * A propriedade universal (Property 21) é coberta separadamente em 9.8.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_HORIZON_MONTHS,
  type RecurringTransaction,
  generateOccurrences,
} from "@/domain/recurrence";
import { type Frequency } from "@/domain/types";

/** Constrói um modelo de série recorrente com valores padrão sobreponíveis. */
function makeBase(
  frequency: Frequency,
  startDate: Date,
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    userId: "user-1",
    categoryId: "cat-1",
    type: "EXPENSE",
    description: "Assinatura",
    amount: 1990,
    startDate,
    frequency,
    recurrenceId: "rec-1",
    ...overrides,
  };
}

/** Atalho para uma data em UTC. */
function utc(
  year: number,
  month1: number,
  day: number,
  h = 0,
  m = 0,
  s = 0,
): Date {
  return new Date(Date.UTC(year, month1 - 1, day, h, m, s));
}

/** Datas das ocorrências em ISO, para asserções legíveis. */
function isoDates(base: RecurringTransaction, endDate: Date | null): string[] {
  return generateOccurrences(base, endDate).map((o) => o.date.toISOString());
}

describe("generateOccurrences — primeira ocorrência e espaçamento", () => {
  it("a primeira ocorrência coincide com a data inicial", () => {
    const start = utc(2026, 1, 10, 9, 30);
    // endDate igual ao instante inicial: somente a primeira ocorrência cabe.
    const result = generateOccurrences(makeBase("DAILY", start), start);
    expect(result).toHaveLength(1);
    expect(result[0]?.date.toISOString()).toBe(start.toISOString());
  });

  it("frequência diária gera ocorrências a cada 1 dia (fim inclusivo)", () => {
    const start = utc(2026, 1, 1);
    expect(isoDates(makeBase("DAILY", start), utc(2026, 1, 4))).toEqual([
      utc(2026, 1, 1).toISOString(),
      utc(2026, 1, 2).toISOString(),
      utc(2026, 1, 3).toISOString(),
      utc(2026, 1, 4).toISOString(),
    ]);
  });

  it("frequência semanal gera ocorrências a cada 7 dias", () => {
    const start = utc(2026, 1, 1);
    expect(isoDates(makeBase("WEEKLY", start), utc(2026, 1, 22))).toEqual([
      utc(2026, 1, 1).toISOString(),
      utc(2026, 1, 8).toISOString(),
      utc(2026, 1, 15).toISOString(),
      utc(2026, 1, 22).toISOString(),
    ]);
  });

  it("frequência mensal avança um mês civil por ocorrência", () => {
    const start = utc(2026, 1, 15);
    expect(isoDates(makeBase("MONTHLY", start), utc(2026, 4, 15))).toEqual([
      utc(2026, 1, 15).toISOString(),
      utc(2026, 2, 15).toISOString(),
      utc(2026, 3, 15).toISOString(),
      utc(2026, 4, 15).toISOString(),
    ]);
  });

  it("frequência anual avança um ano civil por ocorrência", () => {
    const start = utc(2026, 6, 30);
    expect(isoDates(makeBase("YEARLY", start), utc(2029, 6, 30))).toEqual([
      utc(2026, 6, 30).toISOString(),
      utc(2027, 6, 30).toISOString(),
      utc(2028, 6, 30).toISOString(),
      utc(2029, 6, 30).toISOString(),
    ]);
  });

  it("preserva o horário do dia (UTC) em todas as ocorrências", () => {
    const start = utc(2026, 1, 1, 13, 45, 30);
    const result = generateOccurrences(makeBase("WEEKLY", start), utc(2026, 1, 15));
    for (const occ of result) {
      expect(occ.date.getUTCHours()).toBe(13);
      expect(occ.date.getUTCMinutes()).toBe(45);
      expect(occ.date.getUTCSeconds()).toBe(30);
    }
  });
});

describe("generateOccurrences — arredondamento de fim de mês (clamping)", () => {
  it("série mensal iniciada em 31/jan fixa no último dia válido sem deriva", () => {
    const start = utc(2026, 1, 31);
    // 2026 não é bissexto: fevereiro tem 28 dias.
    expect(isoDates(makeBase("MONTHLY", start), utc(2026, 4, 30))).toEqual([
      utc(2026, 1, 31).toISOString(),
      utc(2026, 2, 28).toISOString(),
      utc(2026, 3, 31).toISOString(),
      utc(2026, 4, 30).toISOString(),
    ]);
  });

  it("clamping de fevereiro respeita ano bissexto (29/fev)", () => {
    const start = utc(2028, 1, 31); // 2028 é bissexto
    const result = generateOccurrences(makeBase("MONTHLY", start), utc(2028, 2, 29));
    expect(result.map((o) => o.date.toISOString())).toEqual([
      utc(2028, 1, 31).toISOString(),
      utc(2028, 2, 29).toISOString(),
    ]);
  });

  it("série anual iniciada em 29/fev fixa em 28/fev nos anos não bissextos", () => {
    const start = utc(2028, 2, 29); // bissexto
    expect(isoDates(makeBase("YEARLY", start), utc(2031, 3, 1))).toEqual([
      utc(2028, 2, 29).toISOString(),
      utc(2029, 2, 28).toISOString(),
      utc(2030, 2, 28).toISOString(),
      utc(2031, 2, 28).toISOString(),
    ]);
  });
});

describe("generateOccurrences — janela de 12 meses quando endDate é null", () => {
  it("limita à janela de 12 meses (inclusive) a partir da data inicial", () => {
    const start = utc(2026, 1, 1);
    const result = generateOccurrences(makeBase("MONTHLY", start), null);
    // Jan/2026 .. Jan/2027 inclusive = 13 ocorrências.
    expect(result).toHaveLength(DEFAULT_HORIZON_MONTHS + 1);
    expect(result[0]?.date.toISOString()).toBe(utc(2026, 1, 1).toISOString());
    expect(result.at(-1)?.date.toISOString()).toBe(utc(2027, 1, 1).toISOString());
  });

  it("trata endDate inválida (NaN) como ausente, usando a janela de 12 meses", () => {
    const start = utc(2026, 1, 1);
    const withInvalid = generateOccurrences(makeBase("MONTHLY", start), new Date(NaN));
    const withNull = generateOccurrences(makeBase("MONTHLY", start), null);
    expect(withInvalid.map((o) => o.date.toISOString())).toEqual(
      withNull.map((o) => o.date.toISOString()),
    );
  });

  it("nenhuma ocorrência ultrapassa a janela de 12 meses para a frequência diária", () => {
    const start = utc(2026, 1, 1);
    const result = generateOccurrences(makeBase("DAILY", start), null);
    const horizon = utc(2027, 1, 1).getTime();
    expect(result.length).toBeGreaterThan(0);
    for (const occ of result) {
      expect(occ.date.getTime()).toBeLessThanOrEqual(horizon);
    }
    expect(result.at(-1)?.date.toISOString()).toBe(utc(2027, 1, 1).toISOString());
  });
});

describe("generateOccurrences — entradas degeneradas e metadados", () => {
  it("retorna lista vazia quando a data inicial é inválida", () => {
    const result = generateOccurrences(makeBase("DAILY", new Date(NaN)), utc(2026, 1, 10));
    expect(result).toEqual([]);
  });

  it("retorna lista vazia quando endDate é anterior à data inicial", () => {
    const start = utc(2026, 6, 1);
    expect(generateOccurrences(makeBase("DAILY", start), utc(2026, 5, 31))).toEqual([]);
  });

  it("inclui exatamente a data inicial quando endDate é igual a ela", () => {
    const start = utc(2026, 6, 1, 8);
    const result = generateOccurrences(makeBase("MONTHLY", start), start);
    expect(result).toHaveLength(1);
    expect(result[0]?.date.toISOString()).toBe(start.toISOString());
  });

  it("todas as ocorrências compartilham o mesmo recurrenceId e os campos do modelo", () => {
    const start = utc(2026, 1, 1);
    const base = makeBase("WEEKLY", start, {
      userId: "u-9",
      categoryId: "c-9",
      type: "INCOME",
      description: "Salário",
      amount: 500000,
      recurrenceId: "rec-shared",
    });
    const result = generateOccurrences(base, utc(2026, 1, 22));
    expect(result.length).toBeGreaterThan(1);
    for (const occ of result) {
      expect(occ.recurrenceId).toBe("rec-shared");
      expect(occ.userId).toBe("u-9");
      expect(occ.categoryId).toBe("c-9");
      expect(occ.type).toBe("INCOME");
      expect(occ.description).toBe("Salário");
      expect(occ.amount).toBe(500000);
    }
  });

  it("é independente de fuso: o resultado independe do fuso local do ambiente", () => {
    // Datas construídas em UTC produzem ISO estável; verificamos a ancoragem
    // na origem (sem deriva) comparando a 3ª ocorrência mensal calculada
    // diretamente da data inicial.
    const start = utc(2026, 1, 31);
    const result = generateOccurrences(makeBase("MONTHLY", start), utc(2026, 3, 31));
    expect(result.at(-1)?.date.toISOString()).toBe(utc(2026, 3, 31).toISOString());
  });
});
