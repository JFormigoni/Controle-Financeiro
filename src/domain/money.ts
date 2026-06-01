/**
 * Utilitários de `Money` — valores monetários como inteiros de **centavos**.
 *
 * A camada de domínio manipula dinheiro como inteiros de centavos para tornar
 * soma, subtração e comparação **exatas e determinísticas**, evitando erros de
 * ponto flutuante (design.md, "Decisões de Modelagem"). A conversão de/para a
 * representação decimal (`Decimal(12,2)` do Prisma, string ou número de reais)
 * ocorre nas bordas da aplicação por meio das funções deste módulo.
 *
 * ## Política de arredondamento
 *
 * A conversão de uma representação decimal para centavos usa **arredondamento
 * meio-para-longe-do-zero** (*round half away from zero*): quando a terceira
 * casa decimal é maior ou igual a 5, a magnitude do valor é arredondada para
 * cima (ex.: `1,235` → `1,24`; `-1,235` → `-1,24`); caso contrário, é truncada
 * para baixo (ex.: `1,234` → `1,23`). Essa política é simétrica em torno de
 * zero e independente do sinal.
 *
 * ## Exatidão da conversão
 *
 * O parsing opera no **nível de string/inteiro** (sem multiplicar floats),
 * garantindo exatidão para representações decimais bem-formadas. Para entradas
 * `number`, a conversão usa a representação canônica de menor comprimento de
 * `Number.prototype.toString()` (round-trip), de modo que valores monetários
 * usuais (ex.: `0.01`, `1234.56`) são convertidos exatamente. Ainda assim,
 * prefira passar **strings** quando a fonte for `Decimal`/texto, pois `number`
 * está sujeito à representação IEEE-754.
 *
 * Referências de requisitos: 5.1 (Saldo_Atual), 6.1 e 7.1 (faixa de valor de
 * lançamento). A faixa válida 0,01 .. 999.999.999,99 corresponde a
 * {@link MIN_AMOUNT_CENTS} .. {@link MAX_AMOUNT_CENTS}.
 */

import { type Money } from "@/domain/types";
import { type Result, err, ok } from "@/domain/result";

// ---------------------------------------------------------------------------
// Constantes de faixa
// ---------------------------------------------------------------------------

/** Menor valor válido de um lançamento/meta: R$ 0,01 = 1 centavo. */
export const MIN_AMOUNT_CENTS = 1;

/**
 * Maior valor válido de um lançamento/meta: R$ 999.999.999,99 =
 * 99_999_999_999 centavos. Bem abaixo de `Number.MAX_SAFE_INTEGER`
 * (~9,007 × 10¹⁵), mantendo a aritmética inteira exata.
 */
export const MAX_AMOUNT_CENTS = 99_999_999_999;

// ---------------------------------------------------------------------------
// Predicados
// ---------------------------------------------------------------------------

/**
 * Verdadeiro quando `cents` é um inteiro de centavos representável com exatidão
 * (inteiro seguro). Não impõe a faixa de lançamento; use {@link isValidAmount}
 * para validar a faixa de um valor de lançamento/meta.
 */
export function isCents(cents: number): boolean {
  return Number.isSafeInteger(cents);
}

/**
 * Verdadeiro quando `cents` é um valor de lançamento/meta válido: um inteiro
 * dentro da faixa fechada [{@link MIN_AMOUNT_CENTS}, {@link MAX_AMOUNT_CENTS}]
 * (R$ 0,01 .. R$ 999.999.999,99). Valores ≤ 0 ou acima do máximo são inválidos
 * (Req. 6.1, 6.4, 7.1, 7.4, 9.1, 9.6).
 */
export function isValidAmount(cents: number): boolean {
  return (
    Number.isInteger(cents) &&
    cents >= MIN_AMOUNT_CENTS &&
    cents <= MAX_AMOUNT_CENTS
  );
}

// ---------------------------------------------------------------------------
// Conversão: decimal -> centavos
// ---------------------------------------------------------------------------

/** Aceita dígitos com sinal opcional e parte fracionária opcional. */
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Converte uma representação decimal em centavos inteiros, de forma
 * determinística e total.
 *
 * Aceita:
 * - uma `string` decimal com ponto como separador (ex.: `"1234.56"`,
 *   `"-0.01"`, `".5"`, `"42"`), como retornada por `Decimal(12,2)` do Prisma;
 * - um `number` de reais (ex.: `1234.56`).
 *
 * Aplica arredondamento meio-para-longe-do-zero na terceira casa decimal (ver
 * a documentação do módulo). Retorna `VALIDATION` quando a entrada não é um
 * decimal finito bem-formado ou quando o resultado excede o intervalo de
 * inteiros seguros. **Não** valida a faixa de lançamento; combine com
 * {@link isValidAmount} quando necessário.
 *
 * Para um `Prisma.Decimal`, passe `decimal.toString()`.
 */
export function parseDecimalToCents(value: string | number): Result<Money> {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return err(
        "VALIDATION",
        "Valor monetário deve ser um número finito.",
        "amount",
      );
    }
    return parseFromString(decimalStringFromNumber(value));
  }
  return parseFromString(value);
}

/** Núcleo do parsing: opera no nível de string/inteiro (sem multiplicar floats). */
function parseFromString(raw: string): Result<Money> {
  const trimmed = raw.trim();
  if (trimmed === "" || !DECIMAL_PATTERN.test(trimmed)) {
    return err(
      "VALIDATION",
      "Valor monetário em formato inválido.",
      "amount",
    );
  }

  const negative = trimmed.charAt(0) === "-";
  const unsigned = negative || trimmed.charAt(0) === "+" ? trimmed.slice(1) : trimmed;

  const dotIndex = unsigned.indexOf(".");
  const intPart = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex);
  const fracPart = dotIndex === -1 ? "" : unsigned.slice(dotIndex + 1);

  // `intPart` pode ser vazio em entradas como ".5"; trata como zero.
  const intDigits = intPart === "" ? "0" : intPart;
  // Primeiras duas casas decimais (centavos), completadas com zeros à direita.
  const fracCents = fracPart.slice(0, 2).padEnd(2, "0");

  const wholeReais = Number(intDigits);
  const wholeCents = wholeReais * 100 + Number(fracCents);

  // Arredondamento meio-para-longe-do-zero pela terceira casa decimal.
  const thirdDigit =
    fracPart.length > 2 ? fracPart.charCodeAt(2) - /* '0' */ 48 : 0;
  const roundedMagnitude = thirdDigit >= 5 ? wholeCents + 1 : wholeCents;

  if (!Number.isSafeInteger(roundedMagnitude)) {
    return err(
      "VALIDATION",
      "Valor monetário fora do intervalo suportado.",
      "amount",
    );
  }

  // Normaliza zero negativo para 0.
  const cents = roundedMagnitude === 0 || !negative ? roundedMagnitude : -roundedMagnitude;
  return ok(cents);
}

/**
 * Converte um `number` finito em sua string decimal canônica, expandindo a
 * notação científica quando presente (ex.: `1e-7` → `"0.0000001"`). Para
 * valores na faixa monetária usual, `Number.prototype.toString()` já produz a
 * forma decimal de menor comprimento que faz round-trip.
 */
function decimalStringFromNumber(n: number): string {
  const s = n.toString();
  if (!s.includes("e") && !s.includes("E")) {
    return s;
  }

  // Expansão de notação científica: mantissa × 10^exp.
  const negative = s.charAt(0) === "-";
  const body = negative ? s.slice(1) : s;
  const [mantissa = "0", expText = "0"] = body.toLowerCase().split("e");
  const exp = Number(expText);
  const dot = mantissa.indexOf(".");
  const digits = dot === -1 ? mantissa : mantissa.slice(0, dot) + mantissa.slice(dot + 1);
  // Posição do ponto decimal relativa ao início de `digits`.
  const pointPos = (dot === -1 ? mantissa.length : dot) + exp;

  let result: string;
  if (pointPos <= 0) {
    result = "0." + "0".repeat(-pointPos) + digits;
  } else if (pointPos >= digits.length) {
    result = digits + "0".repeat(pointPos - digits.length);
  } else {
    result = digits.slice(0, pointPos) + "." + digits.slice(pointPos);
  }
  return negative ? "-" + result : result;
}

// ---------------------------------------------------------------------------
// Conversão: centavos -> decimal
// ---------------------------------------------------------------------------

/**
 * Formata centavos inteiros como uma string decimal com exatamente duas casas,
 * usando ponto como separador e sem separadores de milhar
 * (ex.: `123456` → `"1234.56"`, `-1` → `"-0.01"`). Compatível com o formato de
 * `Decimal(12,2)` do Prisma. Total: entradas não inteiras são arredondadas ao
 * inteiro mais próximo antes da formatação.
 */
export function formatCents(cents: Money): string {
  const normalized = Math.round(cents);
  const negative = normalized < 0;
  const magnitude = Math.abs(normalized);
  const reais = Math.trunc(magnitude / 100);
  const centavos = magnitude % 100;
  const fraction = centavos.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${reais}.${fraction}`;
}

// ---------------------------------------------------------------------------
// Aritmética exata
// ---------------------------------------------------------------------------

/** Soma exata de dois valores em centavos. */
export function add(a: Money, b: Money): Money {
  return a + b;
}

/** Subtração exata `a - b` em centavos (o resultado pode ser negativo). */
export function subtract(a: Money, b: Money): Money {
  return a - b;
}

/** Negação de um valor em centavos. */
export function negate(a: Money): Money {
  // Normaliza `-0` para `0`.
  return a === 0 ? 0 : -a;
}

/** Valor absoluto em centavos. */
export function abs(a: Money): Money {
  return Math.abs(a);
}

/**
 * Soma exata de uma lista de valores em centavos. A lista vazia soma `0`
 * (estado vazio do dashboard — Req. 5.6).
 */
export function sum(values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Comparação exata
// ---------------------------------------------------------------------------

/** Verdadeiro quando `a` e `b` representam o mesmo valor em centavos. */
export function equals(a: Money, b: Money): boolean {
  return a === b;
}

/** Verdadeiro quando `a < b`. */
export function lessThan(a: Money, b: Money): boolean {
  return a < b;
}

/** Verdadeiro quando `a <= b`. */
export function lessThanOrEqual(a: Money, b: Money): boolean {
  return a <= b;
}

/** Verdadeiro quando `a > b`. */
export function greaterThan(a: Money, b: Money): boolean {
  return a > b;
}

/** Verdadeiro quando `a >= b`. */
export function greaterThanOrEqual(a: Money, b: Money): boolean {
  return a >= b;
}

/** Verdadeiro quando o valor é exatamente zero. */
export function isZero(a: Money): boolean {
  return a === 0;
}

/**
 * Comparador total para ordenação: retorna `-1` se `a < b`, `1` se `a > b` e
 * `0` se forem iguais. Adequado para uso direto em `Array.prototype.sort`.
 */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
