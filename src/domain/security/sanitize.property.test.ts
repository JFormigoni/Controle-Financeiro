import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

import { sanitizeUserInput } from "@/domain/security/sanitize";

/**
 * Teste de propriedade da sanitização de entrada contra XSS (Req. 16.2).
 *
 * Cobre a **Property 40** ("Sanitização de entrada contra XSS"): para qualquer
 * entrada de usuário, `sanitizeUserInput` é **idempotente** — aplicá-la sobre
 * uma entrada já sanitizada produz exatamente o mesmo resultado:
 *
 *   sanitizeUserInput(sanitizeUserInput(x)) === sanitizeUserInput(x)
 *
 * Além da idempotência, verificamos um invariante de segurança útil: a saída
 * sanitizada **não contém `<` nem `>` crus** (foram escapados para `&lt;`/
 * `&gt;`), de modo que nenhuma tag pode se formar — e, por consequência, a
 * saída é um **ponto fixo** estável sob reaplicação.
 */
describe("sanitizeUserInput: propriedades de sanitização XSS (Req. 16.2)", () => {
  // Fragmentos perigosos representativos usados para estressar o sanitizador.
  const dangerousFragments = [
    "<script>",
    "</script>",
    "<script",
    "<style>",
    "</style>",
    "javascript:",
    "vbscript:",
    "onerror=",
    "onclick=",
    "onload =",
    "<img",
    "<svg",
    "<",
    ">",
    "<>",
    '"',
    "'",
    "&",
    "&lt;",
    "&gt;",
    "&amp;",
    "alert(1)",
    "texto comum",
    " ",
    "",
  ];

  // Gerador que intercala fragmentos perigosos com texto arbitrário, cobrindo
  // sobreposições maliciosas (ex.: "<scr<script>x</script>ipt>") e resíduos.
  const xssProneString = fc
    .array(
      fc.oneof(
        fc.constantFrom(...dangerousFragments),
        fc.string(),
      ),
      { maxLength: 12 },
    )
    .map((parts) => parts.join(""));

  // Conjunto de geradores: strings arbitrárias + strings ricas em vetores XSS.
  const anyInput = fc.oneof(fc.string(), xssProneString);

  // Feature: financial-management-platform, Property 40: Sanitização de entrada contra XSS (idempotência)
  it("sanitizeUserInput(sanitizeUserInput(x)) === sanitizeUserInput(x) para qualquer string", () => {
    fc.assert(
      fc.property(anyInput, (x) => {
        const once = sanitizeUserInput(x);
        const twice = sanitizeUserInput(once);

        // Idempotência: a segunda aplicação é um no-op (Property 40).
        expect(twice).toBe(once);

        // Invariante de segurança: nenhuma `<`/`>` crua sobra na saída — todas
        // foram escapadas, impedindo a formação de qualquer tag executável.
        expect(once).not.toMatch(/[<>]/);

        // A saída já sanitizada é um ponto fixo (estável sob reaplicação).
        expect(sanitizeUserInput(once)).toBe(once);
      }),
    );
  });
});
