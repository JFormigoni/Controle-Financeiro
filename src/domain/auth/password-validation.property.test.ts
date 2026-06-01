import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validateRegistrationPassword,
  validateNewPassword,
} from "@/domain/auth/password-validation";

/**
 * Teste de propriedade da validação de **comprimento de senha** (Property 1).
 *
 * O comprimento é medido em unidades de código UTF-16 (`String.prototype.length`),
 * exatamente como a implementação sob teste. O predicado esperado é derivado de
 * `password.length`, de modo que a verificação do "se e somente se" é robusta
 * independentemente de como cada gerador mapeia tamanhos (incluindo pares
 * substitutos de emojis, que contam como 2 unidades de código).
 *
 * _Requirements: 1.5, 3.2, 3.4, 3.7_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes de senha (foco no espaço de entrada relevante: tamanho)
// ---------------------------------------------------------------------------

/**
 * String com exatamente `n` unidades de código UTF-16, montada a partir de
 * caracteres ASCII imprimíveis (cada um ocupa 1 unidade de código), garantindo
 * `resultado.length === n`.
 */
function stringOfLength(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0x20, max: 0x7e }), { minLength: n, maxLength: n })
    .map((codes) => String.fromCharCode(...codes));
}

/** Tamanhos de fronteira ao redor de 8 e 64, mais um valor bem acima do teto. */
const BOUNDARY_LENGTHS = [0, 7, 8, 9, 63, 64, 65, 100] as const;

/** Senhas com tamanhos exatos de fronteira. */
const boundaryArb: fc.Arbitrary<string> = fc
  .constantFrom(...BOUNDARY_LENGTHS)
  .chain(stringOfLength);

/** Senhas com tamanhos uniformemente distribuídos em [0, 130]. */
const uniformLengthArb: fc.Arbitrary<string> = fc
  .nat({ max: 130 })
  .chain(stringOfLength);

/**
 * Senhas contendo emojis (pares substitutos), em que cada caractere visível
 * conta como 2 unidades de código UTF-16. Exercita a contagem por unidade de
 * código UTF-16 perto e além do limite superior.
 */
const astralArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0x1f600, max: 0x1f64f }), { maxLength: 70 })
  .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join(""));

/** Cobertura ampla: fronteiras, tamanhos uniformes, unicode arbitrário e emojis. */
const passwordArb: fc.Arbitrary<string> = fc.oneof(
  boundaryArb,
  uniformLengthArb,
  fc.string({ maxLength: 130 }),
  astralArb,
);

// ---------------------------------------------------------------------------
// Property 1: Validação de comprimento de senha
// ---------------------------------------------------------------------------

describe("Property 1: Validação de comprimento de senha", () => {
  // Feature: financial-management-platform, Property 1: Validação de comprimento de senha
  // Para qualquer string de senha, o cadastro a aceita sse 8 <= length <= 64,
  // e a alteração/redefinição a aceita sse length >= 8 (comprimento em UTF-16).
  it("aceita sse o comprimento satisfaz a regra de cada fluxo (iff em ambas as direções)", () => {
    fc.assert(
      fc.property(passwordArb, (password) => {
        const length = password.length;
        const registrationShouldPass =
          length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
        const newPasswordShouldPass = length >= PASSWORD_MIN_LENGTH;

        const registration = validateRegistrationPassword(password);
        const newPassword = validateNewPassword(password);

        // Direção "se" e "somente se": aceitação coincide exatamente com o predicado.
        expect(registration.ok).toBe(registrationShouldPass);
        expect(newPassword.ok).toBe(newPasswordShouldPass);

        // Quando rejeitada, deve ser um erro de VALIDATION no campo "password".
        if (!registration.ok) {
          expect(registration.error.code).toBe("VALIDATION");
          expect(registration.error.field).toBe("password");
        }
        if (!newPassword.ok) {
          expect(newPassword.error.code).toBe("VALIDATION");
          expect(newPassword.error.field).toBe("password");
        }
      }),
    );
  });
});
