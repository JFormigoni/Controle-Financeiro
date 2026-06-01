import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import {
  decideAuthentication,
  type AuthDecisionInput,
} from "@/domain/auth/auth-decision";
import { type AccountStatus } from "@/domain/types";

/**
 * Teste de propriedade — Decisão de autenticação.
 *
 * Feature: financial-management-platform, Property 5: Decisão de autenticação
 *
 * *Para qualquer* estado de usuário e par de credenciais, a autenticação é
 * bem-sucedida **se e somente se** a senha conferir com o hash armazenado
 * (`passwordMatches`), o e-mail estiver verificado (`emailVerified`), a conta
 * estiver ativa (`status === 'ACTIVE'`) e o e-mail **não** estiver bloqueado
 * (`!locked`); em qualquer outro caso a autenticação é rejeitada e nenhuma
 * sessão é iniciada.
 *
 * Validates: Requirements 2.1, 2.3, 14.5
 */

// ---------------------------------------------------------------------------
// Geradores (smart generators)
// ---------------------------------------------------------------------------

/** Estado da conta: somente `'ACTIVE'` pode autenticar (Req. 14.5). */
const statusArb: fc.Arbitrary<AccountStatus> = fc.constantFrom(
  "ACTIVE",
  "INACTIVE",
);

/**
 * Entrada completa da decisão sobre todo o espaço de combinações dos quatro
 * fatores: três booleanos independentes e o estado da conta.
 */
const inputArb: fc.Arbitrary<AuthDecisionInput> = fc.record({
  passwordMatches: fc.boolean(),
  emailVerified: fc.boolean(),
  status: statusArb,
  locked: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 5 — sucesso sse a conjunção das quatro condições (iff)
// ---------------------------------------------------------------------------

describe("Property 5: decideAuthentication aceita sse passwordMatches && emailVerified && status==='ACTIVE' && !locked", () => {
  it("respeita o iff em ambas as direções para toda combinação dos quatro fatores", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const expectedOk =
          input.passwordMatches &&
          input.emailVerified &&
          input.status === "ACTIVE" &&
          !input.locked;

        const result = decideAuthentication(input);

        // iff exato: ok ocorre exatamente quando a conjunção é verdadeira.
        expect(result.ok).toBe(expectedOk);
      }),
    );
  });

  it("quando rejeitada, result.ok === false e nenhuma sessão é iniciada (err com código/mensagem)", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const shouldReject = !(
          input.passwordMatches &&
          input.emailVerified &&
          input.status === "ACTIVE" &&
          !input.locked
        );
        fc.pre(shouldReject);

        const result = decideAuthentication(input);

        // Rejeição: sem sessão; o resultado é um erro com motivo preenchido.
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(typeof result.error.code).toBe("string");
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("quando todas as condições são satisfeitas, autentica (ok) — direção positiva do iff", () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        // Única combinação aceitante: força os quatro fatores satisfeitos.
        const input: AuthDecisionInput = {
          passwordMatches: true,
          emailVerified: true,
          status: "ACTIVE",
          locked: false,
        };
        // `status` gerado é ignorado na construção; valida que apenas ACTIVE
        // entra na combinação aceitante (sanidade do gerador).
        void status;

        const result = decideAuthentication(input);
        expect(result.ok).toBe(true);
      }),
    );
  });

  it("violar qualquer um dos quatro fatores isolados rejeita o login", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<keyof AuthDecisionInput>(
          "passwordMatches",
          "emailVerified",
          "status",
          "locked",
        ),
        (factor) => {
          // Parte da única combinação aceitante e viola exatamente um fator.
          const input: AuthDecisionInput = {
            passwordMatches: true,
            emailVerified: true,
            status: "ACTIVE",
            locked: false,
          };
          if (factor === "passwordMatches") input.passwordMatches = false;
          else if (factor === "emailVerified") input.emailVerified = false;
          else if (factor === "status") input.status = "INACTIVE";
          else input.locked = true;

          const result = decideAuthentication(input);
          expect(result.ok).toBe(false);
        },
      ),
    );
  });

  it("é determinística: a mesma entrada produz sempre o mesmo result.ok", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = decideAuthentication(input);
        const b = decideAuthentication(input);
        expect(a.ok).toBe(b.ok);
      }),
    );
  });
});
