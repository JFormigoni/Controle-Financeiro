import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { ExportTable } from "@/infra/export/index";

/**
 * Geração de arquivos PDF a partir de um modelo tabular genérico.
 *
 * Biblioteca escolhida: **pdf-lib** — implementação 100% JavaScript com tipos
 * TypeScript próprios e fontes padrão (Helvetica) embutidas, dispensando o
 * carregamento de arquivos de fonte externos. Isso a torna adequada ao
 * ambiente serverless da Vercel (sem acesso a sistema de arquivos para
 * assets) e ao `moduleResolution: bundler` do Next.js.
 *
 * O conteúdo do arquivo reflete o `ExportTable` recebido (cabeçalhos +
 * linhas), preservando o mesmo conteúdo do relatório (Req. 11.1). Um relatório
 * vazio (`rows` vazio) gera um PDF contendo apenas a linha de cabeçalhos
 * (Req. 11.4).
 */

const PAGE_WIDTH = 595.28; // A4 em pontos (largura).
const PAGE_HEIGHT = 841.89; // A4 em pontos (altura).
const MARGIN = 50;
const FONT_SIZE = 10;
const LINE_HEIGHT = 16;

/** Junta as células de uma linha em uma representação textual estável. */
function formatRow(cells: readonly string[]): string {
  return cells.join("  |  ");
}

/**
 * Serializa um {@link ExportTable} em um buffer PDF.
 *
 * @param table Modelo tabular (cabeçalhos e linhas) a exportar.
 * @returns Buffer com o conteúdo binário do arquivo PDF.
 */
export async function toPDF(table: ExportTable): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  const drawLine = (text: string, bold: boolean): void => {
    if (cursorY < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(text, {
      x: MARGIN,
      y: cursorY,
      size: FONT_SIZE,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    });
    cursorY -= LINE_HEIGHT;
  };

  // Cabeçalhos sempre presentes (inclusive em relatórios vazios — Req. 11.4).
  drawLine(formatRow(table.headers), true);

  for (const row of table.rows) {
    drawLine(formatRow(row), false);
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
