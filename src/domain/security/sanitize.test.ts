import { describe, it, expect } from "vitest";
import {
  sanitizeUserInput,
  sanitizeStringFields,
} from "@/domain/security/sanitize";

/**
 * Testes unitários de sanitização contra XSS (Req. 16.2).
 *
 * Cobrem exemplos representativos de neutralização e uma checagem de sanidade
 * de idempotência. A garantia universal de idempotência (Property 40) é
 * verificada pelo teste de propriedade da tarefa 3.4.
 */
describe("sanitizeUserInput: neutralização de conteúdo de script", () => {
  it("remove blocos <script> e seu conteúdo", () => {
    const out = sanitizeUserInput("<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("</script");
    expect(out).not.toMatch(/<|>/);
  });

  it("neutraliza tags com manipuladores de evento (img onerror)", () => {
    const out = sanitizeUserInput("<img src=x onerror=alert(1)>");
    // Sem sinais de menor/maior: a tag não se forma.
    expect(out).not.toMatch(/<|>/);
    // O gatilho do manipulador de evento foi quebrado.
    expect(out).not.toMatch(/onerror\s*=/i);
  });

  it("neutraliza o protocolo javascript:", () => {
    const out = sanitizeUserInput("javascript:alert(1)");
    expect(out).not.toMatch(/javascript\s*:/i);
  });

  it("escapa sinais de menor/maior soltos", () => {
    expect(sanitizeUserInput("1 < 2 > 0")).toBe("1 &lt; 2 &gt; 0");
  });

  it("preserva texto comum sem alterações", () => {
    const plain = "Salário de junho — conta 123";
    expect(sanitizeUserInput(plain)).toBe(plain);
  });

  it("preserva a string vazia", () => {
    expect(sanitizeUserInput("")).toBe("");
  });
});

describe("sanitizeUserInput: idempotência (sanidade)", () => {
  const samples = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
    "vbscript:msgbox(1)",
    "texto puro sem nada de especial",
    "1 < 2 > 3 & 4",
    "já &lt;sanitizado&gt;",
    "<scr<script>x</script>ipt>",
    "onx==  javascript::",
    "",
  ];

  for (const sample of samples) {
    it(`sanitize(sanitize(x)) === sanitize(x) para ${JSON.stringify(sample)}`, () => {
      const once = sanitizeUserInput(sample);
      const twice = sanitizeUserInput(once);
      expect(twice).toBe(once);
    });
  }
});

describe("sanitizeStringFields", () => {
  it("sanitiza apenas os campos string informados, sem mutar a entrada", () => {
    const input = {
      description: "<script>alert(1)</script>compras",
      amount: 1500,
      note: "<img src=x onerror=alert(1)>",
      untouched: "<b>mantido</b>",
    };
    const out = sanitizeStringFields(input, ["description", "note"]);

    expect(out).not.toBe(input); // nova instância
    expect(input.description).toBe("<script>alert(1)</script>compras"); // não muta
    expect(out.description).not.toMatch(/<|>/);
    expect(out.note).not.toMatch(/onerror\s*=/i);
    expect(out.amount).toBe(1500); // não-string preservado
    expect(out.untouched).toBe("<b>mantido</b>"); // campo não listado preservado
  });
});
