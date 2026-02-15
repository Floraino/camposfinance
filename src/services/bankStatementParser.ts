/**
 * Bank Statement Parser - Converte arquivos TXT e XLS/XLSX para o formato CSV-like
 * usado pelo pipeline de importação existente (analyzeCSV, parseCSVWithMappings).
 *
 * A saída é sempre uma string com linhas separadas por \n e colunas por um delimitador
 * consistente (; ou \t), compatível com o fluxo atual.
 *
 * Para XLS e TXT, aplica table extraction (extractImportableTable) para recortar
 * somente a tabela de transações quando há cabeçalho/rodapé/linhas extras.
 */

import {
  extractImportableTable,
  matrixToCsvString,
  type ExtractResult,
} from "@/services/tableExtraction";

export type SupportedFormat = "csv" | "txt" | "xls" | "xlsx";

export interface ParseFileResult {
  content: string;
  format: SupportedFormat;
  /** true se aplicou recorte de tabela (table extraction) */
  extracted?: boolean;
}

const SUPPORTED_EXTENSIONS = [".csv", ".txt", ".xls", ".xlsx"] as const;
const ALLOWED_MIME_TYPES: Record<string, SupportedFormat> = {
  "text/csv": "csv",
  "text/plain": "txt",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/**
 * Valida se o arquivo pode ser processado pelo importador
 */
export function isSupportedFile(file: File): { supported: boolean; format?: SupportedFormat; error?: string } {
  const name = file.name.toLowerCase();
  const ext = SUPPORTED_EXTENSIONS.find((e) => name.endsWith(e));
  if (!ext) {
    return {
      supported: false,
      error: `Formato não suportado. Use: ${SUPPORTED_EXTENSIONS.join(", ")}`,
    };
  }
  const format = ext.replace(".", "") as SupportedFormat;
  return { supported: true, format };
}

/**
 * Detecta o delimitador mais provável em um arquivo TXT
 * Retorna o delimitador e a contagem por linha para consistência
 */
function detectTxtDelimiter(lines: string[]): "," | ";" | "\t" | null {
  const sample = lines.slice(0, 10).filter((l) => l.trim().length > 0);
  if (sample.length < 2) return null;

  const counts: Record<string, number[]> = { ",": [], ";": [], "\t": [] };
  for (const line of sample) {
    counts[","].push((line.match(/,/g) || []).length);
    counts[";"].push((line.match(/;/g) || []).length);
    counts["\t"].push((line.match(/\t/g) || []).length);
  }

  // Delimitador válido: mesma contagem em todas as linhas e > 0
  for (const [sep, arr] of Object.entries(counts)) {
    const first = arr[0];
    if (first != null && first > 0 && arr.every((c) => c === first)) {
      return sep as "," | ";" | "\t";
    }
  }

  // Se vírgula aparece em todas as linhas com contagem similar (variação pequena)
  const commaAvg = counts[","].reduce((a, b) => a + b, 0) / counts[","].length;
  if (commaAvg >= 1 && counts[","].every((c) => Math.abs(c - commaAvg) <= 1)) {
    return ",";
  }
  const semicolonAvg = counts[";"].reduce((a, b) => a + b, 0) / counts[";"].length;
  if (semicolonAvg >= 1 && counts[";"].every((c) => Math.abs(c - semicolonAvg) <= 1)) {
    return ";";
  }
  const tabAvg = counts["\t"].reduce((a, b) => a + b, 0) / counts["\t"].length;
  if (tabAvg >= 1 && counts["\t"].every((c) => c === tabAvg)) {
    return "\t";
  }

  return null;
}

/**
 * Tenta extrair colunas de um texto fixed-width (múltiplos espaços separando colunas)
 */
function parseFixedWidth(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    const cols = line.split(/\s{2,}/).map((c) => c.trim()).filter((c) => c.length > 0);
    if (cols.length > 0) rows.push(cols);
  }
  return rows;
}

/**
 * Converte TXT para matriz 2D (para table extraction ou CSV)
 */
function parseTxtToMatrix(rawContent: string): string[][] {
  const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectTxtDelimiter(lines);
  if (delimiter) {
    return lines.map((line) =>
      line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""))
    );
  }
  return parseFixedWidth(lines);
}

/**
 * Converte TXT para string CSV-like (colunas unificadas por ;)
 * Detecta: delimitado (;, \t, ,) ou fixed-width
 */
export function normalizeTxtToCsv(rawContent: string): string {
  const rows = parseTxtToMatrix(rawContent);
  if (rows.length === 0) return "";

  const outputDelimiter = ";";
  const escapeCell = (cell: string) => {
    if (cell.includes(outputDelimiter) || cell.includes('"') || cell.includes("\n")) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  return rows.map((row) => row.map(escapeCell).join(outputDelimiter)).join("\n");
}

/**
 * Lê arquivo como texto com fallback de encoding (UTF-8 -> ISO-8859-1)
 */
async function readFileAsText(file: File): Promise<string> {
  if (typeof file.arrayBuffer !== "function") {
    return file.text();
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = decoder.decode(bytes);
  if (text.includes("\uFFFD")) {
    const latin1 = new TextDecoder("iso-8859-1");
    text = latin1.decode(bytes);
  }
  return text;
}

/**
 * Converte XLS/XLSX para matriz 2D usando SheetJS (xlsx)
 */
async function parseXlsToMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Planilha vazia");
  const sheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
  const matrix = (json as unknown[]).map((row) =>
    (Array.isArray(row) ? row : [row]).map((c) => String(c ?? "").trim())
  );
  return matrix;
}

/**
 * Converte XLS/XLSX para string CSV-like usando SheetJS (xlsx)
 */
async function parseXlsToCsv(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Planilha vazia");
  const sheet = workbook.Sheets[firstSheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    FS: ";",
    RS: "\n",
    blankrows: false,
    raw: true,
  });
  return csv.trim();
}

/**
 * Converte qualquer arquivo suportado para conteúdo CSV-like (string)
 * para alimentar o pipeline analyzeCSV / parseCSVWithMappings.
 *
 * Para XLS e TXT: tenta table extraction primeiro. Se falhar, usa planilha/arquivo completo.
 */
export async function parseFileToCsvContent(
  file: File
): Promise<ParseFileResult> {
  const { supported, format } = isSupportedFile(file);
  if (!supported || !format) {
    throw new Error("Arquivo não suportado. Use CSV, TXT, XLS ou XLSX.");
  }

  if (format === "csv") {
    const content = await readFileAsText(file);
    return { content, format: "csv" };
  }

  if (format === "txt") {
    const raw = await readFileAsText(file);
    const matrix = parseTxtToMatrix(raw);
    if (matrix.length === 0) throw new Error("Arquivo TXT vazio ou sem dados reconhecíveis.");

    const extract: ExtractResult = extractImportableTable(matrix);
    if (extract.success && extract.table && extract.table.rows.length > 0) {
      const content = matrixToCsvString(extract.table.matrix);
      if (content) {
        return { content, format: "txt", extracted: true };
      }
    }
    const content = normalizeTxtToCsv(raw);
    if (!content) throw new Error("Arquivo TXT vazio ou sem dados reconhecíveis.");
    return { content, format: "txt" };
  }

  if (format === "xls" || format === "xlsx") {
    const buffer =
      typeof file.arrayBuffer === "function"
        ? await file.arrayBuffer()
        : await new Response(file as Blob).arrayBuffer();
    const matrix = await parseXlsToMatrix(buffer);
    if (matrix.length === 0) throw new Error("Planilha vazia ou sem dados.");

    const extract: ExtractResult = extractImportableTable(matrix);
    if (extract.success && extract.table && extract.table.rows.length > 0) {
      const content = matrixToCsvString(extract.table.matrix);
      if (content) {
        return { content, format, extracted: true };
      }
    }
    const content = await parseXlsToCsv(buffer);
    if (!content) throw new Error("Planilha vazia ou sem dados.");
    return { content, format };
  }

  throw new Error(`Formato não implementado: ${format}`);
}
