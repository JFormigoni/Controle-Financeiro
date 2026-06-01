import { describe, it, expect } from "vitest";

import {
  computeCurrentBalance,
  computeMonthlyResult,
  computeTotals,
} from "@/domain/dashboard/balance";
import { distributionByCategory } from "@/domain/dashboard/distribution";
import {
  type Month,
  type Period,
  type Transaction,
  type TransactionType,
} from "@/domain/types";

/**
 * Teste unitário (baseado em exemplos) — Estado vazio do Dashboard (Req. 5.6).
 *
 * Feature: financial-management-platform
 *
 * Requisito 5.6: quando o Usuário **não possui Lançamentos registrados**, o
 * Dashboard exibe o Saldo_Atual, o total de Receitas, o total de Despesas e o
 * Resultado_Mensal com valor **zero** e apresenta uma **orientação** para
 * registrar o primeiro Lançamento.
 *
 * Este teste cobre a camada de **domínio**: com a lista de lançamentos vazia
 * (`[]`), os cálculos puros que alimentam o Dashboard reportam zeros e nenhuma
 * fatia de distribuição. São exatamente esses resultados (todos os totais em
 * zero e a distribuição vazia) que a interface usa para **detectar o estado
 * vazio** e renderizar a mensagem de orientação para registrar o primeiro
 * Lançamento.
 *
 * A mensagem de orientação em si é uma responsabilidade da **interface**
 * (renderização condicional na UI do Dashboard, tarefa 19.3) e, portanto, não é
 * verificada aqui — esta suíte garante o contrato do domínio: nenhuma entrada
 * ⇒ zeros e distribuição vazia, que é o sinal consumido pela UI.
 *
 * Validates: Requirements 5.6
 */

// ---------------------------------------------------------------------------
// Fixtures — lista vazia e parâmetros representativos
// ---------------------------------------------------------------------------

/** Conjunto de lançamentos vazio: o Usuário ainda não registrou nada. */
const NO_TRANSACTIONS: Transaction[] = [];

/** Instante de referência determinístico (UTC) usado como "agora". */
const NOW = new Date(Date.UTC(2026, 4, 15, 12, 0, 0, 0)); // 15/mai/2026 12:00 UTC

/** Data de corte representativa para o Saldo_Atual. */
const AS_OF = NOW;

/** Mês civil representativo para o Resultado_Mensal (maio/2026). */
const MONTH: Month = { year: 2026, month: 5 };

/** Períodos representativos cobrindo as quatro variantes de `Period`. */
const PERIODS: Array<{ name: string; period: Period }> = [
  { name: "CURRENT_MONTH", period: { kind: "CURRENT_MONTH" } },
  { name: "PREVIOUS_MONTH", period: { kind: "PREVIOUS_MONTH" } },
  { name: "CURRENT_YEAR", period: { kind: "CURRENT_YEAR" } },
  {
    name: "CUSTOM",
    period: {
      kind: "CUSTOM",
      start: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
    },
  },
];

const TYPES: TransactionType[] = ["INCOME", "EXPENSE"];

// ---------------------------------------------------------------------------
// Saldo_Atual (Req. 5.1) no estado vazio
// ---------------------------------------------------------------------------

describe("Estado vazio do Dashboard (Req. 5.6): Saldo_Atual", () => {
  it("computeCurrentBalance([], asOf) é 0 para uma lista de lançamentos vazia", () => {
    expect(computeCurrentBalance(NO_TRANSACTIONS, AS_OF)).toBe(0);
  });

  it("permanece 0 independentemente da data de corte", () => {
    const pastCutoff = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0));
    const futureCutoff = new Date(Date.UTC(2100, 0, 1, 0, 0, 0, 0));
    expect(computeCurrentBalance(NO_TRANSACTIONS, pastCutoff)).toBe(0);
    expect(computeCurrentBalance(NO_TRANSACTIONS, futureCutoff)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Totais por período (Req. 5.2) no estado vazio
// ---------------------------------------------------------------------------

describe("Estado vazio do Dashboard (Req. 5.6): totais de Receitas e Despesas", () => {
  it("computeTotals([]) usando o período padrão é { income: 0, expense: 0 }", () => {
    expect(computeTotals(NO_TRANSACTIONS, undefined, NOW)).toEqual({
      income: 0,
      expense: 0,
    });
  });

  for (const { name, period } of PERIODS) {
    it(`computeTotals([], ${name}, now) é { income: 0, expense: 0 }`, () => {
      expect(computeTotals(NO_TRANSACTIONS, period, NOW)).toEqual({
        income: 0,
        expense: 0,
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Resultado_Mensal (Req. 5.3) no estado vazio
// ---------------------------------------------------------------------------

describe("Estado vazio do Dashboard (Req. 5.6): Resultado_Mensal", () => {
  it("computeMonthlyResult([], { year, month }) é 0", () => {
    expect(computeMonthlyResult(NO_TRANSACTIONS, MONTH)).toBe(0);
  });

  it("permanece 0 para qualquer mês civil", () => {
    expect(
      computeMonthlyResult(NO_TRANSACTIONS, { year: 2025, month: 1 }),
    ).toBe(0);
    expect(
      computeMonthlyResult(NO_TRANSACTIONS, { year: 2030, month: 12 }),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Distribuição por categoria (Req. 5.4) no estado vazio
// ---------------------------------------------------------------------------

describe("Estado vazio do Dashboard (Req. 5.6): distribuição por categoria", () => {
  for (const { name, period } of PERIODS) {
    for (const type of TYPES) {
      it(`distributionByCategory([], ${name}, ${type}, now) é [] (sem fatias)`, () => {
        expect(distributionByCategory(NO_TRANSACTIONS, period, type, NOW)).toEqual(
          [],
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Sinal completo de estado vazio consumido pela UI (orientação fica na UI)
// ---------------------------------------------------------------------------

describe("Estado vazio do Dashboard (Req. 5.6): sinal agregado para a UI", () => {
  it("todos os valores consolidados são zero e a distribuição é vazia", () => {
    // A UI (tarefa 19.3) usa este conjunto de zeros/vazios para renderizar a
    // orientação de registrar o primeiro Lançamento. A mensagem em si é
    // responsabilidade da camada de interface, não do domínio.
    const period: Period = { kind: "CURRENT_MONTH" };

    const balance = computeCurrentBalance(NO_TRANSACTIONS, AS_OF);
    const totals = computeTotals(NO_TRANSACTIONS, period, NOW);
    const monthlyResult = computeMonthlyResult(NO_TRANSACTIONS, MONTH);
    const incomeDistribution = distributionByCategory(
      NO_TRANSACTIONS,
      period,
      "INCOME",
      NOW,
    );
    const expenseDistribution = distributionByCategory(
      NO_TRANSACTIONS,
      period,
      "EXPENSE",
      NOW,
    );

    expect(balance).toBe(0);
    expect(totals.income).toBe(0);
    expect(totals.expense).toBe(0);
    expect(monthlyResult).toBe(0);
    expect(incomeDistribution).toEqual([]);
    expect(expenseDistribution).toEqual([]);
  });
});
