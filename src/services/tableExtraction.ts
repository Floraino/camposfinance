/**
 * Table Extraction - Detecta e extrai a tabela de transações/saldo em planilhas
 * com conteúdo extra (cabeçalho do banco, rodapé, totais, linhas em branco, seções).
 *
 * Heurísticas:
 * - Detecção do header por tokens (data, descri, crédito, débito, etc.)
 * - Delimitação de colunas úteis (gap de colunas vazias = fim)
 * - Identificação do bloco de dados (data válida ou descricao+valor)
 * - Filtro de linhas ruins (rodapé, totais, saldo anterior, header repetido)
 */

import { parseLocalizedNumber, parseDate } from "@/services/csvImportService";

/** Limite de linhas para varredura inicial (performance) */
const SCAN_HEADER_LIMIT = 200;
/** Mínimo de tokens no header para considerar válido */
const HEADER_MIN_TOKENS = 3;
/** N linhas inválidas consecutivas para encerrar o bloco */
const INVALID_ROWS_STOP = 3;
/** Gap de colunas vazias para considerar fim da tabela */
const COLUMN_GAP_THRESHOLD = 3;

export interface ExtractedTable {
  headerRowIndex: number;
  dataStartRow: number;
  dataEndRow: number;
  /** Índices das colunas extraídas */
  columnIndices: number[];
  /** Labels do header (nomes das colunas) */
  columns: string[];
  /** Linhas de dados (só células das colunas selecionadas) */
  rows: string[][];
  /** Matriz completa extraída (header + data) para CSV */
  matrix: string[][];
}

export interface ExtractResult {
  success: boolean;
  table?: ExtractedTable;
  error?: string;
}

/** Tokens que identificam colunas de extrato bancário (case-insensitive, tolerante a acentos). Itaú/Santander: movimento, texto. */
const HEADER_TOKENS = [
  "data", "dt", "descri", "hist", "lançamento", "lancamento", "movimento", "texto",
  "docto", "documento", "situação", "situacao", "credito", "crédito", "debito", "débito",
  "entrada", "saida", "saída", "valor", "saldo", "historico", "histórico",
];

/** Palavras que indicam linha de rodapé (encerram o bloco de dados) */
const FOOTER_PATTERNS = [
  /^total\s*(do\s*periodo|geral)?$/i,
  /^totais$/i,
  /^saldo\s*final/i,
  /^resumo$/i,
  /^fim$/i,
  /^assinatura/i,
  /^gerado\s*em/i,
  /^documento\s*gerado/i,
];

/** Padrões para "saldo anterior/inicial" - não importar por padrão */
const SALDO_INICIAL_PATTERNS = [
  /^saldo\s*anterior/i,
  /^saldo\s*inicial/i,
];

/**
 * Normaliza string para comparação (remove acentos, lowercase, trim)
 */
export function normalizeString(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Verifica se a string é uma data em formato pt-BR (dd/mm/yyyy ou similar)
 */
export function isDatePtBr(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = parseFloat(v);
    if (n > 1 && n < 100000) return true; // Excel serial
  }
  return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(v) ||
         /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(v);
}

/**
 * Verifica se a string parece um valor monetário pt-BR
 */
export function parseMoneyPtBr(value: string | number | null): number | null {
  return parseLocalizedNumber(value);
}

/**
 * Verifica se a linha parece rodapé (total, totais, saldo final, etc.)
 */
export function isLikelyFooterRow(cells: string[]): boolean {
  const joined = cells.join(" ").trim();
  const norm = normalizeString(joined);
  if (norm.length < 3) return false;
  for (const p of FOOTER_PATTERNS) {
    if (p.test(joined) || p.test(norm)) return true;
  }
  if (/^total\s/i.test(norm) || norm.startsWith("totais")) return true;
  return false;
}

/**
 * Verifica se a linha é "saldo anterior/inicial"
 */
function isSaldoInicialRow(cells: string[]): boolean {
  const joined = cells.join(" ").trim();
  for (const p of SALDO_INICIAL_PATTERNS) {
    if (p.test(joined)) return true;
  }
  return false;
}

/**
 * Verifica se a linha é repetição do header (muitos tokens de header)
 */
function isHeaderRepeatRow(cells: string[], headerTokens: Set<string>): boolean {
  let matches = 0;
  for (const cell of cells) {
    const n = normalizeString(cell);
    for (const tok of headerTokens) {
      if (n.includes(tok) || n === tok) {
        matches++;
        break;
      }
    }
  }
  return matches >= HEADER_MIN_TOKENS;
}

/**
 * Calcula score de uma linha como candidata a header.
 * Score = qtd tokens + bônus se "data" na 1ª coluna útil.
 */
function scoreHeaderRow(cells: string[]): { score: number; tokens: Set<string> } {
  const tokens = new Set<string>();
  let score = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const n = normalizeString(cell);
    if (!n) continue;
    for (const tok of HEADER_TOKENS) {
      if (n.includes(tok) || n === tok) {
        tokens.add(tok);
        score++;
        if (tok === "data" && i <= 1) score += 2; // bônus Data na 1ª coluna
        break;
      }
    }
  }
  return { score, tokens };
}

/**
 * Encontra a linha de header na matriz (primeiras SCAN_HEADER_LIMIT linhas)
 */
function findHeaderRow(matrix: string[][]): { rowIndex: number; tokens: Set<string> } | null {
  const limit = Math.min(matrix.length, SCAN_HEADER_LIMIT);
  let best: { rowIndex: number; score: number; tokens: Set<string> } | null = null;

  for (let r = 0; r < limit; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;
    const nonEmpty = row.filter((c) => String(c || "").trim()).length;
    if (nonEmpty < 2) continue;

    const { score, tokens } = scoreHeaderRow(row);
    if (score >= HEADER_MIN_TOKENS && (!best || score > best.score)) {
      best = { rowIndex: r, score, tokens };
    }
  }
  return best ? { rowIndex: best.rowIndex, tokens: best.tokens } : null;
}

/**
 * Determina os índices das colunas úteis a partir do header.
 * Para quando houver gap de COLUMN_GAP_THRESHOLD colunas vazias.
 */
function getUsefulColumnIndices(
  matrix: string[][],
  headerRowIndex: number,
  _headerTokens: Set<string>
): number[] {
  const headerRow = matrix[headerRowIndex] || [];
  const numCols = Math.max(...matrix.slice(headerRowIndex).map((r) => (r || []).length), headerRow.length);
  const indices: number[] = [];
  let emptyStreak = 0;
  let foundFirst = false;

  for (let c = 0; c < numCols; c++) {
    const cell = String(headerRow[c] || "").trim();
    const hasDataBelow = matrix
      .slice(headerRowIndex + 1, headerRowIndex + 6)
      .some((r) => String(r?.[c] ?? "").trim() !== "");

    if (cell || hasDataBelow) {
      foundFirst = true;
      emptyStreak = 0;
      indices.push(c);
    } else {
      if (foundFirst) emptyStreak++;
      if (emptyStreak >= COLUMN_GAP_THRESHOLD) break;
    }
  }
  return indices;
}

/**
 * Indica se a linha de dados é válida (transação importável).
 * - Tem data válida OU (descricao não vazia E valor numérico)
 */
function isValidDataRow(
  row: string[],
  colIndices: number[],
  dateColHint: number | null,
  descColHint: number | null,
  amountColHints: number[]
): boolean {
  const cells = colIndices.map((i) => String(row[i] ?? "").trim());
  if (cells.every((c) => !c)) return false;

  // Verificar data
  if (dateColHint !== null && dateColHint < row.length) {
    const dateVal = String(row[dateColHint] ?? "").trim();
    if (isDatePtBr(dateVal)) return true;
  }
  for (let i = 0; i < cells.length; i++) {
    if (isDatePtBr(cells[i])) return true;
  }

  // Descricao + valor
  const hasDesc = descColHint !== null
    ? String(row[descColHint] ?? "").trim().length > 1
    : cells.some((c) => c.length > 2 && !isDatePtBr(c) && parseMoneyPtBr(c) === null);
  const hasAmount = amountColHints.length > 0
    ? amountColHints.some((i) => parseMoneyPtBr(row[i]) !== null)
    : cells.some((c) => parseMoneyPtBr(c) !== null);

  return hasDesc && hasAmount;
}

/**
 * Detecta índices de colunas por tipo (data, descricao, credito, debito)
 */
function detectColumnTypes(headerRow: string[], colIndices: number[]): {
  dateCol: number | null;
  descCol: number | null;
  amountCols: number[];
} {
  let dateCol: number | null = null;
  let descCol: number | null = null;
  const amountCols: number[] = [];

  for (let idx = 0; idx < colIndices.length; idx++) {
    const c = colIndices[idx];
    const label = normalizeString(String(headerRow[c] ?? ""));

    if (/^data|^dt$|^dia$|moviment|movimento/i.test(label)) dateCol = c;
    else if (/descri|hist|lan[cç]amento|estabelecimento|nome|texto/i.test(label)) descCol = c;
    else if (/credito|cr[eé]dito|entrada/i.test(label) || /debito|d[eé]bito|sa[ií]da/i.test(label) || /valor|valor\s*\(/i.test(label)) {
      amountCols.push(c);
    }
  }

  // Fallback: primeira coluna com data, segunda com texto, última com número
  if (dateCol === null && colIndices.length >= 1) {
    dateCol = colIndices[0];
  }
  if (descCol === null && colIndices.length >= 2) {
    descCol = colIndices[1];
  }
  if (amountCols.length === 0 && colIndices.length >= 3) {
    amountCols.push(colIndices[colIndices.length - 1]);
  }

  return { dateCol, descCol, amountCols };
}

/**
 * Extrai a tabela importável de uma matriz 2D.
 */
export function extractImportableTable(matrix: string[][]): ExtractResult {
  if (!matrix || matrix.length < 2) {
    return { success: false, error: "Matriz vazia ou insuficiente" };
  }

  // Normalizar: garantir que todas as linhas são arrays de string
  const normMatrix = matrix.map((row) =>
    (row || []).map((cell) => String(cell ?? "").trim())
  );

  const headerResult = findHeaderRow(normMatrix);
  if (!headerResult) {
    return {
      success: false,
      error: `Não foi possível identificar o cabeçalho da tabela (mín. ${HEADER_MIN_TOKENS} colunas: data, descrição, valor, etc.)`,
    };
  }

  const { rowIndex: headerRowIndex, tokens: headerTokens } = headerResult;
  const columnIndices = getUsefulColumnIndices(normMatrix, headerRowIndex, headerTokens);

  if (columnIndices.length === 0) {
    return { success: false, error: "Nenhuma coluna útil encontrada" };
  }

  const headerRow = normMatrix[headerRowIndex];
  const columns = columnIndices.map((i) => headerRow[i] || `Coluna ${i + 1}`);
  const { dateCol, descCol, amountCols } = detectColumnTypes(headerRow, columnIndices);

  const dataStartRow = headerRowIndex + 1;
  let dataEndRow = dataStartRow - 1;
  let invalidStreak = 0;
  const dataRows: string[][] = [];

  for (let r = dataStartRow; r < normMatrix.length; r++) {
    const row = normMatrix[r];
    if (!row) continue;

    // Rodapé
    if (isLikelyFooterRow(row)) {
      break;
    }

    // Saldo anterior
    if (isSaldoInicialRow(row)) {
      invalidStreak++;
      if (invalidStreak >= INVALID_ROWS_STOP) break;
      continue;
    }

    // Header repetido
    if (isHeaderRepeatRow(row, headerTokens)) {
      invalidStreak++;
      if (invalidStreak >= INVALID_ROWS_STOP) break;
      continue;
    }

    const isValid = isValidDataRow(row, columnIndices, dateCol, descCol, amountCols);

    if (isValid) {
      invalidStreak = 0;
      const trimmedRow = columnIndices.map((i) => String(row[i] ?? "").trim());
      dataRows.push(trimmedRow);
      dataEndRow = r;
    } else {
      invalidStreak++;
      if (invalidStreak >= INVALID_ROWS_STOP) break;
    }
  }

  if (dataRows.length === 0) {
    return {
      success: false,
      error: "Nenhuma linha de transação válida encontrada após o cabeçalho",
    };
  }

  const matrixOut = [
    columns,
    ...dataRows,
  ];

  return {
    success: true,
    table: {
      headerRowIndex,
      dataStartRow,
      dataEndRow,
      columnIndices,
      columns,
      rows: dataRows,
      matrix: matrixOut,
    },
  };
}

/**
 * Converte matriz extraída para string CSV-like (; separador)
 */
export function matrixToCsvString(matrix: string[][]): string {
  const escape = (cell: string) => {
    const s = String(cell ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return matrix.map((row) => row.map(escape).join(";")).join("\n");
}
