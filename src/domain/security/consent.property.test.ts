import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { validateConsent, type ConsentInput } from "@/domain/security/consent";

/**
 * Teste de propriedade do consentimento LGPD obrigatório no cadastro.
 *
 * Cobre a Property 42 ("Consentimento obrigatório no cadastro"), que valida o
 * Req. 16.10: a conclusão do cadastro só é permitida quando o usuário aceita
 * o termo (`accepted === true`) E informa uma versão de termo não vazia (após
 * `trim`). Caso contrário, a conclusão é bloqueada:
 *
 * - `accepted === false` → bloqueio com código `FORBIDDEN`.
 * - `accepted === true` mas `termsVersion` em branco → `VALIDATION`.
 *
 * O caminho de sucesso captura `consentedAt === now` e a versão já normalizada
 * (com `trim`), conforme exigido pela LGPD (Req. 16.9).
 */
describe("validateConsent: propriedades (Req. 16.10)", () => {
  // Instante válido fixo usado como `now` ao longo das propriedades.
  const now = new Date("2026-02-01T12:30:00.000Z");

  // Gerador de strings em branco (vazias ou apenas espaços/tabs/quebras).
  const blankString = fc
    .stringMatching(/^[ \t\n\r]*$/)
    .filter((s) => s.trim().length === 0);

  // Gerador de strings cujo conteúdo permanece não vazio após `trim`.
  const nonBlankString = fc
    .string()
    .filter((s) => s.trim().length > 0);

  // Gerador de versões de termo arbitrárias (em branco ou não).
  const anyTermsVersion = fc.oneof(blankString, nonBlankString, fc.string());

  // Feature: financial-management-platform, Property 42: Consentimento obrigatório no cadastro
  it("permite concluir o cadastro sse aceito e versão do termo não vazia", () => {
    fc.assert(
      fc.property(fc.boolean(), anyTermsVersion, (accepted, termsVersion) => {
        const input: ConsentInput = { accepted, termsVersion };
        const result = validateConsent(input, now);

        const trimmed = termsVersion.trim();
        const shouldSucceed = accepted === true && trimmed.length > 0;

        expect(result.ok).toBe(shouldSucceed);

        if (!accepted) {
          // Sem aceite: bloqueio do cadastro com FORBIDDEN.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe("FORBIDDEN");
          }
        } else if (trimmed.length === 0) {
          // Aceite, porém versão em branco: VALIDATION no campo termsVersion.
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION");
            expect(result.error.field).toBe("termsVersion");
          }
        } else {
          // Aceite + versão válida: registro com data/hora e versão normalizada.
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.consentedAt.getTime()).toBe(now.getTime());
            expect(result.value.termsVersion).toBe(trimmed);
          }
        }
      }),
    );
  });
});
