import { describe, it, expect } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validateRegistrationPassword,
  validateNewPassword,
} from "@/domain/auth/password-validation";

/**
 * Testes unitários de sanidade para a validação de comprimento de senha
 * (Req. 1.5, 3.2, 3.4, 3.7). A garantia universal (Property 1) é verificada
 * pelo teste de propriedade da tarefa 4.2.
 */
describe("validateRegistrationPassword: cadastro (8..64)", () => {
  it("aceita senha no limite inferior (8 caracteres)", () => {
    const result = validateRegistrationPassword("a".repeat(PASSWORD_MIN_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("aceita senha no limite superior (64 caracteres)", () => {
    const result = validateRegistrationPassword("a".repeat(PASSWORD_MAX_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("rejeita senha curta demais (7 caracteres) com erro de validação no campo password", () => {
    const result = validateRegistrationPassword("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("password");
    }
  });

  it("rejeita senha longa demais (65 caracteres)", () => {
    const result = validateRegistrationPassword("a".repeat(PASSWORD_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("rejeita senha vazia", () => {
    expect(validateRegistrationPassword("").ok).toBe(false);
  });
});

describe("validateNewPassword: alteração/redefinição (mínimo 8, sem máximo)", () => {
  it("aceita senha no limite inferior (8 caracteres)", () => {
    const result = validateNewPassword("a".repeat(PASSWORD_MIN_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("aceita senha bem acima do máximo de cadastro (200 caracteres)", () => {
    const result = validateNewPassword("a".repeat(200));
    expect(result.ok).toBe(true);
  });

  it("rejeita senha curta demais (7 caracteres) com erro de validação no campo password", () => {
    const result = validateNewPassword("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("password");
    }
  });

  it("rejeita senha vazia", () => {
    expect(validateNewPassword("").ok).toBe(false);
  });
});
