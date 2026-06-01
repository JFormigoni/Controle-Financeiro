import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Teste de fumaça (smoke test) da UI.
 *
 * Objetivo: provar que React Testing Library + jsdom + os matchers do jest-dom
 * estão corretamente configurados. Renderiza um componente trivial e verifica
 * sua presença no DOM.
 */
function Hello({ name }: { name: string }) {
  return <h1>Olá, {name}</h1>;
}

describe("smoke: infraestrutura de testes de UI", () => {
  it("renderiza um componente e encontra o texto no DOM", () => {
    render(<Hello name="Kiro" />);
    expect(screen.getByRole("heading", { name: "Olá, Kiro" })).toBeInTheDocument();
  });
});
