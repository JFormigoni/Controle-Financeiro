import "server-only";

import { toXLSX } from "@/infra/export/xlsx";
import { toPDF } from "@/infra/export/pdf";

/**
 * Orquestração da exportação de relatórios em múltiplos formatos.
 *
 * Esta camada recebe um modelo tabular genérico ({@link ExportTable}) — o
 * mesmo conteúdo de relatório, já achatado em cabeçalhos e linhas de texto — e
 * gera cada formato solicitado de forma **independente**. A falha de um formato
 * não impede nem altera o resultado dos demais (Req. 11.5), e um formato que
 * falha não disponibiliza arquivo parcial: o resultado vem sem `buffer`,
 * apenas com a mensagem de erro, preservando os dados de origem (Req. 11.6).
 *
 * Sobre o CSV: a serialização CSV do domínio (`@/domain/export/csv`, tarefa
 * 14.9) está sendo criada em paralelo. Para evitar uma corrida de typecheck
 * com um módulo ainda inexistente, a serialização CSV é implementada aqui de
 * forma autocontida e compatível com o modelo tabular genérico. Quando o
 * `toCSV` do domínio estiver disponível, basta substituir {@link serializeCSV}
 * pela importação correspondente — a assinatura é estruturalmente compatível.
 */

/** Modelo tabular genérico usado como payload de exportação. */
export interface ExportTable {
  /** Cabeçalhos das colunas do relatório. */
  headers: string[];
  /** Linhas de dados; cada linha é uma lista de células já formatadas. */
  rows: string[][];
}

/** Formatos de exportação suportados. */
export type ExportFormat = "CSV" | "XLSX" | "PDF";

/**
 * Resultado da exportação de um único formato.
 *
 * - Sucesso: `{ ok: true, buffer }` — arquivo disponível para download.
 * - Falha: `{ ok: false, error }` — sem `buffer` (nenhum arquivo parcial).
 */
export interface ExportResult {
  /** Formato a que este resultado se refere. */
  format: ExportFormat;
  /** `true` quando o arquivo foi gerado com sucesso. */
  ok: boolean;
  /** Conteúdo binário do arquivo gerado; ausente em caso de falha. */
  buffer?: Buffer;
  /** Mensagem de erro quando a geração falhou; ausente em caso de sucesso. */
  error?: string;
}

/** Escapa uma célula conforme RFC 4180 (aspas, vírgulas e quebras de linha). */
function escapeCSVCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Serializa um {@link ExportTable} em texto CSV (cabeçalhos + linhas).
 * Relatórios vazios geram apenas a linha de cabeçalhos (Req. 11.4).
 */
function serializeCSV(table: ExportTable): string {
  const lines = [table.headers, ...table.rows].map((row) =>
    row.map(escapeCSVCell).join(","),
  );
  return lines.join("\r\n");
}

/** Gera o buffer CSV a partir do modelo tabular. */
async function generateCSV(table: ExportTable): Promise<Buffer> {
  return Buffer.from(serializeCSV(table), "utf-8");
}

/** Mapeia cada formato ao seu gerador de buffer. */
const GENERATORS: Record<ExportFormat, (table: ExportTable) => Promise<Buffer>> = {
  CSV: generateCSV,
  XLSX: toXLSX,
  PDF: toPDF,
};

/** Normaliza um erro desconhecido em uma mensagem de exibição segura. */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Falha na exportação do relatório.";
}

/**
 * Exporta um relatório nos formatos solicitados, cada um de forma independente.
 *
 * Cada formato é gerado isoladamente (try/catch por formato via
 * `Promise.allSettled`), de modo que a falha de um não impede os demais
 * (Req. 11.5). Um formato que falha retorna `{ ok: false, error }` sem buffer,
 * não disponibilizando arquivo parcial (Req. 11.6). A ordem dos resultados
 * corresponde à ordem dos formatos solicitados.
 *
 * @param table Modelo tabular do relatório a exportar.
 * @param formats Formatos solicitados (pode conter um ou vários).
 * @returns Lista de {@link ExportResult}, um por formato solicitado.
 */
export async function exportReport(
  table: ExportTable,
  formats: ExportFormat[],
): Promise<ExportResult[]> {
  const settled = await Promise.allSettled(
    formats.map(async (format): Promise<ExportResult> => {
      try {
        const buffer = await GENERATORS[format](table);
        return { format, ok: true, buffer };
      } catch (error) {
        // Falha isolada: sem buffer (nenhum arquivo parcial), com mensagem.
        return { format, ok: false, error: toErrorMessage(error) };
      }
    }),
  );

  return settled.map((outcome, index) => {
    // O `catch` interno já captura rejeições; este fallback cobre o caso
    // improvável de uma rejeição escapar, mantendo a isolação por formato.
    if (outcome.status === "fulfilled") {
      return outcome.value;
    }
    return {
      format: formats[index] as ExportFormat,
      ok: false,
      error: toErrorMessage(outcome.reason),
    };
  });
}
