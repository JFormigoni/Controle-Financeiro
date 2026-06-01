/**
 * Serialização CSV — domínio puro de Exportação (Req. 11.3, 11.4).
 *
 * Implementa a (de)serialização de uma tabela tabular genérica para o formato
 * CSV seguindo o estilo **RFC 4180**, de modo que `parseCSV(toCSV(t))` recupere
 * exatamente a tabela `t` (round-trip — Property 31). Um relatório sem linhas
 * produz um CSV contendo **apenas a linha de cabeçalhos** (Req. 11.4).
 *
 * ## Modelo de dados
 *
 * Este módulo opera sobre um modelo **genérico e autocontido** ({@link CsvTable})
 * de células já convertidas para texto, e **não** depende do tipo `Report` do
 * Serviço de Relatórios. Isso mantém a serialização desacoplada: o orquestrador
 * de exportação (tarefa 14.11) adapta qualquer relatório para uma `CsvTable`
 * (por exemplo, formatando valores monetários com `formatCents`) e delega a
 * serialização a este módulo.
 *
 * ## Regras de citação (quoting) — RFC 4180
 *
 * - O separador de campos é a **vírgula** (`,`).
 * - O separador de registros (terminador de linha) é **CRLF** (`\r\n`). Os
 *   registros são **unidos** por CRLF, sem CRLF final após o último registro.
 * - Um campo é **envolvido por aspas duplas** (`"`) se, e somente se, contiver
 *   uma vírgula, uma aspa dupla, um CR (`\r`) ou um LF (`\n`).
 * - Aspas duplas presentes no conteúdo de um campo citado são **escapadas por
 *   duplicação** (`"` → `""`).
 * - Espaços em branco no início/fim de um campo são **preservados** (não há
 *   recorte/`trim`), e não exigem, por si só, citação.
 *
 * Como cada célula que contém CR ou LF é citada, esses caracteres só aparecem
 * **fora** de aspas quando atuam como terminador de registro; dentro de aspas
 * são preservados literalmente como parte do conteúdo da célula.
 *
 * ## Exatidão do round-trip
 *
 * Para qualquer tabela com **ao menos uma coluna** (cada registro contém ao
 * menos uma célula), `parseCSV(toCSV(t))` é igual a `t` para conteúdos de célula
 * arbitrários, incluindo vírgulas, aspas, quebras de linha e espaços nas
 * extremidades. Tabelas **sem colunas** (registros de zero células) são
 * degeneradas: um registro de zero células e um registro de uma única célula
 * vazia (`[""]`) serializam ambos para a string vazia e, portanto, não podem
 * ser distinguidos — não são suportadas para round-trip.
 *
 * Este módulo é **puro e total**: não acessa I/O, não lança exceções e não muta
 * suas entradas.
 *
 * Referência: design.md, "Property 31: Round-trip de serialização CSV";
 * requirements.md, critérios 11.3 e 11.4.
 */

// ---------------------------------------------------------------------------
// Modelo tabular genérico
// ---------------------------------------------------------------------------

/**
 * Tabela genérica de células já convertidas para texto.
 *
 * - `headers`: rótulos das colunas (uma célula por coluna).
 * - `rows`: linhas de dados; cada linha é uma lista de células de texto.
 *
 * Para round-trip exato, espera-se que a tabela seja **retangular** e tenha ao
 * menos uma coluna: `headers.length >= 1` e cada linha com o mesmo número de
 * células de `headers`. A serialização, contudo, não impõe essa forma.
 */
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Constantes do dialeto CSV
// ---------------------------------------------------------------------------

/** Separador de campos (RFC 4180). */
const FIELD_DELIMITER = ",";

/** Terminador de registro (RFC 4180): CRLF. */
const RECORD_DELIMITER = "\r\n";

/** Caractere de citação. */
const QUOTE = '"';

/** Campos que contêm qualquer um destes caracteres precisam ser citados. */
const NEEDS_QUOTING = /[",\r\n]/;

// ---------------------------------------------------------------------------
// Serialização: CsvTable -> string
// ---------------------------------------------------------------------------

/**
 * Serializa um único campo, aplicando citação RFC 4180 quando necessário.
 *
 * Envolve o campo em aspas duplas se ele contiver vírgula, aspa dupla, CR ou
 * LF, escapando aspas internas por duplicação. Caso contrário, retorna o campo
 * inalterado (preservando espaços nas extremidades).
 */
function serializeField(field: string): string {
  if (!NEEDS_QUOTING.test(field)) {
    return field;
  }
  const escaped = field.replace(/"/g, '""');
  return `${QUOTE}${escaped}${QUOTE}`;
}

/** Serializa um registro (cabeçalho ou linha) unindo os campos por vírgula. */
function serializeRecord(record: readonly string[]): string {
  return record.map(serializeField).join(FIELD_DELIMITER);
}

/**
 * Serializa uma {@link CsvTable} para uma string CSV (Req. 11.3, 11.4).
 *
 * Emite a linha de cabeçalhos seguida de uma linha por registro de `rows`,
 * unindo todos os registros por CRLF (sem CRLF ao final). Quando `rows` está
 * vazio, o resultado contém **apenas a linha de cabeçalhos** (Req. 11.4).
 *
 * É **pura e total**: não muta a entrada nem realiza I/O.
 *
 * @param table Tabela a serializar.
 * @returns String CSV no dialeto RFC 4180 documentado no módulo.
 */
export function toCSV(table: CsvTable): string {
  const records: readonly string[][] = [table.headers, ...table.rows];
  return records.map(serializeRecord).join(RECORD_DELIMITER);
}

// ---------------------------------------------------------------------------
// Desserialização: string -> CsvTable
// ---------------------------------------------------------------------------

/**
 * Analisa (parse) uma string CSV em uma {@link CsvTable}, invertendo
 * {@link toCSV} (Property 31).
 *
 * Implementa uma máquina de estados RFC 4180: campos podem ser citados com
 * aspas duplas (permitindo vírgulas, CR, LF e aspas escapadas por duplicação
 * no conteúdo) ou não citados. Fora de aspas, CRLF, um CR isolado ou um LF
 * isolado terminam o registro corrente; dentro de aspas, todos os caracteres
 * são literais.
 *
 * O primeiro registro torna-se `headers`; os demais, `rows`. Como
 * {@link toCSV} nunca emite CRLF ao final, o último registro é sempre
 * finalizado ao término da entrada.
 *
 * Casos de borda: a string vazia produz `{ headers: [""], rows: [] }` (um único
 * registro de uma célula vazia), coerente com a ambiguidade documentada de
 * registros de zero células.
 *
 * É **pura e total**: não lança exceções.
 *
 * @param csv String CSV a analisar.
 * @returns A tabela reconstruída.
 */
export function parseCSV(csv: string): CsvTable {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = csv.length;

  const endField = (): void => {
    record.push(field);
    field = "";
  };

  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < n) {
    const c = csv.charAt(i);

    if (inQuotes) {
      if (c === QUOTE) {
        if (csv.charAt(i + 1) === QUOTE) {
          // Aspa escapada por duplicação ("") -> uma aspa literal.
          field += QUOTE;
          i += 2;
        } else {
          // Fim do trecho citado.
          inQuotes = false;
          i += 1;
        }
      } else {
        // Qualquer caractere (incluindo CR/LF e vírgula) é literal entre aspas.
        field += c;
        i += 1;
      }
      continue;
    }

    if (c === QUOTE) {
      inQuotes = true;
      i += 1;
    } else if (c === FIELD_DELIMITER) {
      endField();
      i += 1;
    } else if (c === "\r") {
      // Terminador de registro: consome CRLF como uma unidade; um CR isolado
      // também termina o registro (robustez).
      i += csv.charAt(i + 1) === "\n" ? 2 : 1;
      endRecord();
    } else if (c === "\n") {
      i += 1;
      endRecord();
    } else {
      field += c;
      i += 1;
    }
  }

  // Finaliza o último registro (toCSV nunca emite CRLF final).
  endRecord();

  const [headers = [], ...rows] = records;
  return { headers, rows };
}
