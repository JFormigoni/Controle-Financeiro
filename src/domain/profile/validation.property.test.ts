import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  validateProfileUpdate,
} from "@/domain/profile/validation";

/**
 * Teste de propriedade da validação de **nome de perfil** (Property 11).
 *
 * A regra de aceitação é medida sobre o nome **aparado** (trim antes de medir):
 * a atualização é aceita se e somente se o comprimento do nome aparado estiver
 * na faixa fechada [{@link NAME_MIN_LENGTH}, {@link NAME_MAX_LENGTH}] = [1, 100].
 * Em caso de sucesso, o valor retornado carrega exatamente o nome aparado; em
 * caso de falha, retorna `VALIDATION` no campo `name` (a função apenas retorna
 * o erro — não muta nem persiste dado algum, de modo que os dados atuais
 * permanecem inalterados, Req. 4.3).
 *
 * O comprimento é medido em unidades de código UTF-16 (`String.prototype.length`),
 * exatamente como a implementação sob teste. O predicado esperado é derivado de
 * `name.trim().length`, tornando a verificação do "se e somente se" robusta
 * independentemente de como cada gerador produz a string (incluindo espaços nas
 * bordas e pares substitutos de emojis, que contam como 2 unidades de código).
 *
 * _Requirements: 4.1, 4.3_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes de nome (foco no espaço de entrada relevante)
// ---------------------------------------------------------------------------

/** Caracteres de espaço em branco comuns, exercitando a política de trim. */
const WHITESPACE_CHARS = [" ", "\t", "\n", "\r", "\f", "\v"] as const;

/**
 * String composta apenas de caracteres de espaço em branco (1..10 unidades),
 * que deve sempre ser rejeitada por ficar vazia após o trim.
 */
const whitespaceOnlyArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WHITESPACE_CHARS), { minLength: 1, maxLength: 10 })
  .map((chars) => chars.join(""));

/**
 * String com exatamente `n` unidades de código UTF-16, montada a partir de
 * caracteres ASCII imprimíveis e **não** brancos (0x21..0x7e), garantindo que
 * `resultado.trim().length === n`.
 */
function nonBlankStringOfLength(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0x21, max: 0x7e }), { minLength: n, maxLength: n })
    .map((codes) => String.fromCharCode(...codes));
}

/** Tamanhos de fronteira ao redor de 1 e 100, incluindo 0 (vazio) e 101. */
const BOUNDARY_LENGTHS = [0, 1, 2, 99, 100, 101, 150] as const;

/** Nomes (já aparados) com tamanhos exatos de fronteira. */
const boundaryArb: fc.Arbitrary<string> = fc
  .constantFrom(...BOUNDARY_LENGTHS)
  .chain(nonBlankStringOfLength);

/**
 * Nome de conteúdo de fronteira cercado por espaços nas bordas. Após o trim, o
 * comprimento efetivo é o do conteúdo, exercitando a política "aparar antes de
 * medir" perto dos limites.
 */
const paddedBoundaryArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...BOUNDARY_LENGTHS).chain(nonBlankStringOfLength),
    whitespaceOnlyArb,
    whitespaceOnlyArb,
  )
  .map(([core, left, right]) => `${left}${core}${right}`);

/**
 * Nomes contendo emojis (pares substitutos), em que cada caractere visível
 * conta como 2 unidades de código UTF-16. Exercita a contagem por unidade de
 * código UTF-16 perto e além do limite superior.
 */
const astralArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0x1f600, max: 0x1f64f }), { maxLength: 60 })
  .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join(""));

/** Cobertura ampla: vazio, só-espaços, fronteiras, bordas com espaços, strings arbitrárias e emojis. */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  whitespaceOnlyArb,
  boundaryArb,
  paddedBoundaryArb,
  fc.string({ maxLength: 130 }),
  astralArb,
);

// ---------------------------------------------------------------------------
// Property 11: Validação de nome de perfil
// ---------------------------------------------------------------------------

describe("Property 11: Validação de nome de perfil", () => {
  // Feature: financial-management-platform, Property 11: Validação de nome de perfil
  // Para qualquer entrada de nome, validateProfileUpdate aceita sse o comprimento
  // do nome APARADO estiver em [1, 100]; em sucesso, value.name é o nome aparado;
  // em falha, código VALIDATION, campo 'name' (e nenhum dado é alterado).
  it("aceita sse o comprimento do nome aparado está em [1, 100] (iff em ambas as direções)", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const trimmed = name.trim();
        const shouldPass =
          trimmed.length >= NAME_MIN_LENGTH &&
          trimmed.length <= NAME_MAX_LENGTH;

        const result = validateProfileUpdate({ name });

        // Direção "se" e "somente se": aceitação coincide exatamente com o predicado.
        expect(result.ok).toBe(shouldPass);

        if (result.ok) {
          // Em sucesso, o valor retornado é o nome aparado.
          expect(result.value.name).toBe(trimmed);
        } else {
          // Em falha, erro de VALIDATION no campo "name"; nada é persistido/alterado.
          expect(result.error.code).toBe("VALIDATION");
          expect(result.error.field).toBe("name");
        }
      }),
    );
  });
});
