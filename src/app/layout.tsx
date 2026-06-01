import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma de Gestão Financeira",
  description:
    "Gestão financeira pessoal e empresarial: receitas, despesas, metas e relatórios.",
};

export const viewport: Viewport = {
  // Garante o comportamento responsivo a partir de 320px (Req. 13.4).
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-w-screen">{children}</body>
    </html>
  );
}
