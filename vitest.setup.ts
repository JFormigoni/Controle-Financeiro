import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as fc from "fast-check";

/**
 * Setup global da suíte de testes.
 *
 * 1. Importa os matchers do `@testing-library/jest-dom` (ex.: `toBeInTheDocument`)
 *    para uso nos testes de UI.
 * 2. Configura o `fast-check` globalmente com `numRuns: 100`, garantindo que todo
 *    teste de propriedade execute no mínimo 100 iterações por padrão
 *    (conforme as notas do plano de tarefas).
 * 3. Faz `cleanup()` do DOM após cada teste para isolar os testes de componentes.
 */
fc.configureGlobal({ numRuns: 100 });

afterEach(() => {
  cleanup();
});
