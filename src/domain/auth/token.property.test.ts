import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  isTokenValid,
  markTokenUsed,
  computeExpiry,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  EMAIL_CHANGE_TTL_MS,
} from "@/domain/auth/token";
import { type TokenPurpose } from "@/domain/types";

/**
 * Teste de propriedade — Validade de token de uso único.
 *
 * Feature: financial-management-platform, Property 2: Validade de token de uso único
 *
 * *Para qualquer* token de verificação ou redefinição, ele é considerado
 * válido se e somente se não tiver sido usado e o instante atual for anterior
 * à sua expiração (24h para verificação de e-mail / alteração de e-mail, 1h
 * para redefinição de senha); após um uso bem-sucedido, o mesmo token nunca é
 * aceito novamente.
 *
 * Validates: Requirements 1.3, 1.4, 1.6, 3.1, 3.2, 3.3
 */

// ---------------------------------------------------------------------------
// Geradores (smart generators)
// ---------------------------------------------------------------------------

/** Instante base plausível (em ms desde a época), dentro de uma faixa segura. */
const baseTimeArb = fc.integer({
  min: Date.UTC(2000, 0, 1),
  max: Date.UTC(2100, 0, 1),
});

/**
 * Deslocamento em ms relativo ao instante de expiração, cobrindo
 * deliberadamente as três regiões da fronteira:
 * - estritamente negativo (`now` antes de `expiresAt` → não expirado);
 * - exatamente zero (`now === expiresAt` → fronteira exclusiva, expirado);
 * - estritamente positivo (`now` após `expiresAt` → expirado).
 */
const offsetArb = fc.oneof(
  // Antes da expiração (1ms .. ~30 dias antes).
  fc.integer({ min: -2_592_000_000, max: -1 }),
  // Exatamente na expiração (fronteira).
  fc.constant(0),
  // Depois da expiração (1ms .. ~30 dias depois).
  fc.integer({ min: 1, max: 2_592_000_000 }),
);

/** Todas as finalidades de token de uso único. */
const purposeArb: fc.Arbitrary<TokenPurpose> = fc.constantFrom(
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "EMAIL_CHANGE",
);

/** TTL esperado por finalidade, para verificar `computeExpiry`. */
const TTL_BY_PURPOSE: Record<TokenPurpose, number> = {
  EMAIL_VERIFICATION: EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET: PASSWORD_RESET_TTL_MS,
  EMAIL_CHANGE: EMAIL_CHANGE_TTL_MS,
};

// ---------------------------------------------------------------------------
// Property 2 — Validade sse não usado e antes da expiração (iff)
// ---------------------------------------------------------------------------

describe("Property 2: isTokenValid é verdadeiro sse !used && now < expiresAt", () => {
  it("respeita o iff em ambas as direções, incluindo a fronteira now === expiresAt", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        offsetArb,
        fc.boolean(),
        (expiresAtMs, offset, used) => {
          const expiresAt = new Date(expiresAtMs);
          const now = new Date(expiresAtMs + offset);
          const token = { used, expiresAt };

          const expected = !used && now.getTime() < expiresAt.getTime();
          expect(isTokenValid(token, now)).toBe(expected);
        },
      ),
    );
  });

  it("na fronteira exata (now === expiresAt) o token é inválido, independente de used", () => {
    fc.assert(
      fc.property(baseTimeArb, fc.boolean(), (expiresAtMs, used) => {
        const expiresAt = new Date(expiresAtMs);
        const now = new Date(expiresAtMs); // mesmo instante
        expect(isTokenValid({ used, expiresAt }, now)).toBe(false);
      }),
    );
  });

  it("antes da expiração com used=false é sempre válido; com used=true é sempre inválido", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        fc.integer({ min: 1, max: 2_592_000_000 }),
        (expiresAtMs, delta) => {
          const expiresAt = new Date(expiresAtMs);
          const now = new Date(expiresAtMs - delta); // estritamente antes
          expect(isTokenValid({ used: false, expiresAt }, now)).toBe(true);
          expect(isTokenValid({ used: true, expiresAt }, now)).toBe(false);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Uso único: após markTokenUsed nunca mais é válido
// ---------------------------------------------------------------------------

describe("Property 2: após markTokenUsed o token nunca é aceito novamente", () => {
  it("isTokenValid é falso para qualquer now após o consumo (inclusive antes da expiração)", () => {
    fc.assert(
      fc.property(baseTimeArb, offsetArb, fc.boolean(), (expiresAtMs, offset, used) => {
        const expiresAt = new Date(expiresAtMs);
        const consumed = markTokenUsed({ used, expiresAt });
        const now = new Date(expiresAtMs + offset);
        expect(isTokenValid(consumed, now)).toBe(false);
      }),
    );
  });

  it("permanece inválido em instantes representativos bem antes da expiração", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        fc.integer({ min: 1, max: 2_592_000_000 }),
        (expiresAtMs, delta) => {
          const expiresAt = new Date(expiresAtMs);
          const consumed = markTokenUsed({ used: false, expiresAt });
          const now = new Date(expiresAtMs - delta); // antes da expiração
          // Mesmo válido por tempo, o consumo o invalida permanentemente.
          expect(isTokenValid(consumed, now)).toBe(false);
        },
      ),
    );
  });

  it("markTokenUsed não muta a entrada (original.used permanece false) e preserva os demais campos", () => {
    fc.assert(
      fc.property(baseTimeArb, purposeArb, (issuedAtMs, purpose) => {
        const original = {
          purpose,
          used: false,
          expiresAt: new Date(issuedAtMs),
          createdAt: new Date(issuedAtMs),
        };
        const consumed = markTokenUsed(original);

        // Imutabilidade da entrada.
        expect(original.used).toBe(false);
        // Cópia marcada como usada.
        expect(consumed.used).toBe(true);
        // Identidade distinta (cópia, não a mesma referência).
        expect(consumed).not.toBe(original);
        // Demais campos preservados.
        expect(consumed.purpose).toBe(original.purpose);
        expect(consumed.expiresAt).toBe(original.expiresAt);
        expect(consumed.createdAt).toBe(original.createdAt);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — computeExpiry codifica os TTLs por finalidade (24h / 1h)
// ---------------------------------------------------------------------------

describe("Property 2: computeExpiry resulta em issuedAt + TTL da finalidade", () => {
  it("retorna issuedAt + TTL (24h verificação/alteração de e-mail, 1h redefinição) sem mutar issuedAt", () => {
    fc.assert(
      fc.property(baseTimeArb, purposeArb, (issuedAtMs, purpose) => {
        const issuedAt = new Date(issuedAtMs);
        const expiry = computeExpiry(purpose, issuedAt);

        expect(expiry.getTime()).toBe(issuedAtMs + TTL_BY_PURPOSE[purpose]);
        // issuedAt não foi mutado.
        expect(issuedAt.getTime()).toBe(issuedAtMs);
        // Resultado é uma nova instância.
        expect(expiry).not.toBe(issuedAt);
      }),
    );
  });

  it("o token recém-emitido é válido em issuedAt e inválido na expiração (consistência com isTokenValid)", () => {
    fc.assert(
      fc.property(baseTimeArb, purposeArb, (issuedAtMs, purpose) => {
        const issuedAt = new Date(issuedAtMs);
        const expiresAt = computeExpiry(purpose, issuedAt);
        const token = { used: false, expiresAt };

        // Válido no instante de emissão (now < expiresAt, pois TTL > 0).
        expect(isTokenValid(token, issuedAt)).toBe(true);
        // Inválido exatamente na expiração (fronteira exclusiva).
        expect(isTokenValid(token, expiresAt)).toBe(false);
      }),
    );
  });
});
