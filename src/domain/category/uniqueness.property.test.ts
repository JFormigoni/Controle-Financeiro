import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { isDuplicateCategory } from "@/domain/category/validation";
import { type Category, type TransactionType } from "@/domain/types";

/**
 * Teste de propriedade da **detecção de duplicidade de categoria** (Property 23).
 *
 * Verifica que {@link isDuplicateCategory} retorna `true` se e somente se existe,
 * dentre as categorias informadas, uma categoria com o **mesmo tipo** e o **mesmo
 * nome normalizado** (aparado + insensível a maiúsculas/minúsculas) do candidato.
 *
 * A unicidade é por conta + tipo: o chamador passa apenas categorias do próprio
 * usuário, de modo que `existing` representa as categorias de uma única conta. O
 * predicado esperado é calculado de forma **independente** da implementação,
 * usando a mesma política de normalização documentada (`trim` +
 * `toLocaleLowerCase`), para tornar a verificação do "se e somente se" robusta.
 *
 * Feature: financial-management-platform, Property 23: Unicidade de categoria por conta e tipo
 *
 * _Requirements: 8.6_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes (foco no espaço relevante: nome normalizado + tipo)
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: readonly TransactionType[] = ["INCOME", "EXPENSE"];

/** Tipo de lançamento arbitrário. */
const typeArb: fc.Arbitrary<TransactionType> = fc.constantFrom(
  ...TRANSACTION_TYPES,
);

/**
 * Nomes-base extraídos de um conjunto pequeno, para aumentar a probabilidade de
 * colisões (mesmo nome) entre as categorias existentes e o candidato — caso
 * contrário, com nomes totalmente aleatórios, a duplicidade quase nunca ocorre.
 * Inclui acentos e espaços internos para exercitar a normalização.
 */
const baseNameArb: fc.Arbitrary<string> = fc.constantFrom(
  "Salário",
  "salário",
  "Alimentação",
  "Lazer",
  "lazer",
  "Transporte",
  "Saúde",
  "Investimentos",
  "casa",
  "Casa",
);

/**
 * Aplica variações que NÃO alteram o nome normalizado: espaços nas bordas e
 * troca de caixa. Garante que nomes equivalentes (apenas por caixa/espaço)
 * sejam tratados como o mesmo nome.
 */
function withCosmeticVariation(name: string): fc.Arbitrary<string> {
  const leading = fc.constantFrom("", " ", "   ", "\t");
  const trailing = fc.constantFrom("", " ", "  ", "\n");
  const caseTransform = fc.constantFrom<(s: string) => string>(
    (s) => s,
    (s) => s.toUpperCase(),
    (s) => s.toLowerCase(),
  );
  return fc
    .tuple(leading, caseTransform, trailing)
    .map(([lead, transform, trail]) => `${lead}${transform(name)}${trail}`);
}

/** Nome candidato/categoria: nome-base com variação cosmética de caixa/espaço. */
const nameArb: fc.Arbitrary<string> = baseNameArb.chain(withCosmeticVariation);

/** Gera uma categoria existente com id/userId/createdAt irrelevantes ao predicado. */
const categoryArb: fc.Arbitrary<Category> = fc
  .tuple(fc.string({ minLength: 1, maxLength: 12 }), nameArb, typeArb)
  .map(([id, name, type]) => ({
    id: `cat-${id}`,
    userId: "user-1",
    name,
    type,
    createdAt: new Date(0),
  }));

/** Lista de categorias existentes da conta (pode ser vazia). */
const existingArb: fc.Arbitrary<Category[]> = fc.array(categoryArb, {
  maxLength: 12,
});

// ---------------------------------------------------------------------------
// Predicado de referência (independente da implementação sob teste)
// ---------------------------------------------------------------------------

/** Normalização de referência: aparar bordas + minúsculas (insensível a caixa). */
function normalize(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Verdadeiro sse alguma categoria tem o mesmo tipo e nome normalizado igual. */
function expectedDuplicate(
  existing: Category[],
  name: string,
  type: TransactionType,
): boolean {
  const candidate = normalize(name);
  return existing.some(
    (category) => category.type === type && normalize(category.name) === candidate,
  );
}

// ---------------------------------------------------------------------------
// Property 23: Unicidade de categoria por conta e tipo
// ---------------------------------------------------------------------------

describe("Property 23: Unicidade de categoria por conta e tipo", () => {
  // Feature: financial-management-platform, Property 23: Unicidade de categoria por conta e tipo
  // Para qualquer conjunto de categorias da conta, isDuplicateCategory é true
  // sse existe uma categoria do mesmo tipo cujo nome normalizado (trim +
  // case-insensitive) coincide com o do candidato.
  it("é true sse há categoria do mesmo tipo com nome normalizado igual (iff em ambas as direções)", () => {
    fc.assert(
      fc.property(existingArb, nameArb, typeArb, (existing, name, type) => {
        const expected = expectedDuplicate(existing, name, type);
        expect(isDuplicateCategory(existing, name, type)).toBe(expected);
      }),
    );
  });

  // Diferença apenas por caixa ou espaços nas bordas ⇒ duplicidade (mesmo tipo).
  it("trata nomes que diferem só por caixa/espaços como duplicados (mesmo tipo)", () => {
    fc.assert(
      fc.property(
        baseNameArb,
        typeArb,
        fc.constantFrom("", " ", "   ", "\t"),
        fc.constantFrom("", " ", "  ", "\n"),
        (base, type, lead, trail) => {
          const existing: Category[] = [
            {
              id: "cat-existing",
              userId: "user-1",
              name: base,
              type,
              createdAt: new Date(0),
            },
          ];
          // Mesmo nome com variação cosmética (caixa alta + espaços nas bordas).
          const candidate = `${lead}${base.toUpperCase()}${trail}`;
          expect(isDuplicateCategory(existing, candidate, type)).toBe(true);
        },
      ),
    );
  });

  // Mesmo nome porém tipo diferente ⇒ NÃO é duplicidade (unicidade por tipo).
  it("não considera duplicado quando o nome coincide mas o tipo difere", () => {
    fc.assert(
      fc.property(nameArb, typeArb, (name, type) => {
        const otherType: TransactionType =
          type === "INCOME" ? "EXPENSE" : "INCOME";
        const existing: Category[] = [
          {
            id: "cat-existing",
            userId: "user-1",
            name,
            type,
            createdAt: new Date(0),
          },
        ];
        // Mesmo nome (normalizado igual), mas o candidato é do tipo oposto.
        expect(isDuplicateCategory(existing, name, otherType)).toBe(false);
      }),
    );
  });
});
