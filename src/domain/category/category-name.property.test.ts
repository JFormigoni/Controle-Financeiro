import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  validateCategoryName,
} from "@/domain/category/validation";

/**
 * Teste de propriedade da **validação de nome de categoria** (Property 22).
 *
 * O nome é primeiro **aparado** (`trim`) e o comprimento é medido sobre o nome
 * aparado, em unidades de código UTF-16 (`String.prototype.length`), exatamente
 * como a implementação sob teste. O predicado esperado é derivado de
 * `name.trim().length`, de modo que a verificação do "se e somente se" é robusta
 * independentemente de como cada gerador mapeia os tamanhos (incluindo espaços
 * nas bordas e pares substitutos de emojis, que contam como 2 unidades de
 * código).
 *
 * _Requirements: 8.1, 8.3, 8.8_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes de nome (foco no espaço de entrada relevante:
// comprimento após o `trim` e presença de espaços nas bordas)
// ---------------------------------------------------------------------------

/**
 * String com exatamente `n` unidades de código UTF-16, montada a partir de
 * caracteres ASCII imprimíveis **não brancos** (0x21..0x7e), garantindo que
 * `resultado.trim().length === n` (nenhum caractere é removido pelo `trim`).
 */
function nonBlankStringOfLength(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0x21, max: 0x7e }), { minLength: n, maxLength: n })
    .map((codes) => String.fromCharCode(...codes));
}

/** Caracteres de espaço em branco comuns reconhecidos por `String.prototype.trim`. */
const WHITESPACE_CHARS = [" ", "\t", "\n", "\r", "\f", "\v", "\u00a0"] as const;

/** Sequência de espaços em branco (possivelmente vazia) para as bordas do nome. */
const whitespaceRunArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WHITESPACE_CHARS), { maxLength: 5 })
  .map((parts) => parts.join(""));

/** Comprimentos de fronteira do miolo aparado, em torno de [1, 60]. */
const BOUNDARY_TRIMMED_LENGTHS = [0, 1, 2, 59, 60, 61, 62, 100] as const;

/**
 * Nomes construídos com miolo de comprimento de fronteira (sem espaços nas
 * bordas do miolo), cercados por sequências arbitrárias de espaços. O `trim`
 * remove apenas as bordas, então `nome.trim().length` é igual ao comprimento do
 * miolo — exercitando exatamente os limites inferior/superior da faixa.
 */
const boundaryWithPaddingArb: fc.Arbitrary<string> = fc
  .tuple(
    whitespaceRunArb,
    fc.constantFrom(...BOUNDARY_TRIMMED_LENGTHS).chain(nonBlankStringOfLength),
    whitespaceRunArb,
  )
  .map(([left, core, right]) => left + core + right);

/** Nomes vazios ou contendo **apenas** espaços em branco (rejeitados, Req. 8.8). */
const blankArb: fc.Arbitrary<string> = whitespaceRunArb;

/**
 * Nomes contendo emojis (pares substitutos), em que cada caractere visível
 * conta como 2 unidades de código UTF-16. Cercados por espaços para exercitar a
 * contagem por unidade de código perto e além do limite superior após o `trim`.
 */
const astralArb: fc.Arbitrary<string> = fc
  .tuple(
    whitespaceRunArb,
    fc
      .array(fc.integer({ min: 0x1f600, max: 0x1f64f }), { maxLength: 35 })
      .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join("")),
    whitespaceRunArb,
  )
  .map(([left, core, right]) => left + core + right);

/**
 * Cobertura ampla: fronteiras com espaços nas bordas, nomes em branco, strings
 * arbitrárias do fast-check e nomes com emojis.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  boundaryWithPaddingArb,
  blankArb,
  fc.string({ maxLength: 80 }),
  astralArb,
);

// ---------------------------------------------------------------------------
// Property 22: Validação de nome de categoria
// ---------------------------------------------------------------------------

describe("Property 22: Validação de nome de categoria", () => {
  // Feature: financial-management-platform, Property 22: Validação de nome de categoria
  // Para qualquer nome, validateCategoryName o aceita se e somente se o
  // comprimento do nome aparado estiver na faixa fechada [1, 60]. No sucesso, o
  // valor é exatamente o nome aparado; na falha, é um erro VALIDATION no campo
  // "name".
  it("aceita sse o comprimento aparado está em [1, 60] (iff em ambas as direções)", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const trimmed = name.trim();
        const shouldPass =
          trimmed.length >= CATEGORY_NAME_MIN_LENGTH &&
          trimmed.length <= CATEGORY_NAME_MAX_LENGTH;

        const result = validateCategoryName(name);

        // Direção "se" e "somente se": aceitação coincide exatamente com o predicado.
        expect(result.ok).toBe(shouldPass);

        if (result.ok) {
          // No sucesso, o valor normalizado é exatamente o nome aparado.
          expect(result.value).toBe(trimmed);
        } else {
          // Na falha, deve ser um erro de VALIDATION associado ao campo "name".
          expect(result.error.code).toBe("VALIDATION");
          expect(result.error.field).toBe("name");
        }
      }),
    );
  });
});
