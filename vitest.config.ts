import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Configuração do Vitest para a Plataforma de Gestão Financeira.
 *
 * - `jsdom` fornece um DOM para os testes de UI (React Testing Library).
 * - `resolve.tsconfigPaths` resolve nativamente os aliases `@/*` definidos em
 *   `tsconfig.json`, evitando duplicação de configuração de caminhos.
 * - `@vitejs/plugin-react` habilita JSX/TSX nos testes de componentes.
 * - `setupFiles` carrega os matchers do jest-dom e a configuração global do
 *   fast-check (`numRuns: 100`) antes de cada arquivo de teste.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
