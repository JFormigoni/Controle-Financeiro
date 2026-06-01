import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  type LoginAttemptState,
  isAccountLocked,
  nextLoginAttemptState,
  MAX_FAILED_ATTEMPTS,
  LOCK_DURATION_MS,
} from "@/domain/auth/login-attempts";

/**
 * Teste de propriedade — Máquina de estado de tentativas de login.
 *
 * Feature: financial-management-platform, Property 6: Máquina de estado de tentativas de login
 *
 * *Para qualquer* estado de tentativas e sequência de resultados de login, uma
 * falha (enquanto não bloqueado) incrementa o contador em exatamente 1, 5
 * falhas consecutivas sem sucesso intermediário acionam um bloqueio de 15
 * minutos durante o qual toda tentativa é rejeitada mesmo com credenciais
 * corretas, e qualquer autenticação bem-sucedida zera o contador e remove o
 * bloqueio.
 *
 * Validates: Requirements 2.2, 2.6, 2.8, 2.9
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
 * Avanço de tempo entre tentativas (em ms), constrangido ao espaço de entrada
 * relevante: cobre deliberadamente avanços curtos (dentro de uma eventual
 * janela de bloqueio de 15 min) e avanços longos (que ultrapassam o bloqueio,
 * permitindo sua expiração). Sempre não-negativo para que o tempo seja
 * monotônico.
 */
const stepDtArb = fc.oneof(
  // Avanço curto: 0 .. 15 min (mantém-se dentro de uma possível janela).
  fc.integer({ min: 0, max: LOCK_DURATION_MS }),
  // Avanço longo: ultrapassa a janela de bloqueio.
  fc.integer({ min: LOCK_DURATION_MS + 1, max: LOCK_DURATION_MS * 4 }),
);

/** Resultado de uma tentativa de login: `true` = sucesso, `false` = falha. */
const outcomeArb = fc.boolean();

/** Uma tentativa: resultado + avanço de tempo desde a tentativa anterior. */
const attemptArb = fc.record({ success: outcomeArb, dtMs: stepDtArb });

/** Sequência não-vazia de tentativas. */
const sequenceArb = fc.array(attemptArb, { minLength: 1, maxLength: 30 });

/** Estado inicial limpo: sem falhas e sem bloqueio. */
const CLEAN_STATE: LoginAttemptState = { failedLoginAttempts: 0, lockedUntil: null };

// ---------------------------------------------------------------------------
// Property 6 — Invariantes da transição passo a passo sobre uma sequência
// ---------------------------------------------------------------------------

describe("Property 6: invariantes da máquina de estado ao longo de uma sequência de tentativas", () => {
  it("falha (não bloqueado) +1, sucesso zera, e 5ª falha consecutiva aciona bloqueio de 15min", () => {
    fc.assert(
      fc.property(baseTimeArb, sequenceArb, (startMs, sequence) => {
        let state: LoginAttemptState = CLEAN_STATE;
        let nowMs = startMs;

        for (const { success, dtMs } of sequence) {
          nowMs += dtMs;
          const now = new Date(nowMs);
          const prev = state;
          const prevSnapshot = {
            failedLoginAttempts: prev.failedLoginAttempts,
            lockedUntilMs: prev.lockedUntil?.getTime() ?? null,
          };
          const wasLocked = isAccountLocked(prev, now);

          const next = nextLoginAttemptState(prev, success, now);

          // A entrada nunca é mutada (função pura).
          expect(prev.failedLoginAttempts).toBe(prevSnapshot.failedLoginAttempts);
          expect(prev.lockedUntil?.getTime() ?? null).toBe(prevSnapshot.lockedUntilMs);

          if (success) {
            // Req. 2.9 — sucesso zera o contador e remove o bloqueio.
            expect(next.failedLoginAttempts).toBe(0);
            expect(next.lockedUntil).toBeNull();
          } else if (wasLocked) {
            // Req. 2.8 — falha durante o bloqueio não incrementa nem estende.
            expect(next.failedLoginAttempts).toBe(prev.failedLoginAttempts);
            expect(next.lockedUntil?.getTime()).toBe(prev.lockedUntil?.getTime());
          } else {
            // Req. 2.2 — falha sem bloqueio incrementa em EXATAMENTE 1.
            expect(next.failedLoginAttempts).toBe(prev.failedLoginAttempts + 1);

            if (next.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
              // Req. 2.6 — ao alcançar o limite, bloqueia por 15 min a partir de `now`.
              expect(next.lockedUntil).not.toBeNull();
              expect(next.lockedUntil?.getTime()).toBe(nowMs + LOCK_DURATION_MS);
              // O bloqueio está vigente exatamente em `now`.
              expect(isAccountLocked(next, now)).toBe(true);
            } else {
              // Abaixo do limite permanece sem bloqueio.
              expect(next.lockedUntil).toBeNull();
              expect(isAccountLocked(next, now)).toBe(false);
            }
          }

          state = next;
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — 5 falhas consecutivas a partir de um estado limpo
// ---------------------------------------------------------------------------

describe("Property 6: 5 falhas consecutivas (estado limpo, sem sucesso) bloqueiam por 15 min", () => {
  it("após a 5ª falha lockedUntil = t5 + 15min; bloqueado durante a janela e liberado em/após o fim", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        // Avanços não-negativos entre as 5 falhas; pequenos para que nenhuma
        // delas, antes da 5ª, dispare bloqueio (contadores 1..4 < 5).
        fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 4, maxLength: 4 }),
        (startMs, gaps) => {
          let state: LoginAttemptState = CLEAN_STATE;
          let nowMs = startMs;
          let fifthFailureMs = startMs;

          for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
            if (i > 0) nowMs += gaps[i - 1] ?? 0;
            const now = new Date(nowMs);

            // Nenhuma das tentativas anteriores à 5ª deixou a conta bloqueada.
            expect(isAccountLocked(state, now)).toBe(false);

            state = nextLoginAttemptState(state, false, now);
            // Contador incrementa em exatamente 1 por falha.
            expect(state.failedLoginAttempts).toBe(i + 1);

            if (i === MAX_FAILED_ATTEMPTS - 1) {
              fifthFailureMs = nowMs;
            } else {
              // Antes da 5ª falha não há bloqueio.
              expect(state.lockedUntil).toBeNull();
            }
          }

          // Req. 2.6 — bloqueio de 15 min a partir da 5ª falha.
          const lockedUntilMs = fifthFailureMs + LOCK_DURATION_MS;
          expect(state.lockedUntil?.getTime()).toBe(lockedUntilMs);

          // Bloqueado no início e em qualquer instante dentro da janela.
          expect(isAccountLocked(state, new Date(fifthFailureMs))).toBe(true);
          expect(isAccountLocked(state, new Date(lockedUntilMs - 1))).toBe(true);
          // Liberado exatamente no fim (fronteira exclusiva) e depois.
          expect(isAccountLocked(state, new Date(lockedUntilMs))).toBe(false);
          expect(isAccountLocked(state, new Date(lockedUntilMs + 1))).toBe(false);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Durante o bloqueio toda tentativa é rejeitada (mesmo correta)
// ---------------------------------------------------------------------------

describe("Property 6: durante o bloqueio toda tentativa é rejeitada, mesmo com credenciais corretas", () => {
  it("isAccountLocked permanece true por toda a janela e a falha não estende o bloqueio", () => {
    fc.assert(
      fc.property(
        baseTimeArb,
        // Instante dentro da janela [lockStart, lockStart + 15min).
        fc.integer({ min: 0, max: LOCK_DURATION_MS - 1 }),
        (lockStartMs, withinOffset) => {
          const lockedUntil = new Date(lockStartMs + LOCK_DURATION_MS);
          const lockedState: LoginAttemptState = {
            failedLoginAttempts: MAX_FAILED_ATTEMPTS,
            lockedUntil,
          };

          const now = new Date(lockStartMs + withinOffset);

          // Req. 2.8 — a fronteira (auth-decision) verifica isAccountLocked ANTES
          // da checagem de credenciais; como ele é true por toda a janela, toda
          // tentativa é rejeitada independentemente das credenciais.
          expect(isAccountLocked(lockedState, now)).toBe(true);

          // Uma falha durante o bloqueio não incrementa o contador nem estende
          // o bloqueio.
          const afterFailure = nextLoginAttemptState(lockedState, false, now);
          expect(afterFailure.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS);
          expect(afterFailure.lockedUntil?.getTime()).toBe(lockedUntil.getTime());
          expect(isAccountLocked(afterFailure, now)).toBe(true);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Qualquer sucesso zera o contador e limpa o bloqueio
// ---------------------------------------------------------------------------

describe("Property 6: qualquer sucesso zera o contador e remove o bloqueio", () => {
  it("para qualquer estado de partida, success retorna { 0, null }", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.option(baseTimeArb, { nil: null }),
        baseTimeArb,
        (failedAttempts, lockedUntilMs, nowMs) => {
          const startState: LoginAttemptState = {
            failedLoginAttempts: failedAttempts,
            lockedUntil: lockedUntilMs === null ? null : new Date(lockedUntilMs),
          };

          const next = nextLoginAttemptState(startState, true, new Date(nowMs));

          // Req. 2.9 — zera o contador e limpa o bloqueio, qualquer que seja o estado.
          expect(next.failedLoginAttempts).toBe(0);
          expect(next.lockedUntil).toBeNull();
          // E, portanto, a conta não está bloqueada após o sucesso.
          expect(isAccountLocked(next, new Date(nowMs))).toBe(false);
        },
      ),
    );
  });
});
