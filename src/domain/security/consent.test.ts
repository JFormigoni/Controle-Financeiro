import { describe, it, expect } from "vitest";
import {
  validateConsent,
  isConsentGiven,
  CONSENT_REQUIRED_MESSAGE,
  type ConsentInput,
} from "@/domain/security/consent";

/**
 * Sanity check do consentimento LGPD (Req. 16.9, 16.10).
 *
 * Verifica o caminho feliz (registro com versão + data/hora) e o bloqueio sem
 * consentimento. A propriedade universal "Consentimento obrigatório no
 * cadastro" (Property 42) é coberta pela tarefa 3.8.
 */
describe("validateConsent: registro e bloqueio (Req. 16.9, 16.10)", () => {
  const now = new Date("2026-02-01T12:30:00.000Z");

  it("registra consentimento com versão e data/hora quando aceito", () => {
    const input: ConsentInput = { accepted: true, termsVersion: "2026-01" };
    const result = validateConsent(input, now);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.termsVersion).toBe("2026-01");
      expect(result.value.consentedAt.getTime()).toBe(now.getTime());
    }
  });

  it("bloqueia a conclusão do cadastro sem consentimento (FORBIDDEN)", () => {
    const input: ConsentInput = { accepted: false, termsVersion: "2026-01" };
    const result = validateConsent(input, now);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.message).toBe(CONSENT_REQUIRED_MESSAGE);
    }
  });

  it("rejeita versão de termo vazia mesmo com aceite (VALIDATION)", () => {
    const result = validateConsent({ accepted: true, termsVersion: "  " }, now);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.field).toBe("termsVersion");
    }
  });

  it("isConsentGiven reflete o aceite explícito", () => {
    expect(isConsentGiven({ accepted: true, termsVersion: "v1" })).toBe(true);
    expect(isConsentGiven({ accepted: false, termsVersion: "v1" })).toBe(false);
  });
});
