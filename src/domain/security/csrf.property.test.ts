import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  generateCsrfToken,
  validateCsrfToken,
  isCsrfTokenValid,
  type ValidateCsrfParams,
} from "@/domain/security/csrf";

/**
 * Teste de propriedade da validação anti-CSRF (Req. 16.3, 16.4).
 *
 * Cobre a Property 41 ("Validação de token anti-CSRF"): um token é aceito **se
 * e somente se** todas as condições abaixo são verdadeiras simultaneamente:
 *
 *  1. **Presente**      — não nulo/indefinido e não vazio;
 *  2. **Bem-formado**   — formato `<expiresAtMs>.<assinaturaHex(64)>`;
 *  3. **Mesma sessão**  — vinculado ao `sessionId` que valida a requisição;
 *  4. **Autêntico**     — assinatura HMAC confere com o segredo do servidor;
 *  5. **Não expirado**  — `now < expiresAt`.
 *
 * O teste constrói, para cada execução, um de sete cenários. Apenas o cenário
 * "valid" satisfaz as cinco condições; cada um dos demais viola exatamente uma
 * delas (expirado, sessão errada, segredo errado, token adulterado, lixo
 * aleatório, token ausente). Assim, `isCsrfTokenValid` deve retornar `true`
 * **exatamente** no cenário "valid" e `false` em todos os outros — o que
 * estabelece o bicondicional (iff) exigido pelo Req. 16.3. Em toda rejeição, o
 * estado não deve mudar e o erro deve ser de autorização (`FORBIDDEN`,
 * Req. 16.4).
 *
 * Determinismo: o `secret` é sempre passado explicitamente, tornando geração e
 * validação puras (sem leitura de ambiente, sem I/O).
 */
describe("validateCsrfToken: propriedades (Req. 16.3, 16.4)", () => {
  /** Sete cenários: somente "valid" deve ser aceito. */
  const scenarioArb = fc.constantFrom(
    "valid",
    "expired",
    "wrongSession",
    "wrongSecret",
    "tampered",
    "garbage",
    "missing",
  );

  /** Segredo HMAC sempre não vazio (vazio dispararia leitura de ambiente). */
  const secretArb = fc.string({ minLength: 1 });

  /** `now` em uma janela com aritmética dentro de inteiros seguros. */
  const nowArb = fc.date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2100-01-01T00:00:00.000Z"),
    noInvalidDate: true,
  });

  /** Tempo de vida positivo (até uma semana). */
  const ttlArb = fc.integer({ min: 1, max: 7 * 24 * 60 * 60 * 1000 });

  const HEX = "0123456789abcdef";

  // Feature: financial-management-platform, Property 41: Validação de token anti-CSRF
  // Validates: Requirements 16.3, 16.4
  it("aceita um token sse presente, bem-formado, da mesma sessão, autêntico e não expirado", () => {
    fc.assert(
      fc.property(
        fc.record({
          scenario: scenarioArb,
          sessionId: fc.string(),
          sessionOther: fc.string(),
          secret: secretArb,
          secretOther: secretArb,
          now: nowArb,
          ttl: ttlArb,
          offsetSeed: fc.nat(),
          expiredExtra: fc.integer({ min: 0, max: 1_000_000_000 }),
          flipSeed: fc.nat(),
          garbage: fc.string(),
          missing: fc.constantFrom<string | null | undefined>(
            null,
            undefined,
            "",
            "   ",
            "\t\n",
          ),
        }),
        (c) => {
          const token = generateCsrfToken(c.sessionId, c.now, c.secret, c.ttl);
          const { expiresAt } = token;
          const nowMs = c.now.getTime();

          // Garante alteridade real onde o cenário exige diferença.
          const otherSession =
            c.sessionOther === c.sessionId
              ? `${c.sessionId}X`
              : c.sessionOther;
          const otherSecret =
            c.secretOther === c.secret ? `${c.secret}X` : c.secretOther;

          let params: ValidateCsrfParams;
          let expectedAccept: boolean;

          switch (c.scenario) {
            case "valid": {
              // Valida em um instante dentro de [now, expiresAt): não expirado.
              const offset = c.offsetSeed % c.ttl; // [0, ttl)
              params = {
                sessionId: c.sessionId,
                token: token.value,
                now: new Date(nowMs + offset),
                secret: c.secret,
              };
              expectedAccept = true;
              break;
            }
            case "expired": {
              // Valida em now >= expiresAt: viola apenas a expiração.
              params = {
                sessionId: c.sessionId,
                token: token.value,
                now: new Date(expiresAt + c.expiredExtra),
                secret: c.secret,
              };
              expectedAccept = false;
              break;
            }
            case "wrongSession": {
              // Token de outra sessão: assinatura não confere com este sessionId.
              params = {
                sessionId: otherSession,
                token: token.value,
                now: new Date(nowMs),
                secret: c.secret,
              };
              expectedAccept = false;
              break;
            }
            case "wrongSecret": {
              // Mesmo token, segredo diferente: assinatura recomputada difere.
              params = {
                sessionId: c.sessionId,
                token: token.value,
                now: new Date(nowMs),
                secret: otherSecret,
              };
              expectedAccept = false;
              break;
            }
            case "tampered": {
              // Vira um caractere da assinatura (mantém o formato, quebra o HMAC).
              const sepIdx = token.value.indexOf(".");
              const expPart = token.value.slice(0, sepIdx);
              const sigPart = token.value.slice(sepIdx + 1);
              const idx = c.flipSeed % sigPart.length;
              const current = sigPart.charAt(idx);
              const replacement = HEX.charAt(
                (HEX.indexOf(current) + 1) % HEX.length,
              );
              const tamperedSig =
                sigPart.slice(0, idx) + replacement + sigPart.slice(idx + 1);
              params = {
                sessionId: c.sessionId,
                token: `${expPart}.${tamperedSig}`,
                now: new Date(nowMs),
                secret: c.secret,
              };
              expectedAccept = false;
              break;
            }
            case "garbage": {
              // String arbitrária: praticamente impossível bater com um HMAC.
              params = {
                sessionId: c.sessionId,
                token: c.garbage,
                now: new Date(nowMs),
                secret: c.secret,
              };
              expectedAccept = false;
              break;
            }
            case "missing": {
              // Token ausente: null/undefined/vazio/em branco.
              params = {
                sessionId: c.sessionId,
                token: c.missing,
                now: new Date(nowMs),
                secret: c.secret,
              };
              expectedAccept = false;
              break;
            }
            /* c8 ignore next 2 */
            default:
              throw new Error(`cenário não tratado: ${String(c.scenario)}`);
          }

          // Bicondicional: aceito exatamente quando todas as condições valem.
          expect(isCsrfTokenValid(params)).toBe(expectedAccept);

          // Coerência com validateCsrfToken e, em rejeição, erro de autorização.
          const result = validateCsrfToken(params);
          expect(result.ok).toBe(expectedAccept);
          if (!result.ok) {
            expect(result.error.code).toBe("FORBIDDEN");
          }
        },
      ),
    );
  });
});
