import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { computeGoalProgress, isGoalComplete } from "@/domain/goal/progress";
import { type Money } from "@/domain/types";

/**
 * Teste de propriedade — Progresso e conclusão de Meta Financeira.
 *
 * Feature: financial-management-platform, Property 26: Progresso e conclusão de meta
 *
 * *Para qualquer* valor acumulado não negativo e valor-alvo positivo (metas
 * válidas), o progresso é igual a `min(100, 100 × acumulado ÷ alvo)`, permanece
 * sempre no intervalo de 0% a 100%, e a meta é marcada como concluída *se e
 * somente se* o acumulado for maior ou igual ao valor-alvo. Quando o acumulado
 * atinge ou ultrapassa o alvo, o progresso é exatamente 100%.
 *
 * Validates: Requirements 9.2, 9.4
 */

// ---------------------------------------------------------------------------
// Geradores (smart generators)
// ---------------------------------------------------------------------------

/**
 * Limite superior alinhado à faixa válida de centavos (R$ 999.999.999,99 =
 * 99_999_999_999 centavos, ver {@link Money}). Mesmo no pior caso,
 * `100 × acumulado` ≈ 1e13 permanece muito abaixo de
 * `Number.MAX_SAFE_INTEGER` (≈ 9e15), mantendo a aritmética inteira exata.
 */
const MAX_CENTS = 99_999_999_999;

/** Valor acumulado em centavos: não negativo (0 .. grande) para metas válidas. */
const accumulatedArb: fc.Arbitrary<Money> = fc.integer({
  min: 0,
  max: MAX_CENTS,
});

/** Valor-alvo em centavos: estritamente positivo (1 .. grande) para metas válidas. */
const targetArb: fc.Arbitrary<Money> = fc.integer({ min: 1, max: MAX_CENTS });

// ---------------------------------------------------------------------------
// Property 26
// ---------------------------------------------------------------------------

describe("Property 26: progresso e conclusão de meta", () => {
  it("progresso = min(100, 100×acumulado÷alvo), limitado a [0,100]; concluída sse acumulado≥alvo", () => {
    fc.assert(
      fc.property(accumulatedArb, targetArb, (accumulated, target) => {
        const progress = computeGoalProgress(accumulated, target);

        // Igualdade exata com a fórmula especificada (Req. 9.2).
        expect(progress).toBe(Math.min(100, (100 * accumulated) / target));

        // Progresso sempre limitado ao intervalo 0..100.
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(100);

        // Conclusão sse acumulado ≥ alvo (Req. 9.4).
        expect(isGoalComplete(accumulated, target)).toBe(accumulated >= target);

        // Ao atingir/ultrapassar o alvo, o progresso é exatamente 100%.
        if (accumulated >= target) {
          expect(progress).toBe(100);
        }
      }),
    );
  });

  it("guarda defensiva: alvo não positivo ⇒ progresso 0", () => {
    fc.assert(
      fc.property(
        accumulatedArb,
        fc.integer({ min: -MAX_CENTS, max: 0 }),
        (accumulated, nonPositiveTarget) => {
          expect(computeGoalProgress(accumulated, nonPositiveTarget)).toBe(0);
        },
      ),
    );
  });
});
