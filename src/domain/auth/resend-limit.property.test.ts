import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  MAX_RESENDS_PER_WINDOW,
  RESEND_WINDOW_MS,
  canResend,
  registerResend,
  resendsWithinWindow,
} from "@/domain/auth/resend-limit";

/**
 * Teste de propriedade do **limite de reenvio do e-mail de validação**
 * (Property 3).
 *
 * Regra (Req. 1.6): dentro de uma janela deslizante de 24 horas a plataforma
 * aceita no máximo 5 reenvios e rejeita qualquer solicitação adicional na mesma
 * janela; reenvios anteriores à janela não contam (poda).
 *
 * As funções sob teste são puras e totais: o histórico de reenvios e o instante
 * atual são injetados, sem relógio global. Os geradores abaixo são construídos
 * para exercitar o espaço relevante: sequências dentro de uma única janela,
 * contagens em torno do limite (5) e históricos misturando entradas recentes e
 * antigas.
 *
 * _Requirements: 1.6_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes
// ---------------------------------------------------------------------------

/**
 * Instante-base válido (em ms) com folga de mais de 24h antes da época, de modo
 * que seja sempre possível construir timestamps "antigos" anteriores ao início
 * da janela sem produzir datas negativas. Teto no ano ~2100.
 */
const baseMsArb: fc.Arbitrary<number> = fc.integer({
  min: RESEND_WINDOW_MS * 2,
  max: 4102444800000,
});

/**
 * Uma sequência de solicitações de reenvio contida em **uma única janela de
 * 24h**: a partir de um instante-base, vários deslocamentos não-negativos
 * estritamente menores que 24h, ordenados de forma crescente (tempo avança).
 *
 * Como o intervalo total é estritamente menor que 24h e os instantes são
 * não-decrescentes, nenhum reenvio aceito anteriormente sai da janela ao longo
 * do encadeamento — isolando a regra de "no máximo 5 por janela".
 */
const singleWindowSequenceArb: fc.Arbitrary<Date[]> = fc
  .record({
    base: baseMsArb,
    offsets: fc.array(
      fc.integer({ min: 0, max: RESEND_WINDOW_MS - 1 }),
      { minLength: 0, maxLength: 12 },
    ),
  })
  .map(({ base, offsets }) =>
    [...offsets]
      .sort((a, b) => a - b)
      .map((offset) => new Date(base + offset)),
  );

/**
 * Histórico de reenvios e instante atual relativos entre si. Cada entrada é
 * `now - delta`, com `delta` em `[0, 48h]`, garantindo uma mistura de entradas
 * dentro da janela (`delta < 24h`) e fora dela (`delta >= 24h`), de modo que a
 * contagem dentro da janela varie em torno do limite de 5.
 */
const historyAndNowArb: fc.Arbitrary<{ prev: Date[]; now: Date }> = fc
  .record({
    nowMs: baseMsArb,
    deltas: fc.array(
      fc.integer({ min: 0, max: RESEND_WINDOW_MS * 2 }),
      { maxLength: 15 },
    ),
  })
  .map(({ nowMs, deltas }) => ({
    now: new Date(nowMs),
    prev: deltas.map((delta) => new Date(nowMs - delta)),
  }));

/**
 * Histórico misturando entradas **recentes** (dentro da janela) e **antigas**
 * (no início da janela ou antes dela), em ordem embaralhada, junto do conjunto
 * de instantes recentes esperado. Usado para verificar a poda.
 */
const prunableHistoryArb: fc.Arbitrary<{
  prev: Date[];
  now: Date;
  expectedRecentMs: number[];
}> = fc
  .record({
    nowMs: baseMsArb,
    // Recentes: now - delta com delta em [0, 24h), portanto dentro de (now-24h, now].
    recentDeltas: fc.array(
      fc.integer({ min: 0, max: RESEND_WINDOW_MS - 1 }),
      { maxLength: 8 },
    ),
    // Antigas: now - 24h - extra (extra >= 0), portanto <= início da janela (excluídas).
    oldExtras: fc.array(
      fc.integer({ min: 0, max: RESEND_WINDOW_MS * 3 }),
      { maxLength: 8 },
    ),
    // Semente para embaralhar a ordem de entrada (a ordem não deve importar).
    order: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      maxLength: 16,
    }),
  })
  .map(({ nowMs, recentDeltas, oldExtras, order }) => {
    const recent = recentDeltas.map((delta) => nowMs - delta);
    const old = oldExtras.map((extra) => nowMs - RESEND_WINDOW_MS - extra);
    const combined = [...recent, ...old];
    // Embaralhamento determinístico baseado na semente `order`.
    const shuffled = combined
      .map((ms, index) => ({ ms, key: order[index] ?? index }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.ms);
    return {
      now: new Date(nowMs),
      prev: shuffled.map((ms) => new Date(ms)),
      expectedRecentMs: [...recent].sort((a, b) => a - b),
    };
  });

// ---------------------------------------------------------------------------
// Property 3: Limite de reenvio de e-mail de validação
// ---------------------------------------------------------------------------

describe("Property 3: Limite de reenvio de e-mail de validação", () => {
  // Feature: financial-management-platform, Property 3: Limite de reenvio de e-mail de validação
  // Para qualquer sequência de solicitações de reenvio dentro de uma janela de
  // 24h, no máximo 5 são aceitas e qualquer solicitação adicional na mesma
  // janela é rejeitada (RATE_LIMITED).
  it("aceita exatamente os 5 primeiros reenvios na janela e rejeita do 6º em diante", () => {
    fc.assert(
      fc.property(singleWindowSequenceArb, (timestamps) => {
        let history: Date[] = [];
        let acceptedCount = 0;

        timestamps.forEach((now, index) => {
          const result = registerResend(history, now);

          if (index < MAX_RESENDS_PER_WINDOW) {
            // Os primeiros 5 (índices 0..4) devem ser aceitos.
            expect(result.ok).toBe(true);
            if (result.ok) {
              history = result.value;
              acceptedCount += 1;
            }
          } else {
            // Do 6º em diante (índice >= 5): rejeitado por limite na janela.
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.error.code).toBe("RATE_LIMITED");
            }
            // Em rejeição, o histórico permanece inalterado.
          }
        });

        // Nunca mais de 5 reenvios aceitos; e exatamente min(n, 5).
        const expectedAccepted = Math.min(
          timestamps.length,
          MAX_RESENDS_PER_WINDOW,
        );
        expect(acceptedCount).toBe(expectedAccepted);
        expect(history.length).toBe(expectedAccepted);
        expect(history.length).toBeLessThanOrEqual(MAX_RESENDS_PER_WINDOW);
      }),
    );
  });

  // canResend é verdadeiro se e somente se há menos de 5 reenvios na janela.
  it("canResend(prev, now) sse resendsWithinWindow(prev, now).length < 5", () => {
    fc.assert(
      fc.property(historyAndNowArb, ({ prev, now }) => {
        const withinWindow = resendsWithinWindow(prev, now);
        expect(canResend(prev, now)).toBe(
          withinWindow.length < MAX_RESENDS_PER_WINDOW,
        );
      }),
    );
  });

  // Reenvios anteriores ao início da janela (mais de 24h) não contam (poda):
  // apenas os instantes recentes permanecem na janela.
  it("ignora reenvios anteriores a 24h, contando apenas os recentes", () => {
    fc.assert(
      fc.property(prunableHistoryArb, ({ prev, now, expectedRecentMs }) => {
        const withinWindow = resendsWithinWindow(prev, now);
        const actualMs = withinWindow.map((date) => date.getTime());

        // Apenas os recentes contam, na ordem cronológica crescente.
        expect(actualMs).toEqual(expectedRecentMs);
        expect(withinWindow.length).toBe(expectedRecentMs.length);
      }),
    );
  });
});
