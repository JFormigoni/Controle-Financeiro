import "server-only";
import ExcelJS from "exceljs";

import type { ExportTable } from "@/infra/export/index";

/**
 * Geração de arquivos .xlsx (Excel) a partir de um modelo tabular genérico.
 *
 * Biblioteca escolhida: **exceljs** — implementação 100% JavaScript (sem
 * dependências nativas que exijam compilação), com tipos TypeScript próprios,
 * o que evita atrito com o `moduleResolution: bundler` do Next.js e com o
 * ambiente serverless da Vercel.
 *
 * O conteúdo do arquivo reflete fielmente o `ExportTable` recebido
 * (cabeçalhos + linhas), preservando o mesmo conteúdo do relatório
 * (Req. 11.2). Um relatório vazio (`rows` vazio) gera uma planilha contendo
 * apenas a linha de cabeçalhos (Req. 11.4).
 */

/**
 * Serializa um {@link ExportTable} em um buffer .xlsx.
 *
 * @param table Modelo tabular (cabeçalhos e linhas) a exportar.
 * @returns Buffer com o conteúdo binário do arquivo .xlsx.
 */
export async function toXLSX(table: ExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Relatório");

  // Cabeçalhos sempre presentes (inclusive em relatórios vazios — Req. 11.4).
  worksheet.addRow(table.headers);

  for (const row of table.rows) {
    worksheet.addRow(row);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
