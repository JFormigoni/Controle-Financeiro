import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  isSessionActive,
  decideSessionAccess,
  isSessionAccessGranted,
  renewSession,
  computeSessionExpiry,
  SESSION_INACTIVITY_MS,
  type SessionActivity,
} from "@/domain/auth/session";
import { isOk, isErr } from "@/domain/result";

/**
 * Teste de propriedade — Validade e expiração de sessão por inatividade.
 *
 * Feature: financial-management-platform, Property 7: Validade e expiração de sessão por inatividade
 *
 * *Para qualquer* sessão e instante atual, o acesso a um recurso protegido é
 * concedido **se e somente se** a sessão existir e o tempo de inatividade desde
 * a última requisição (`now - lastActivityAt`) for **estritamente inferior** a
 * 30 minutos; sessões expiradas (inatividade ≥ 30min) ou inexistentes
 * (`null`/`undefined`) sempre resultam em acesso negado (`UNAUTHORIZED`).
 *
 * A fronteira é exclusiva: inatividade de **exatamente** 30 minutos já é
 * considerada expirada.
 *
 * Validates: Requirements 2.5, 2.7
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
 * Deslocamento de inatividade em ms (`now - lastActivityAt`), cobrindo
 * deliberadamente as três regiões da fronteira de 30 minutos:
 * - estritamente menor que 30min (sessão ativa);
 * - exatamente 30min (fronteira exclusiva → expirada);
 * - estritamente maior que 30min (expirada).
 *
 * Inclui também deslocamentos negativos (relógio adiantado / atividade
 * "no futuro"), que continuam representando inatividade < 30min → ativa.
 */
const inactivityOffsetArb = fc.oneof(
  // Estritamente dentro da janela (incluindo 0 e valores negativos).
  fc.integer({ min: -86_400_000, max: SESSION_INACTIVITY_MS - 1 }),
  // Exatamente na fronteira (30min) → expirada.
  fc.constant(SESSION_INACTIVITY_MS),
  // Estritamente além da janela (até ~30 dias depois).
  fc.integer({ min: SESSION_INACTIVITY_MS + 1, max: 2_592_000_000 }),
);

/** Sessão ausente (inexistente / não autenticada). */
const missingSessionArb = fc.constantFrom<null | undefined>(null, undefined);

// ---------------------------------------------------------------------------
// Property 7 — acesso concedido sse sessão existe E inatividade < 30min (iff)
// ---------------------------------------------------------------------------

describe("Property 7: acesso é concedido sse sessão existe e inatividade < 30min", () => {
  it("isSessionActive e decideSessionAccess.ok espelham exatamente o predicado, incluindo a fronteira", () => {
    fc.assert(
      fc.property(baseTimeArb, inactivityOffsetArb, (lastActivityMs, offset) => {
        const lastActivityAt = new Date(lastActivityMs);
        const now = new Date(lastActivityMs + offset);
        const session: SessionActivity = { lastActivityAt };

        const expected = offset < SESSION_INACTIVITY_MS;

        // Predicado de atividade espelha a desigualdade estrita.
        expect(isSessionActive(session, now)).toBe(expected);

        // A decisão de acesso espelha exatamente o predicado.
        const decision = decideSessionAccess(session, now);
        expect(isOk(decision)).toBe(expected);
        expect(isSessionAccessGranted(session, now)).toBe(expected);

        // Quando negado, é sempre UNAUTHORIZED (Req. 2.7).
        if (!expected) {
          expect(isErr(decision)).toBe(true);
          if (isErr(decision)) {
            expect(decision.error.code).toBe("UNAUTHORIZED");
          }
        }
      }),
    );
  });

  it("na fronteira exata (inatividade === 30min) a sessão está expirada e o acesso é negado", () => {
    fc.assert(
      fc.property(baseTimeArb, (lastActivityMs) => {
        const lastActivityAt = new Date(lastActivityMs);
        const now = new Date(lastActivityMs + SESSION_INACTIVITY_MS);
        const session: SessionActivity = { lastActivityAt };

        expect(isSessionActive(session, now)).toBe(false);
        expect(isSessionAccessGranted(session, now)).toBe(false);
        const decision = decideSessionAccess(session, now);
        expect(isErr(decision)).toBe(true);
      }),
    );
  });

  it("estritamente dentro da janela é sempre ativo; estritamente além é sempre expirado", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        fc.integer({ min: 1, max: SESSION_INACTIVITY_MS }),
        (lastActivityMs, delta) => {
          const lastActivityAt = new Date(lastActivityMs);
          const session: SessionActivity = { lastActivityAt };

          // Estritamente dentro: inatividade = SESSION_INACTIVITY_MS - delta < 30min.
          const withinNow = new Date(
            lastActivityMs + SESSION_INACTIVITY_MS - delta,
          );
          expect(isSessionActive(session, withinNow)).toBe(true);
          expect(isSessionAccessGranted(session, withinNow)).toBe(true);

          // Estritamente além: inatividade = SESSION_INACTIVITY_MS + delta > 30min.
          const beyondNow = new Date(
            lastActivityMs + SESSION_INACTIVITY_MS + delta,
          );
          expect(isSessionActive(session, beyondNow)).toBe(false);
          expect(isSessionAccessGranted(session, beyondNow)).toBe(false);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — sessão inexistente sempre resulta em acesso negado
// ---------------------------------------------------------------------------

describe("Property 7: sessão null/undefined nunca é ativa e sempre nega acesso", () => {
  it("para qualquer now, sessão ausente => não ativa e UNAUTHORIZED", () => {
    fc.assert(
      fc.property(baseTimeArb, missingSessionArb, (nowMs, missing) => {
        const now = new Date(nowMs);

        expect(isSessionActive(missing, now)).toBe(false);
        expect(isSessionAccessGranted(missing, now)).toBe(false);

        const decision = decideSessionAccess(missing, now);
        expect(isErr(decision)).toBe(true);
        if (isErr(decision)) {
          expect(decision.error.code).toBe("UNAUTHORIZED");
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7 — renovação deslizante e cálculo de expiração
// ---------------------------------------------------------------------------

describe("Property 7: renewSession (sliding) e computeSessionExpiry", () => {
  it("renewSession fixa lastActivityAt=now, tornando a sessão ativa em now (inatividade 0 < 30min)", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        // Inatividade arbitrária antes da renovação (pode estar expirada).
        fc.integer({ min: 0, max: 2_592_000_000 }),
        (lastActivityMs, priorInactivity) => {
          const stale: SessionActivity = {
            lastActivityAt: new Date(lastActivityMs),
          };
          const now = new Date(lastActivityMs + priorInactivity);

          const renewed = renewSession(stale, now);

          // A janela foi reposicionada em now.
          expect(renewed.lastActivityAt.getTime()).toBe(now.getTime());
          // Logo, a sessão renovada está ativa em now (inatividade = 0).
          expect(isSessionActive(renewed, now)).toBe(true);
          expect(isSessionAccessGranted(renewed, now)).toBe(true);

          // Não muta a entrada original.
          expect(stale.lastActivityAt.getTime()).toBe(lastActivityMs);
          // A renovada continua ativa logo antes da nova fronteira...
          const justBefore = new Date(
            now.getTime() + SESSION_INACTIVITY_MS - 1,
          );
          expect(isSessionActive(renewed, justBefore)).toBe(true);
          // ...e expira exatamente na nova fronteira.
          const atBoundary = new Date(now.getTime() + SESSION_INACTIVITY_MS);
          expect(isSessionActive(renewed, atBoundary)).toBe(false);
        },
      ),
    );
  });

  it("computeSessionExpiry(now) = now + 30min e equivale à fronteira de isSessionActive", () => {
    fc.assert(
      fc.property(baseTimeArb, (nowMs) => {
        const now = new Date(nowMs);
        const expiry = computeSessionExpiry(now);

        expect(expiry.getTime()).toBe(nowMs + SESSION_INACTIVITY_MS);
        // Não muta now e retorna nova instância.
        expect(now.getTime()).toBe(nowMs);
        expect(expiry).not.toBe(now);

        // Uma sessão renovada em now permanece ativa até (exclusive) `expiry`.
        const renewed = renewSession({ lastActivityAt: now }, now);
        expect(isSessionActive(renewed, new Date(expiry.getTime() - 1))).toBe(
          true,
        );
        expect(isSessionActive(renewed, expiry)).toBe(false);
      }),
    );
  });
});
