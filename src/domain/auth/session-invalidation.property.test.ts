import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  invalidateUserSessions,
  shouldInvalidateAllSessions,
  type Session,
  type SecurityEvent,
} from "@/domain/auth/session-invalidation";

/**
 * Teste de propriedade — Invalidação de sessões por evento de segurança.
 *
 * Feature: financial-management-platform, Property 8: Invalidação de sessões por evento de segurança
 *
 * *Para qualquer* usuário com um conjunto de sessões ativas, após alterar /
 * redefinir sua senha ou ter sua conta desativada, o conjunto de sessões ativas
 * desse usuário fica vazio. As sessões dos demais usuários são preservadas
 * (mesmos elementos, na ordem original) e o array de entrada não é mutado.
 *
 * Validates: Requirements 3.6, 14.3
 */

// ---------------------------------------------------------------------------
// Geradores (smart generators)
// ---------------------------------------------------------------------------

/**
 * Pool pequeno de identificadores de usuário, para que arrays gerados contenham
 * frequentemente várias sessões do mesmo usuário (incluindo o usuário-alvo) e,
 * ao mesmo tempo, sessões de outros usuários a preservar.
 */
const USER_ID_POOL = ["u1", "u2", "u3", "u4"] as const;

const userIdArb: fc.Arbitrary<string> = fc.constantFrom(...USER_ID_POOL);

/** Os três eventos de segurança que disparam invalidação total. */
const eventArb: fc.Arbitrary<SecurityEvent> = fc.constantFrom(
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "ACCOUNT_DEACTIVATED",
);

/** Instante de expiração plausível, dentro de uma faixa segura. */
const expiresArb: fc.Arbitrary<Date> = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) })
  .map((ms) => new Date(ms));

/** Sessão arbitrária pertencente a um usuário do pool. */
const sessionArb: fc.Arbitrary<Session> = fc.record({
  id: fc.uuid(),
  userId: userIdArb,
  sessionToken: fc.uuid(),
  expires: expiresArb,
});

/** Conjunto (possivelmente vazio) de sessões de múltiplos usuários. */
const sessionsArb: fc.Arbitrary<Session[]> = fc.array(sessionArb, {
  maxLength: 20,
});

// ---------------------------------------------------------------------------
// Property 8 — Sessões do usuário-alvo ficam vazias; demais preservadas
// ---------------------------------------------------------------------------

describe("Property 8: Invalidação de sessões por evento de segurança", () => {
  it("remove TODAS as sessões do usuário-alvo, preserva as demais na ordem e não muta a entrada", () => {
    fc.assert(
      fc.property(
        sessionsArb,
        userIdArb,
        eventArb,
        (sessions, targetUserId, event) => {
          // Cópia rasa para detectar mutação no array de entrada.
          const snapshot = sessions.slice();

          const result = invalidateUserSessions(sessions, targetUserId, event);

          // (a) Nenhuma sessão do usuário-alvo permanece (conjunto vazio).
          expect(
            result.filter((s) => s.userId === targetUserId).length,
          ).toBe(0);

          // (b) O resultado é exatamente a entrada sem as sessões do alvo,
          //     com os mesmos elementos (referências) e a ordem preservada.
          const expected = sessions.filter((s) => s.userId !== targetUserId);
          expect(result).toEqual(expected);

          // (c) Imutabilidade: a entrada permanece inalterada em conteúdo e ordem.
          expect(sessions).toEqual(snapshot);
          // Novo array, distinto da referência de entrada.
          expect(result).not.toBe(sessions);
        },
      ),
    );
  });

  it("preserva intactas as sessões de outros usuários (mesmas referências)", () => {
    fc.assert(
      fc.property(
        sessionsArb,
        userIdArb,
        eventArb,
        (sessions, targetUserId, event) => {
          const result = invalidateUserSessions(sessions, targetUserId, event);

          // Cada sessão preservada é a MESMA referência da entrada.
          const others = sessions.filter((s) => s.userId !== targetUserId);
          expect(result.length).toBe(others.length);
          result.forEach((s, i) => {
            expect(s).toBe(others[i]);
          });
        },
      ),
    );
  });

  it("é idempotente: invalidar novamente o mesmo usuário não altera o resultado", () => {
    fc.assert(
      fc.property(
        sessionsArb,
        userIdArb,
        eventArb,
        (sessions, targetUserId, event) => {
          const once = invalidateUserSessions(sessions, targetUserId, event);
          const twice = invalidateUserSessions(once, targetUserId, event);
          expect(twice).toEqual(once);
        },
      ),
    );
  });

  it("todos os eventos de segurança modelados disparam invalidação total", () => {
    fc.assert(
      fc.property(eventArb, (event) => {
        expect(shouldInvalidateAllSessions(event)).toBe(true);
      }),
    );
  });
});
