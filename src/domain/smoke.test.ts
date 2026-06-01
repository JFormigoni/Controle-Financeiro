import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { add } from "@/domain/sanity";

/**
 * Teste de fumaça (smoke test) da camada de domínio.
 *
 * Objetivo: provar que o harness de testes (Vitest + fast-check) está
 * corretamente configurado, incluindo a configuração global `numRuns: 100`.
 * Não valida regra de negócio real — apenas a infraestrutura de testes.
 *
 * Os testes de propriedade reais (Properties 1–42) seguem a convenção de
 * anotação demonstrada abaixo:
 *   "Feature: financial-management-platform, Property {número}: {texto}"
 */
describe("smoke: infraestrutura de testes de domínio", () => {
  it("executa um teste unitário simples", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolve o alias de caminho @/* (vindo do tsconfig)", () => {
    expect(add(2, 3)).toBe(5);
  });

  // Feature: financial-management-platform, Property smoke: a soma de inteiros é comutativa
  it("executa um teste de propriedade com fast-check", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
    );
  });

  it("aplica numRuns: 100 globalmente", () => {
    // fc.readConfigureGlobal() expõe a configuração ativa do fast-check.
    const global = fc.readConfigureGlobal();
    expect(global?.numRuns).toBe(100);
  });
});
