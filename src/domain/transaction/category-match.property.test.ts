import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  categoryMatchesType,
  ensureCategoryMatches,
} from "@/domain/transaction/category-match";
import { type Category, type TransactionType } from "@/domain/types";

/**
 * Teste de propriedade da **correspondência de categoria por tipo e dono**
 * (Property 17).
 *
 * Verifica que {@link categoryMatchesType} é verdadeiro **se e somente se** a
 * categoria pertence ao usuário dono (`category.userId === ownerId`) **e** seu
 * tipo é igual ao tipo do lançamento (`category.type === type`). Categoria de
 * outro usuário, ou de tipo divergente, sempre resulta em rejeição.
 *
 * Também verifica {@link ensureCategoryMatches}: retorna `ok` quando há
 * correspondência e, na falha, respeita a **precedência** documentada — a
 * checagem de propriedade vem primeiro (`FORBIDDEN` quando o dono difere),
 * e só quando o dono confere é que a divergência de tipo gera `VALIDATION`.
 * Quando dono **e** tipo diferem, a checagem de dono tem prioridade
 * (`FORBIDDEN`), de modo a não revelar o tipo de um recurso alheio.
 *
 * Os geradores tiram `userId` e `type` de conjuntos pequenos, e escolhem um
 * `ownerId`/`type`-alvo também de conjuntos pequenos, para que correspondências
 * e divergências (em ambas as dimensões) ocorram com frequência — caso
 * contrário, com identificadores aleatórios, a correspondência quase nunca
 * aconteceria.
 *
 * Feature: financial-management-platform, Property 17: Categoria deve corresponder ao tipo e ao dono
 *
 * _Requirements: 6.9, 7.9, 8.7_
 */

// ---------------------------------------------------------------------------
// Geradores inteligentes (foco no espaço relevante: dono x tipo)
// ---------------------------------------------------------------------------

const TRANSACTION_TYPES: readonly TransactionType[] = ["INCOME", "EXPENSE"];

/** Tipo de lançamento arbitrário. */
const typeArb: fc.Arbitrary<TransactionType> = fc.constantFrom(
  ...TRANSACTION_TYPES,
);

/**
 * Conjunto pequeno de ids de usuário, partilhado entre a categoria e o dono
 * alvo, para que coincidências (mesmo dono) e divergências ocorram com
 * frequência similar.
 */
const USER_IDS: readonly string[] = ["user-1", "user-2", "user-3"];

/** Id de usuário arbitrário, tirado do conjunto pequeno. */
const userIdArb: fc.Arbitrary<string> = fc.constantFrom(...USER_IDS);

/** Gera uma categoria com `userId`/`type` aleatórios; demais campos irrelevantes. */
const categoryArb: fc.Arbitrary<Category> = fc
  .tuple(fc.string({ minLength: 1, maxLength: 12 }), userIdArb, typeArb)
  .map(([id, userId, type]) => ({
    id: `cat-${id}`,
    userId,
    name: "Categoria",
    type,
    createdAt: new Date(0),
  }));

// ---------------------------------------------------------------------------
// Property 17: Categoria deve corresponder ao tipo e ao dono
// ---------------------------------------------------------------------------

describe("Property 17: Categoria deve corresponder ao tipo e ao dono", () => {
  // Feature: financial-management-platform, Property 17: Categoria deve corresponder ao tipo e ao dono
  // categoryMatchesType é true sse a categoria pertence ao dono E o tipo coincide.
  it("categoryMatchesType é true sse mesmo dono E mesmo tipo (iff)", () => {
    fc.assert(
      fc.property(categoryArb, userIdArb, typeArb, (category, ownerId, type) => {
        const expected = category.userId === ownerId && category.type === type;
        expect(categoryMatchesType(category, type, ownerId)).toBe(expected);
      }),
    );
  });

  // ensureCategoryMatches retorna ok exatamente quando categoryMatchesType é true,
  // e respeita a precedência dono > tipo nas falhas.
  it("ensureCategoryMatches: ok sse há correspondência; precedência dono (FORBIDDEN) > tipo (VALIDATION)", () => {
    fc.assert(
      fc.property(categoryArb, userIdArb, typeArb, (category, ownerId, type) => {
        const sameOwner = category.userId === ownerId;
        const sameType = category.type === type;
        const result = ensureCategoryMatches(category, type, ownerId);

        // Consistência com o predicado: ok sse (mesmo dono E mesmo tipo).
        expect(result.ok).toBe(sameOwner && sameType);

        if (result.ok) {
          return;
        }

        // Precedência: dono diferente => FORBIDDEN (mesmo que o tipo também difira).
        if (!sameOwner) {
          expect(result.error.code).toBe("FORBIDDEN");
        } else {
          // Dono confere mas tipo diverge => VALIDATION.
          expect(result.error.code).toBe("VALIDATION");
        }
        // Toda falha aponta o campo categoryId.
        expect(result.error.field).toBe("categoryId");
      }),
    );
  });

  // A precedência do dono é exercida explicitamente quando AMBOS divergem:
  // a checagem de dono tem prioridade => FORBIDDEN (não revela o tipo alheio).
  it("quando dono E tipo divergem, a checagem de dono prevalece (FORBIDDEN)", () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        // Dono diferente do da categoria E tipo oposto ao da categoria.
        const otherOwner = `${category.userId}-outro`;
        const otherType: TransactionType =
          category.type === "INCOME" ? "EXPENSE" : "INCOME";

        expect(categoryMatchesType(category, otherType, otherOwner)).toBe(false);

        const result = ensureCategoryMatches(category, otherType, otherOwner);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("FORBIDDEN");
        }
      }),
    );
  });

  // Mesmo dono porém tipo divergente => rejeição com VALIDATION.
  it("mesmo dono e tipo divergente => VALIDATION", () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const otherType: TransactionType =
          category.type === "INCOME" ? "EXPENSE" : "INCOME";

        expect(categoryMatchesType(category, otherType, category.userId)).toBe(
          false,
        );

        const result = ensureCategoryMatches(
          category,
          otherType,
          category.userId,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe("VALIDATION");
        }
      }),
    );
  });

  // Correspondência total (mesmo dono e mesmo tipo) => aceitação.
  it("mesmo dono e mesmo tipo => aceito (ok)", () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        expect(
          categoryMatchesType(category, category.type, category.userId),
        ).toBe(true);

        const result = ensureCategoryMatches(
          category,
          category.type,
          category.userId,
        );
        expect(result.ok).toBe(true);
      }),
    );
  });
});
