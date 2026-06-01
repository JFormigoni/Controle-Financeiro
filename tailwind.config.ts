import type { Config } from "tailwindcss";

/**
 * Breakpoints alinhados aos limiares de responsividade dos requisitos 13.1-13.3:
 * - base (< 768px): layout de smartphone (área de toque mínima 44x44px)
 * - md (768px .. 1023px): layout de tablet
 * - lg (>= 1024px): layout de desktop (navegação sempre visível)
 * As funcionalidades permanecem operáveis a partir de 320px (Req. 13.4).
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      md: "768px",
      lg: "1024px",
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      minWidth: {
        screen: "320px",
      },
      spacing: {
        // Área de toque mínima exigida em smartphone (Req. 13.3).
        touch: "44px",
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
