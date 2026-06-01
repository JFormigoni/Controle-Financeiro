import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  MIN_AMOUNT_CENTS,
  MAX_AMOUNT_CENTS,
  isCents,
  isValidAmount,
  parseDecimalToCents,
  formatCents,
  add,
  subtract,
  negate,
  abs,
  sum,
  equals,
  lessThan,
  lessThanOrEqual,
  greaterThan,
  greaterThanOrEqual,
  isZero,
  compare,
} from "@/domain/money";
import { isErr, isOk, type Result } from "@/domain/result";
import { type Money } from "@/domain/types";

/**
 * Testes unitários dos utilitários de `Money` (centavos inteiros).
 *
 * Cobrem os limites de valor de lançamento/meta (R$ 0,01 e R$ 999.999.999,99),
 * o arredondamento determinístico meio-para-longe-do-zero, o tratamento de
 * entradas malformadas, o round-trip parse/format e a exatidão da aritmética e
 * das comparações.
 *
 * _Requirements: 6.4, 7.4_
 */

/** Extrai o valor de um resultado de sucesso, falhando o teste caso contrário. */
function unwrap(result: Result<Money>): Money {
  if (!result.ok) {
    throw new Error(`Esperava sucesso, mas recebeu erro: ${result.error.code}`);
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// Constantes e predicados de faixa
// ---------------------------------------------------------------------------

describe("Money: constantes de faixa", () => {
  it("MIN_AMOUNT_CENTS corresponde a R$ 0,01 (1 centavo)", () => {
    expect(MIN_AMOUNT_CENTS).toBe(1);
  });

  it("MAX_AMOUNT_CENTS corresponde a R$ 999.999.999,99", () => {
    expect(MAX_AMOUNT_CENTS).toBe(99_999_999_999);
  });

  it("a faixa válida está dentro dos inteiros seguros", () => {
    expect(Number.isSafeInteger(MAX_AMOUNT_CENTS)).toBe(true);
  });
});

describe("isCents", () => {
  it("aceita inteiros seguros (positivos, negativos e zero)", () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(1)).toBe(true);
    expect(isCents(-1)).toBe(true);
    expect(isCents(MAX_AMOUNT_CENTS)).toBe(true);
  });

  it("rejeita valores não inteiros e não finitos", () => {
    expect(isCents(1.5)).toBe(false);
    expect(isCents(NaN)).toBe(false);
    expect(isCents(Infinity)).toBe(false);
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

describe("isValidAmount: limites de lançamento/meta", () => {
  it("rejeita MIN - 1 (zero)", () => {
    expect(isValidAmount(MIN_AMOUNT_CENTS - 1)).toBe(false);
    expect(isValidAmount(0)).toBe(false);
  });

  it("aceita o limite inferior MIN (R$ 0,01)", () => {
    expect(isValidAmount(MIN_AMOUNT_CENTS)).toBe(true);
  });

  it("aceita o limite superior MAX (R$ 999.999.999,99)", () => {
    expect(isValidAmount(MAX_AMOUNT_CENTS)).toBe(true);
  });

  it("rejeita MAX + 1 (acima do teto)", () => {
    expect(isValidAmount(MAX_AMOUNT_CENTS + 1)).toBe(false);
  });

  it("rejeita valores negativos e não inteiros", () => {
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(1.5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseDecimalToCents: limites
// ---------------------------------------------------------------------------

describe("parseDecimalToCents: valores limite", () => {
  it('parseDecimalToCents("0.01") -> 1', () => {
    expect(unwrap(parseDecimalToCents("0.01"))).toBe(1);
  });

  it('parseDecimalToCents("999999999.99") -> 99_999_999_999', () => {
    expect(unwrap(parseDecimalToCents("999999999.99"))).toBe(99_999_999_999);
  });

  it("os limites convertidos satisfazem isValidAmount", () => {
    expect(isValidAmount(unwrap(parseDecimalToCents("0.01")))).toBe(true);
    expect(isValidAmount(unwrap(parseDecimalToCents("999999999.99")))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// parseDecimalToCents: arredondamento determinístico (meio-para-longe-do-zero)
// ---------------------------------------------------------------------------

describe("parseDecimalToCents: arredondamento meio-para-longe-do-zero", () => {
  it('"1.234" -> 123 (terceira casa < 5, trunca)', () => {
    expect(unwrap(parseDecimalToCents("1.234"))).toBe(123);
  });

  it('"1.235" -> 124 (terceira casa = 5, arredonda para longe do zero)', () => {
    expect(unwrap(parseDecimalToCents("1.235"))).toBe(124);
  });

  it('"-1.235" -> -124 (simétrico em torno do zero)', () => {
    expect(unwrap(parseDecimalToCents("-1.235"))).toBe(-124);
  });

  it('"1.236" -> 124 (terceira casa > 5, arredonda para cima)', () => {
    expect(unwrap(parseDecimalToCents("1.236"))).toBe(124);
  });

  it('"-1.234" -> -123 (trunca a magnitude)', () => {
    expect(unwrap(parseDecimalToCents("-1.234"))).toBe(-123);
  });

  it("arredonda de forma simétrica para positivo e negativo", () => {
    for (const [input, expected] of [
      ["2.005", 201],
      ["2.004", 200],
      ["0.005", 1],
      ["0.004", 0],
    ] as const) {
      expect(unwrap(parseDecimalToCents(input))).toBe(expected);
      // O parser normaliza zero negativo para 0, então -0 esperado vira 0.
      const negativeExpected = expected === 0 ? 0 : -expected;
      expect(unwrap(parseDecimalToCents(`-${input}`))).toBe(negativeExpected);
    }
  });
});

describe("parseDecimalToCents: formas decimais variadas", () => {
  it('".5" -> 50 (parte inteira ausente tratada como zero)', () => {
    expect(unwrap(parseDecimalToCents(".5"))).toBe(50);
  });

  it('"42" -> 4200 (inteiro sem parte fracionária)', () => {
    expect(unwrap(parseDecimalToCents("42"))).toBe(4200);
  });

  it('"+1.00" -> 100 (sinal positivo explícito)', () => {
    expect(unwrap(parseDecimalToCents("+1.00"))).toBe(100);
  });

  it("ignora espaços ao redor", () => {
    expect(unwrap(parseDecimalToCents("  1234.56  "))).toBe(123456);
  });

  it('normaliza "-0.00" para 0 (sem zero negativo)', () => {
    const cents = unwrap(parseDecimalToCents("-0.00"));
    expect(cents).toBe(0);
    expect(Object.is(cents, -0)).toBe(false);
  });

  it("aceita um number de reais", () => {
    expect(unwrap(parseDecimalToCents(1234.56))).toBe(123456);
    expect(unwrap(parseDecimalToCents(0.01))).toBe(1);
  });

  it("expande notação científica de numbers pequenos", () => {
    // 1e-7 reais arredonda para 0 centavos (terceira casa = 0).
    expect(unwrap(parseDecimalToCents(1e-7))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseDecimalToCents: entradas malformadas
// ---------------------------------------------------------------------------

describe("parseDecimalToCents: entradas inválidas retornam err VALIDATION", () => {
  it.each([
    ["abc"],
    [""],
    ["   "],
    ["1.2.3"],
    ["1,23"],
    ["R$ 10"],
    ["+"],
    ["-"],
    ["."],
    ["1e3"],
  ])('rejeita a string %j', (input) => {
    const result = parseDecimalToCents(input);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("amount");
    }
  });

  it.each([[NaN], [Infinity], [-Infinity]])(
    "rejeita o number não finito %j",
    (input) => {
      const result = parseDecimalToCents(input);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe("VALIDATION");
      }
    },
  );
});

// ---------------------------------------------------------------------------
// formatCents
// ---------------------------------------------------------------------------

describe("formatCents", () => {
  it("formata centavos com exatamente duas casas decimais", () => {
    expect(formatCents(123456)).toBe("1234.56");
    expect(formatCents(1)).toBe("0.01");
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(100)).toBe("1.00");
  });

  it("formata valores negativos preservando o sinal", () => {
    expect(formatCents(-1)).toBe("-0.01");
    expect(formatCents(-123456)).toBe("-1234.56");
  });

  it("formata o limite superior", () => {
    expect(formatCents(MAX_AMOUNT_CENTS)).toBe("999999999.99");
  });

  it("arredonda entradas não inteiras ao centavo mais próximo", () => {
    expect(formatCents(0.4)).toBe("0.00");
    expect(formatCents(0.6)).toBe("0.01");
  });
});

// ---------------------------------------------------------------------------
// Round-trip parse <-> format
// ---------------------------------------------------------------------------

describe("Round-trip: formatCents(parseDecimalToCents(x)) reproduz a forma canônica", () => {
  it.each([
    ["0.01", "0.01"],
    ["999999999.99", "999999999.99"],
    [".5", "0.50"],
    ["42", "42.00"],
    ["+1.00", "1.00"],
    ["1234.56", "1234.56"],
    ["-0.01", "-0.01"],
  ])("%j -> %j", (input, canonical) => {
    expect(formatCents(unwrap(parseDecimalToCents(input)))).toBe(canonical);
  });

  it("parseDecimalToCents(formatCents(c)).value === c para centavos válidos", () => {
    for (const c of [
      MIN_AMOUNT_CENTS,
      MAX_AMOUNT_CENTS,
      0,
      1,
      -1,
      99,
      100,
      123456,
      -123456,
    ]) {
      expect(unwrap(parseDecimalToCents(formatCents(c)))).toBe(c);
    }
  });
});

// ---------------------------------------------------------------------------
// Aritmética exata
// ---------------------------------------------------------------------------

describe("Money: aritmética exata", () => {
  it("add soma valores em centavos", () => {
    expect(add(123, 456)).toBe(579);
    expect(add(MAX_AMOUNT_CENTS, 0)).toBe(MAX_AMOUNT_CENTS);
    expect(add(-100, 100)).toBe(0);
  });

  it("subtract subtrai valores em centavos (pode ser negativo)", () => {
    expect(subtract(456, 123)).toBe(333);
    expect(subtract(100, 250)).toBe(-150);
    expect(subtract(MAX_AMOUNT_CENTS, MAX_AMOUNT_CENTS)).toBe(0);
  });

  it("negate inverte o sinal e normaliza -0 para 0", () => {
    expect(negate(123)).toBe(-123);
    expect(negate(-123)).toBe(123);
    const negZero = negate(0);
    expect(negZero).toBe(0);
    expect(Object.is(negZero, -0)).toBe(false);
  });

  it("abs retorna a magnitude", () => {
    expect(abs(-123)).toBe(123);
    expect(abs(123)).toBe(123);
    expect(abs(0)).toBe(0);
  });

  it("sum soma uma lista; a lista vazia soma 0 (estado vazio)", () => {
    expect(sum([])).toBe(0);
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([MAX_AMOUNT_CENTS, -MAX_AMOUNT_CENTS])).toBe(0);
    expect(sum([100, -50, 25])).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Comparações exatas
// ---------------------------------------------------------------------------

describe("Money: comparações", () => {
  it("equals compara igualdade exata", () => {
    expect(equals(123, 123)).toBe(true);
    expect(equals(123, 124)).toBe(false);
  });

  it("lessThan / lessThanOrEqual", () => {
    expect(lessThan(1, 2)).toBe(true);
    expect(lessThan(2, 2)).toBe(false);
    expect(lessThanOrEqual(2, 2)).toBe(true);
    expect(lessThanOrEqual(3, 2)).toBe(false);
  });

  it("greaterThan / greaterThanOrEqual", () => {
    expect(greaterThan(2, 1)).toBe(true);
    expect(greaterThan(2, 2)).toBe(false);
    expect(greaterThanOrEqual(2, 2)).toBe(true);
    expect(greaterThanOrEqual(1, 2)).toBe(false);
  });

  it("isZero verifica o valor zero", () => {
    expect(isZero(0)).toBe(true);
    expect(isZero(1)).toBe(false);
    expect(isZero(-1)).toBe(false);
  });

  it("compare retorna -1, 0 ou 1 e ordena corretamente", () => {
    expect(compare(1, 2)).toBe(-1);
    expect(compare(2, 1)).toBe(1);
    expect(compare(2, 2)).toBe(0);
    expect([3, 1, 2].sort(compare)).toEqual([1, 2, 3]);
    expect([5, -5, 0].sort(compare)).toEqual([-5, 0, 5]);
  });
});

// ---------------------------------------------------------------------------
// Testes de propriedade de apoio (round-trip e exatidão da aritmética)
// ---------------------------------------------------------------------------

describe("Money: propriedades de apoio (fast-check)", () => {
  // Feature: financial-management-platform, Property (apoio): round-trip de centavos
  // Para qualquer inteiro de centavos seguro, parseDecimalToCents(formatCents(c)) === c.
  it("round-trip parse/format preserva qualquer inteiro de centavos", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -MAX_AMOUNT_CENTS, max: MAX_AMOUNT_CENTS }),
        (cents) => {
          const formatted = formatCents(cents);
          return unwrap(parseDecimalToCents(formatted)) === cents;
        },
      ),
    );
  });

  // Feature: financial-management-platform, Property (apoio): exatidão da aritmética
  // add/subtract/sum/negate são exatos sobre inteiros de centavos.
  it("a aritmética sobre centavos é exata e consistente", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -MAX_AMOUNT_CENTS, max: MAX_AMOUNT_CENTS }),
        fc.integer({ min: -MAX_AMOUNT_CENTS, max: MAX_AMOUNT_CENTS }),
        (a, b) => {
          // add e subtract são inversos.
          if (subtract(add(a, b), b) !== a) return false;
          // negate é involutivo.
          if (negate(negate(a)) !== a) return false;
          // sum de dois elementos coincide com add.
          if (sum([a, b]) !== add(a, b)) return false;
          // compare é coerente com equals.
          if ((compare(a, b) === 0) !== equals(a, b)) return false;
          return true;
        },
      ),
    );
  });

  // Feature: financial-management-platform, Property (apoio): formatCents sempre tem duas casas decimais
  it("formatCents sempre produz exatamente duas casas decimais", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -MAX_AMOUNT_CENTS, max: MAX_AMOUNT_CENTS }),
        (cents) => /^-?\d+\.\d{2}$/.test(formatCents(cents)),
      ),
    );
  });
});
