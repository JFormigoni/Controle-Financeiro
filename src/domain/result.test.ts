import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  appError,
  isOk,
  isErr,
  type Result,
  type AppError,
} from "@/domain/result";

/**
 * Testes unitários do modelo de Resultado (`Result<T>`) e seus utilitários.
 *
 * Verificam apenas a "encanação" de erros compartilhada (construtores e type
 * guards); regras de negócio são cobertas nas tarefas de domínio posteriores.
 */
describe("Result: construtores e type guards", () => {
  it("ok(value) cria um resultado de sucesso com o valor informado", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    // Estreitamento via discriminante.
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("ok(value) preserva o valor exato, incluindo objetos", () => {
    const payload = { id: "abc", count: 3 };
    const result = ok(payload);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(payload);
    }
  });

  it("appError monta um AppError com code, message e field", () => {
    const error = appError("VALIDATION", "valor inválido", "amount");
    expect(error).toEqual<AppError>({
      code: "VALIDATION",
      message: "valor inválido",
      field: "amount",
    });
  });

  it("err(error) cria um resultado de falha a partir de um AppError", () => {
    const error: AppError = { code: "NOT_FOUND", message: "não encontrado" };
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
  });

  it("err(code, message, field) monta o AppError internamente", () => {
    const result = err("CONFLICT", "e-mail já está em uso", "email");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toEqual<AppError>({
        code: "CONFLICT",
        message: "e-mail já está em uso",
        field: "email",
      });
    }
  });

  it("isOk e isErr são mutuamente exclusivos para sucesso", () => {
    const result: Result<string> = ok("hello");
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it("isOk e isErr são mutuamente exclusivos para falha", () => {
    const result: Result<string> = err("INTERNAL", "falha interna");
    expect(isOk(result)).toBe(false);
    expect(isErr(result)).toBe(true);
  });

  it("err sem field omite a propriedade field do AppError", () => {
    const result = err("UNAUTHORIZED", "sessão expirada");
    if (isErr(result)) {
      expect(result.error.field).toBeUndefined();
      expect(result.error.code).toBe("UNAUTHORIZED");
    }
  });
});
