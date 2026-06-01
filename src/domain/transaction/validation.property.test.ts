import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  DESCRIPTION_MIN_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  validateTransaction,
  type TransactionInput,
} from "@/domain/transaction/validation";
import { type TransactionType } from "@/domain/types";

/**
 * Teste de propriedade da validação de **lançamento** (Receita/Despesa) e de
 * **valor** (Property 16).
 *
 * Regra de aceitação (espelhada para `INCOME` e `EXPENSE`): `validateTransaction`
 * aceita uma entrada **se e somente se** TODOS os quatro campos forem válidos:
 *
 * 1. descrição com comprimento APARADO em [{@link DESCRIPTION_MIN_LENGTH},
 *    {@link DESCRIPTION_MAX_LENGTH}] = [1, 200] (Req. 6.1/7.1, 6.8/7.8);
 * 2. valor numérico e na faixa fechada [0,01; 999.999.999,99] (Req. 6.4/7.4);
 * 3. data sendo uma data de calendário válida (Req. 6.1/7.1, 6.8/7.8);
 * 4. categoria informada (não vazia após `trim`) (Req. 6.8/7.8).
 *
 * O oráculo de aceitação é calculado de forma **independente** da implementação:
 * cada campo é gerado já anotado com sua validade conhecida (`valid: boolean`),
 * em buckets que cruzam casos válidos/ inválidos (descrição vazia/só-espaços/
 * fronteiras/201+; valor como string decimal válida, número de reais, fora de
 * faixa, não numérico, tipos inesperados; data como `Date` válido, `Date`
 * inválido, string inválida e tipos inesperados; categoria vazia/só-espaços vs.
 * não vazia). A aceitação esperada é a conjunção das quatro validades. Em falha,
 * o erro deve ser `VALIDATION` e o `field` reportado deve corresponder a um dos
 * campos efetivamente inválidos (a função não muta a entrada — Req. 6.4/6.8,
 * 7.4/7.8).
 *
 * _Requirements: 6.1, 6.2, 6.4, 6.8, 7.1, 7.2, 7.4, 7.8_
 */

// ---------------------------------------------------------------------------
// Utilitários de geração
// ---------------------------------------------------------------------------

/** Par "valor + validade conhecida" usado para construir o oráculo independente. */
interface Tagged<T> {
  value: T;
  valid: boolean;
}

/** Caracteres de espaço em branco comuns, exercitando a política de `trim`. */
const WHITESPACE_CHARS = [" ", "\t", "\n", "\r", "\f", "\v"] as const;

/** String composta apenas de espaços em branco (1..8 unidades). */
const whitespaceOnlyArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WHITESPACE_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(""));

/**
 * String com exatamente `n` unidades de código UTF-16, formada por caracteres
 * ASCII imprimíveis e **não** brancos (0x21..0x7e), garantindo
 * `resultado.trim().length === n`.
 */
function nonBlankStringOfLength(n: number): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: 0x21, max: 0x7e }), { minLength: n, maxLength: n })
    .map((codes) => String.fromCharCode(...codes));
}

/** Formata um inteiro de centavos como string decimal "reais.cc" (separador "."). */
function centsToDecimalString(cents: number): string {
  const reais = Math.trunc(cents / 100);
  const cc = (cents % 100).toString().padStart(2, "0");
  return `${reais}.${cc}`;
}

// ---------------------------------------------------------------------------
// Gerador de descrição (anotado)
// ---------------------------------------------------------------------------

const validDescriptionArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  // Conteúdo de comprimento aparado em [1, 200].
  fc
    .integer({ min: DESCRIPTION_MIN_LENGTH, max: DESCRIPTION_MAX_LENGTH })
    .chain(nonBlankStringOfLength)
    .map((value) => ({ value, valid: true })),
  // Conteúdo válido cercado de espaços: o comprimento efetivo é o do núcleo.
  fc
    .tuple(
      fc
        .integer({ min: DESCRIPTION_MIN_LENGTH, max: DESCRIPTION_MAX_LENGTH })
        .chain(nonBlankStringOfLength),
      whitespaceOnlyArb,
      whitespaceOnlyArb,
    )
    .map(([core, left, right]) => ({ value: `${left}${core}${right}`, valid: true })),
);

const invalidDescriptionArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  // Vazia ou somente espaços -> comprimento aparado 0.
  fc.constant({ value: "", valid: false }),
  whitespaceOnlyArb.map((value) => ({ value, valid: false })),
  // Excede o máximo após o `trim` (201..260 unidades de conteúdo).
  fc
    .integer({ min: DESCRIPTION_MAX_LENGTH + 1, max: DESCRIPTION_MAX_LENGTH + 60 })
    .chain(nonBlankStringOfLength)
    .map((value) => ({ value, valid: false })),
);

const descriptionArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  validDescriptionArb,
  invalidDescriptionArb,
);

// ---------------------------------------------------------------------------
// Gerador de valor (anotado) — abrange string decimal, número e tipos inesperados
// ---------------------------------------------------------------------------

const MAX_AMOUNT_CENTS = 99_999_999_999; // R$ 999.999.999,99

const validAmountArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(
  // String decimal exata a partir de centavos na faixa [1, MAX].
  fc
    .integer({ min: 1, max: MAX_AMOUNT_CENTS })
    .map((cents) => ({ value: centsToDecimalString(cents), valid: true })),
  // Número de reais inteiro em [1, 999.999.999] (round-trip exato).
  fc
    .integer({ min: 1, max: 999_999_999 })
    .map((reais) => ({ value: reais, valid: true })),
  // Fronteiras conhecidas.
  fc.constantFrom<Tagged<unknown>>(
    { value: "0.01", valid: true },
    { value: "999999999.99", valid: true },
    { value: 0.01, valid: true },
    { value: 999999999.99, valid: true },
  ),
);

const invalidAmountArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(
  // Números fora da faixa (<= 0 ou acima do máximo).
  fc.constantFrom<Tagged<unknown>>(
    { value: 0, valid: false },
    { value: -1, valid: false },
    { value: -100.5, valid: false },
    { value: 1_000_000_000, valid: false },
    { value: 1_000_000_000.5, valid: false },
    { value: 1e12, valid: false },
  ),
  // Números não finitos.
  fc.constantFrom<Tagged<unknown>>(
    { value: NaN, valid: false },
    { value: Infinity, valid: false },
    { value: -Infinity, valid: false },
  ),
  // Strings decimais fora da faixa.
  fc.constantFrom<Tagged<unknown>>(
    { value: "0", valid: false },
    { value: "0.00", valid: false },
    { value: "-0.01", valid: false },
    { value: "-5.00", valid: false },
    { value: "1000000000.00", valid: false },
    { value: "99999999999999", valid: false },
  ),
  // Strings não numéricas.
  fc.constantFrom<Tagged<unknown>>(
    { value: "", valid: false },
    { value: "   ", valid: false },
    { value: "abc", valid: false },
    { value: "ten", valid: false },
    { value: "12.3.4", valid: false },
    { value: "1,23", valid: false },
    { value: "$5", valid: false },
    { value: "R$ 10", valid: false },
    { value: "1e3", valid: false },
  ),
  // Tipos inesperados.
  fc.constantFrom<Tagged<unknown>>(
    { value: null, valid: false },
    { value: undefined, valid: false },
    { value: true, valid: false },
    { value: false, valid: false },
    { value: {}, valid: false },
    { value: [], valid: false },
  ),
);

const amountArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(
  validAmountArb,
  invalidAmountArb,
);

// ---------------------------------------------------------------------------
// Gerador de data (anotado) — Date válido/ inválido, strings e tipos inesperados
// ---------------------------------------------------------------------------

/** Janela de timestamps finitos (≈ 1900..2100) -> sempre um `Date` válido. */
const MIN_TS = Date.UTC(1900, 0, 1);
const MAX_TS = Date.UTC(2100, 11, 31);

const validDateArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(
  // Instância de Date válida.
  fc
    .integer({ min: MIN_TS, max: MAX_TS })
    .map((ts) => ({ value: new Date(ts), valid: true })),
  // String ISO de uma data válida.
  fc
    .integer({ min: MIN_TS, max: MAX_TS })
    .map((ts) => ({ value: new Date(ts).toISOString(), valid: true })),
);

const invalidDateArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(
  // Date inválido.
  fc.constant<Tagged<unknown>>({ value: new Date(NaN), valid: false }),
  // Strings que não representam uma data de calendário (Date.parse -> NaN).
  fc.constantFrom<Tagged<unknown>>(
    { value: "", valid: false },
    { value: "   ", valid: false },
    { value: "not-a-date", valid: false },
    { value: "hello world", valid: false },
    { value: "2026-13-01", valid: false },
    { value: "31/02/2026", valid: false },
    { value: "garbage", valid: false },
  ),
  // Tipos inesperados (não Date e não string).
  fc.constantFrom<Tagged<unknown>>(
    { value: null, valid: false },
    { value: undefined, valid: false },
    { value: 1_700_000_000_000, valid: false },
    { value: true, valid: false },
    { value: {}, valid: false },
  ),
);

const dateArb: fc.Arbitrary<Tagged<unknown>> = fc.oneof(validDateArb, invalidDateArb);

// ---------------------------------------------------------------------------
// Gerador de categoria (anotado)
// ---------------------------------------------------------------------------

const validCategoryArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  fc.integer({ min: 1, max: 40 }).chain(nonBlankStringOfLength).map((value) => ({
    value,
    valid: true,
  })),
  fc
    .tuple(
      fc.integer({ min: 1, max: 40 }).chain(nonBlankStringOfLength),
      whitespaceOnlyArb,
      whitespaceOnlyArb,
    )
    .map(([core, left, right]) => ({ value: `${left}${core}${right}`, valid: true })),
);

const invalidCategoryArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  fc.constant({ value: "", valid: false }),
  whitespaceOnlyArb.map((value) => ({ value, valid: false })),
);

const categoryArb: fc.Arbitrary<Tagged<string>> = fc.oneof(
  validCategoryArb,
  invalidCategoryArb,
);

// ---------------------------------------------------------------------------
// Gerador combinado de entrada
// ---------------------------------------------------------------------------

interface TaggedInput {
  input: TransactionInput;
  descriptionValid: boolean;
  amountValid: boolean;
  dateValid: boolean;
  categoryValid: boolean;
}

const taggedInputArb: fc.Arbitrary<TaggedInput> = fc
  .tuple(descriptionArb, amountArb, dateArb, categoryArb)
  .map(([description, amount, date, category]) => ({
    input: {
      description: description.value,
      amount: amount.value,
      date: date.value,
      categoryId: category.value,
    },
    descriptionValid: description.valid,
    amountValid: amount.valid,
    dateValid: date.valid,
    categoryValid: category.valid,
  }));

// ---------------------------------------------------------------------------
// Property 16: Validação de valor e campos de lançamento
// ---------------------------------------------------------------------------

describe.each<TransactionType>(["INCOME", "EXPENSE"])(
  "Property 16: Validação de valor e campos de lançamento (%s)",
  (type) => {
    // Feature: financial-management-platform, Property 16: Validação de valor e campos de lançamento
    // validateTransaction aceita SSE descrição (1..200 após trim) E valor numérico
    // na faixa [0,01; 999.999.999,99] E data de calendário válida E categoria
    // informada. O oráculo é independente: cada campo é gerado anotado com sua
    // validade conhecida. Em falha: VALIDATION com `field` correspondendo a um
    // campo efetivamente inválido.
    it("aceita sse os quatro campos são válidos (iff em ambas as direções)", () => {
      fc.assert(
        fc.property(taggedInputArb, (tagged) => {
          const {
            input,
            descriptionValid,
            amountValid,
            dateValid,
            categoryValid,
          } = tagged;

          const expectedOk =
            descriptionValid && amountValid && dateValid && categoryValid;

          const result = validateTransaction(input, type);

          // Direção "se" e "somente se": aceitação coincide com o oráculo.
          expect(result.ok).toBe(expectedOk);

          if (result.ok) {
            // Dados normalizados: descrição/categoria aparadas e tipo incorporado.
            expect(result.value.type).toBe(type);
            expect(result.value.description).toBe(input.description.trim());
            expect(result.value.categoryId).toBe(input.categoryId.trim());
            expect(result.value.date).toBeInstanceOf(Date);
            expect(Number.isNaN(result.value.date.getTime())).toBe(false);
            expect(Number.isInteger(result.value.amount)).toBe(true);
            expect(result.value.amount).toBeGreaterThanOrEqual(1);
            expect(result.value.amount).toBeLessThanOrEqual(MAX_AMOUNT_CENTS);
          } else {
            // Falha de validação com o campo ofensor identificado.
            expect(result.error.code).toBe("VALIDATION");

            const invalidFields = new Set<string>();
            if (!descriptionValid) invalidFields.add("description");
            if (!amountValid) invalidFields.add("amount");
            if (!dateValid) invalidFields.add("date");
            if (!categoryValid) invalidFields.add("categoryId");

            expect(result.error.field).toBeDefined();
            expect(invalidFields.has(result.error.field as string)).toBe(true);
          }
        }),
      );
    });
  },
);
