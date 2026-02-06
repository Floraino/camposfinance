import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface ColumnMapping {
  csvColumn: string;
  csvIndex: number;
  internalField: string;
  confidence: number;
}

export interface RowAnalysis {
  rowIndex: number;
  status: "OK" | "SKIPPED" | "ERROR";
  reason?: string;
}

export interface CSVAnalysis {
  separator: string;
  encoding: string;
  dateFormat: string;
  currencyFormat: string;
  hasHeader: boolean;
  hasEntradaSaida: boolean;
  columnMappings: ColumnMapping[];
  sampleRows: Record<string, string>[];
  rowAnalysis: RowAnalysis[];
}

export type ParsedRowStatus = "OK" | "SKIPPED" | "ERROR";

export interface ParsedRow {
  rowIndex: number;
  raw: string;
  status: ParsedRowStatus;
  parsed: {
    description: string;
    amount: number;
    type: "INCOME" | "EXPENSE";
    category: CategoryType;
    payment_method: "pix" | "boleto" | "card" | "cash";
    status: "paid" | "pending";
    transaction_date: string;
    notes?: string;
    import_hash?: string;
  } | null;
  errors: string[];
  reason?: string; // Human-readable reason for SKIPPED/ERROR
  isDuplicate?: boolean;
  requiresDateConfirmation?: boolean; // When date is missing and user needs to confirm using today
  originalDateStr?: string; // Original date string from CSV for display
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

// Category mapping for inference
const categoryMapping: Record<string, CategoryType> = {
  "alimentação": "food", "alimentacao": "food", "comida": "food",
  "mercado": "food", "supermercado": "food", "restaurante": "food",
  "ifood": "food", "uber eats": "food", "padaria": "food",
  "transporte": "transport", "uber": "transport", "99": "transport",
  "combustível": "transport", "combustivel": "transport", "gasolina": "transport",
  "posto": "transport", "estacionamento": "transport",
  "moradia": "bills", "aluguel": "bills", "casa": "bills",
  "condomínio": "bills", "condominio": "bills",
  "lazer": "leisure", "entretenimento": "leisure", "diversão": "leisure",
  "cinema": "leisure", "netflix": "leisure", "spotify": "leisure",
  "saúde": "health", "saude": "health", "farmácia": "health",
  "farmacia": "health", "médico": "health", "medico": "health",
  "educação": "education", "educacao": "education", "curso": "education",
  "escola": "education", "faculdade": "education", "livro": "education",
  "compras": "shopping", "roupas": "shopping", "vestuário": "shopping",
  "amazon": "shopping", "mercado livre": "shopping", "magazine": "shopping",
  "contas": "bills", "conta": "bills", "luz": "bills",
  "água": "bills", "agua": "bills", "internet": "bills",
  "telefone": "bills", "celular": "bills", "energia": "bills",
  "food": "food", "transport": "transport", "housing": "bills",
  "entertainment": "leisure", "health": "health", "education": "education",
  "shopping": "shopping", "bills": "bills", "leisure": "leisure",
  "outros": "other", "outro": "other", "other": "other",
  // Income-related
  "salário": "other", "salario": "other", "renda": "other",
  "pix recebido": "other", "transferência recebida": "other",
};

const paymentMapping: Record<string, "pix" | "boleto" | "card" | "cash"> = {
  "pix": "pix", "boleto": "boleto",
  "cartão": "card", "cartao": "card", "card": "card",
  "crédito": "card", "credito": "card",
  "débito": "card", "debito": "card",
  "dinheiro": "cash", "cash": "cash",
  "espécie": "cash", "especie": "cash",
};

// Patterns to detect non-transaction lines
const NON_TRANSACTION_PATTERNS = [
  /^ag[êe]ncia\s*[:\/-]/i,
  /^conta\s*[:\/-]/i,
  /^extrato\s+(gerado|de|para)/i,
  /^per[íi]odo\s*[:\/-]/i,
  /^saldo\s+(anterior|inicial|final)/i,
  /^data\s+de\s+(emiss[ãa]o|gera[çc][ãa]o)/i,
  /^cliente\s*[:\/-]/i,
  /^cpf\s*[:\/-]/i,
  /^cnpj\s*[:\/-]/i,
  /^total\s+(do\s+per[íi]odo|geral)/i,
  /^(resumo|totais|consolidado)/i,
];

const HEADER_PATTERNS = [
  /^data$/i,
  /^descri[çc][ãa]o$/i,
  /^valor$/i,
  /^entrada\s*\(?\s*r?\$?\s*\)?$/i,
  /^sa[íi]da\s*\(?\s*r?\$?\s*\)?$/i,
  /^saldo\s*\(?\s*r?\$?\s*\)?$/i,
  /^hist[óo]rico$/i,
  /^lan[çc]amento$/i,
];

/**
 * Analyze CSV content using AI edge function.
 * If edge function is unavailable, falls back to local rule-based analysis.
 */
export async function analyzeCSV(csvContent: string): Promise<CSVAnalysis> {
  // Validate CSV size on client (max 5MB)
  if (csvContent.length > 5 * 1024 * 1024) {
    throw new Error("Arquivo CSV muito grande (máximo 5MB). Divida o arquivo em partes menores.");
  }

  // Validate CSV has content
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    throw new Error("O CSV deve ter pelo menos 2 linhas (cabeçalho + dados).");
  }

  try {
    const { data, error } = await supabase.functions.invoke("analyze-csv", {
      body: { csvContent, sampleSize: 50 },
    });

    if (error) {
      console.warn("[CSV] Edge function analyze-csv indisponível, usando análise local:", error.message);
      return localAnalyzeCSV(csvContent);
    }

    if (data?.error) {
      console.warn("[CSV] Edge function retornou erro:", data.error);
      return localAnalyzeCSV(csvContent);
    }

    return data as CSVAnalysis;
  } catch (networkErr) {
    console.warn("[CSV] Network error ao chamar analyze-csv, usando análise local:", networkErr);
    return localAnalyzeCSV(csvContent);
  }
}

/**
 * Local CSV analysis fallback (no AI, pure rules).
 * Used when edge function is not deployed or unavailable.
 */
function localAnalyzeCSV(csvContent: string): CSVAnalysis {
  console.log("[CSV] Running local analysis (rule-based)...");
  
  const allLines = csvContent.split(/\r?\n/).filter(l => l.trim());
  
  // Detect separator
  const firstLines = allLines.slice(0, 10);
  const sepCounts = { ",": 0, ";": 0, "\t": 0 };
  for (const line of firstLines) {
    sepCounts[","] += (line.match(/,/g) || []).length;
    sepCounts[";"] += (line.match(/;/g) || []).length;
    sepCounts["\t"] += (line.match(/\t/g) || []).length;
  }
  const separator = Object.entries(sepCounts).sort(([, a], [, b]) => b - a)[0][0] as "," | ";" | "\t";

  const rows = allLines.map(line => line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, '')));
  
  // Detect header
  const firstRow = rows[0] || [];
  const lowerFirstRow = firstRow.map(h => h.toLowerCase().trim());
  const isHeader = lowerFirstRow.some(h => /^(data|descri|valor|entrada|sa[ií]da|hist[oó]rico)/.test(h));
  
  const headers = isHeader ? firstRow : firstRow.map((_, i) => `Coluna ${i + 1}`);
  const dataStartIndex = isHeader ? 1 : 0;
  const dataRows = rows.slice(dataStartIndex, 50 + dataStartIndex);

  // Detect Entrada/Saída
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  const entradaIndex = lowerHeaders.findIndex(h => /entrada/i.test(h));
  const saidaIndex = lowerHeaders.findIndex(h => /sa[ií]da/i.test(h));
  const hasEntradaSaida = entradaIndex >= 0 && saidaIndex >= 0;

  // Rule-based column mapping
  const columnMappings: ColumnMapping[] = [];
  const usedIndices = new Set<number>();
  const emptyColumns = new Set<number>();
  const numCols = Math.max(...rows.map(r => r.length));

  for (let col = 0; col < numCols; col++) {
    const colValues = rows.map(r => r[col] || "").filter(v => v.trim() !== "");
    if (colValues.length <= 1) emptyColumns.add(col);
  }

  // Map by header name
  for (let i = 0; i < lowerHeaders.length; i++) {
    if (emptyColumns.has(i)) continue;
    const h = lowerHeaders[i];
    if (/saldo|balance/i.test(h)) continue; // skip saldo

    if (hasEntradaSaida && i === entradaIndex) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "entrada", confidence: 0.95 });
      usedIndices.add(i);
    } else if (hasEntradaSaida && i === saidaIndex) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "saida", confidence: 0.95 });
      usedIndices.add(i);
    } else if (/^(data|date|dia|dt|movimenta)/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.9 });
      usedIndices.add(i);
    } else if (/descri|nome|hist[oó]rico|lan[cç]amento|estabelecimento/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "description", confidence: 0.9 });
      usedIndices.add(i);
    } else if (!hasEntradaSaida && /valor|amount|total|pre[cç]o|custo/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.9 });
      usedIndices.add(i);
    } else if (/categ|tipo/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "category", confidence: 0.8 });
      usedIndices.add(i);
    } else if (/pagamento|payment|forma|m[eé]todo/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "payment_method", confidence: 0.8 });
      usedIndices.add(i);
    }
  }

  // Content-based detection for unmapped columns
  for (let i = 0; i < headers.length; i++) {
    if (usedIndices.has(i) || emptyColumns.has(i)) continue;
    const sampleValues = dataRows.slice(0, 5).map(r => r[i] || "");
    
    if (!columnMappings.find(m => m.internalField === "date")) {
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
      if (sampleValues.filter(v => datePattern.test(v.trim())).length >= 3) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
    }
    
    if (!hasEntradaSaida && !columnMappings.find(m => m.internalField === "amount")) {
      const isAmount = sampleValues.filter(v => /^-?[R$\s]*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/.test(v.replace(/[R$\s]/g, "").trim())).length >= 3;
      if (isAmount) {
        columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.7 });
        usedIndices.add(i);
        continue;
      }
    }
  }

  // Assign longest text column as description if not found
  if (!columnMappings.find(m => m.internalField === "description")) {
    let maxLen = 0, descIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i) || emptyColumns.has(i)) continue;
      const avgLen = dataRows.slice(0, 5).reduce((sum, r) => sum + (r[i]?.length || 0), 0) / 5;
      if (avgLen > maxLen) { maxLen = avgLen; descIdx = i; }
    }
    if (descIdx >= 0) {
      columnMappings.push({ csvColumn: headers[descIdx], csvIndex: descIdx, internalField: "description", confidence: 0.6 });
    }
  }

  // Build sample rows
  const sampleRowsMapped = dataRows.slice(0, 15).map((row, idx) => {
    const mapped: Record<string, string> = {};
    for (const mapping of columnMappings) {
      mapped[mapping.internalField] = row[mapping.csvIndex] || "";
    }
    mapped._raw = row.join(" | ");
    mapped._rowIndex = String(dataStartIndex + idx + 1);
    return mapped;
  });

  return {
    separator,
    encoding: "UTF-8",
    dateFormat: "dd/MM/yyyy",
    currencyFormat: "BR",
    hasHeader: isHeader,
    hasEntradaSaida,
    columnMappings,
    sampleRows: sampleRowsMapped,
    rowAnalysis: [],
  };
}

/**
 * Parse Brazilian number format to float
 * Accepts: "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-123,45", "(123,45)"
 */
export function parseLocalizedNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;

  let str = String(value).trim();
  
  // Check if it looks like a header value (text instead of number)
  if (/^[a-zA-ZçÇãÃõÕáÁéÉíÍóÓúÚ\s()$]+$/.test(str)) {
    return null; // This is text, not a number
  }
  
  // Handle parentheses as negative
  const isNegativeParens = str.startsWith("(") && str.endsWith(")");
  if (isNegativeParens) {
    str = str.slice(1, -1);
  }

  // Remove currency symbols and spaces
  str = str.replace(/[R$€£¥\s]/gi, "");

  // If empty after cleanup, return null
  if (!str || str === "-") return null;

  // Detect format by analyzing position of comma and dot
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");

  if (lastComma > lastDot && lastComma > str.length - 4) {
    // Brazilian format: 1.234,56 or 1234,56
    str = str.replace(/\./g, ""); // Remove thousand separators
    str = str.replace(",", "."); // Convert decimal separator
  } else if (lastDot > lastComma && lastDot > str.length - 4) {
    // US format: 1,234.56 or 1234.56
    str = str.replace(/,/g, ""); // Remove thousand separators
  } else if (lastComma > -1 && lastDot === -1) {
    // Only comma: could be 1234,56
    str = str.replace(",", ".");
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return null;

  return isNegativeParens ? -Math.abs(parsed) : parsed;
}

/**
 * Parse date from various formats to ISO format (YYYY-MM-DD)
 */
export function parseDate(value: string | null, dateFormat?: string): string | null {
  if (!value || value.trim() === "") return null;

  const trimmed = value.trim();

  // Handle Excel serial dates
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial > 1 && serial < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + serial * 86400000);
      return formatDateISO(date);
    }
  }

  // Try to parse with detected format first
  const formats = [
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ["day", "month", "year"] },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ["day", "month", "year"] },
    { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ["year", "month", "day"] },
    { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ["year", "month", "day"] },
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ["day", "month", "year2"] },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{2})$/, order: ["day", "month", "year2"] },
  ];

  for (const fmt of formats) {
    const match = trimmed.match(fmt.regex);
    if (match) {
      const parts: Record<string, number> = {};
      fmt.order.forEach((key, idx) => {
        let val = parseInt(match[idx + 1], 10);
        if (key === "year2") {
          val = val > 50 ? 1900 + val : 2000 + val;
          parts["year"] = val;
        } else {
          parts[key] = val;
        }
      });

      const date = new Date(parts.year, parts.month - 1, parts.day);
      if (!isNaN(date.getTime()) && date.getFullYear() === parts.year) {
        return formatDateISO(date);
      }
    }
  }

  return null;
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Infer category from description using keywords
 */
export function inferCategory(description: string): CategoryType {
  const lower = description.toLowerCase();
  
  for (const [keyword, category] of Object.entries(categoryMapping)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  
  return "other";
}

/**
 * Infer payment method from description
 */
export function inferPaymentMethod(description: string): "pix" | "boleto" | "card" | "cash" {
  const lower = description.toLowerCase();
  
  for (const [keyword, method] of Object.entries(paymentMapping)) {
    if (lower.includes(keyword)) {
      return method;
    }
  }
  
  return "pix"; // Default
}

/**
 * Generate a hash for deduplication
 */
export function generateImportHash(date: string, amount: number, description: string): string {
  const normalized = `${date}|${Math.round(amount * 100)}|${description.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Check if a line is a non-transaction line (header, informational, etc.)
 */
function isNonTransactionLine(cells: string[], rawLine: string): { skip: boolean; reason?: string } {
  const joinedCells = cells.join(" ").trim();
  const nonEmptyCells = cells.filter(c => c.trim() !== "");
  
  // Empty line
  if (nonEmptyCells.length === 0) {
    return { skip: true, reason: "Linha vazia" };
  }
  
  // Check against patterns
  for (const pattern of NON_TRANSACTION_PATTERNS) {
    if (pattern.test(joinedCells) || pattern.test(rawLine)) {
      return { skip: true, reason: "Linha informativa do extrato" };
    }
  }
  
  // Check if it's a header row
  const headerMatches = cells.filter(c => 
    HEADER_PATTERNS.some(p => p.test(c.trim()))
  );
  if (headerMatches.length >= 2 && headerMatches.length >= nonEmptyCells.length * 0.5) {
    return { skip: true, reason: "Linha de cabeçalho" };
  }
  
  // Very short line with no numbers
  if (nonEmptyCells.length === 1 && !/\d/.test(nonEmptyCells[0])) {
    return { skip: true, reason: "Linha sem dados de transação" };
  }
  
  return { skip: false };
}

function isLikelyAmount(str: string): boolean {
  const cleaned = str.replace(/[R$\s]/g, "").trim();
  return /^-?\d{1,3}([.,]\d{3})*([.,]\d{1,2})?$/.test(cleaned) ||
         /^-?\d+([.,]\d{1,2})?$/.test(cleaned);
}

function isLikelyDate(str: string): boolean {
  return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(str.trim()) ||
         /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(str.trim());
}

/**
 * Parse CSV content into rows with the given column mappings
 * Now supports Entrada/Saída columns and proper INCOME/EXPENSE typing
 */
export function parseCSVWithMappings(
  csvContent: string,
  mappings: ColumnMapping[],
  separator: string,
  hasHeader: boolean,
  dateFormat?: string,
  hasEntradaSaida?: boolean
): ParsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  const startIndex = hasHeader ? 1 : 0;
  const results: ParsedRow[] = [];

  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of mappings) {
    mappingByField[m.internalField] = m;
  }

  // Check if we have entrada/saida mappings
  const entradaCol = mappingByField["entrada"];
  const saidaCol = mappingByField["saida"];
  const hasEntradaSaidaMappings = !!entradaCol || !!saidaCol;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
    
    // Check if this is a non-transaction line
    const skipCheck = isNonTransactionLine(cells, line);
    if (skipCheck.skip) {
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "SKIPPED",
        parsed: null,
        errors: [],
        reason: skipCheck.reason,
      });
      continue;
    }
    
    const errors: string[] = [];

    // Get values from mapped columns
    const descCol = mappingByField["description"];
    const amountCol = mappingByField["amount"];
    const dateCol = mappingByField["date"];
    const categoryCol = mappingByField["category"];
    const paymentCol = mappingByField["payment_method"];
    const notesCol = mappingByField["notes"];

    // Parse description
    let description = descCol ? cells[descCol.csvIndex] || "" : "";
    if (!description) {
      // Try to find any text that's not amount or date
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        if (cell && cell.length > 2 && !isLikelyAmount(cell) && !isLikelyDate(cell)) {
          description = cell;
          break;
        }
      }
    }
    if (!description) description = "Transação importada";

    // Parse amount and determine type (INCOME/EXPENSE)
    let amount: number | null = null;
    let transactionType: "INCOME" | "EXPENSE" = "EXPENSE";

    if (hasEntradaSaidaMappings) {
      // Handle separate Entrada/Saída columns
      const entradaStr = entradaCol ? cells[entradaCol.csvIndex] || "" : "";
      const saidaStr = saidaCol ? cells[saidaCol.csvIndex] || "" : "";
      
      const entradaValue = parseLocalizedNumber(entradaStr);
      const saidaValue = parseLocalizedNumber(saidaStr);
      
      if (entradaValue !== null && entradaValue !== 0) {
        // This is income (entrada)
        amount = Math.abs(entradaValue);
        transactionType = "INCOME";
      } else if (saidaValue !== null && saidaValue !== 0) {
        // This is expense (saída)
        amount = Math.abs(saidaValue);
        transactionType = "EXPENSE";
      } else {
        // Both are empty or zero
        errors.push("Entrada e Saída vazias");
      }
    } else {
      // Single amount column
      const amountStr = amountCol ? cells[amountCol.csvIndex] : "";
      amount = parseLocalizedNumber(amountStr);
      
      if (amount !== null) {
        // Determine type by sign
        if (amount > 0) {
          transactionType = "INCOME";
          amount = Math.abs(amount);
        } else {
          transactionType = "EXPENSE";
          amount = Math.abs(amount);
        }
      } else if (amountStr) {
        errors.push(`Valor inválido: "${amountStr}"`);
      } else {
        errors.push("Valor não encontrado");
      }
    }

    // Parse date - NEVER default to today silently
    const dateStr = dateCol ? cells[dateCol.csvIndex] : "";
    const transaction_date = parseDate(dateStr, dateFormat);
    
    // Track if date is missing or invalid
    let dateWarning: string | null = null;
    let requiresDateConfirmation = false;
    
    if (!transaction_date) {
      if (dateStr && dateStr.trim()) {
        // Date column exists but value is invalid
        errors.push(`Data inválida: "${dateStr}"`);
      } else {
        // No date value at all
        dateWarning = "Data não encontrada no extrato";
        requiresDateConfirmation = true;
      }
    }

    // Parse category
    const categoryStr = categoryCol ? cells[categoryCol.csvIndex]?.toLowerCase() : "";
    const category: CategoryType = categoryMapping[categoryStr] || inferCategory(description);

    // Parse payment method
    const paymentStr = paymentCol ? cells[paymentCol.csvIndex]?.toLowerCase() : "";
    const payment_method = paymentMapping[paymentStr] || inferPaymentMethod(description);

    // Notes
    const notes = notesCol ? cells[notesCol.csvIndex] : undefined;

    // Determine final status - date errors are critical now
    const hasDateError = !transaction_date && (errors.some(e => e.includes("Data inválida")) || requiresDateConfirmation);
    const hasAmountError = amount === null || amount === 0;
    
    if (errors.includes("Entrada e Saída vazias")) {
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "SKIPPED",
        parsed: null,
        errors: [],
        reason: "Entrada e Saída vazias",
      });
    } else if (hasDateError && !hasAmountError) {
      // Has amount but no valid date - mark as error, not OK with fallback
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "ERROR",
        parsed: null,
        errors: errors.length > 0 ? errors : [dateWarning || "Data não encontrada"],
        reason: dateWarning || errors[0] || "Data inválida ou ausente",
        requiresDateConfirmation,
      } as ParsedRow);
    } else if (!hasAmountError && transaction_date) {
      // Valid amount AND valid date - OK
      const finalAmount = transactionType === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount);

      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "OK",
        parsed: {
          description: description.substring(0, 255),
          amount: finalAmount,
          type: transactionType,
          category,
          payment_method,
          status: "paid",
          transaction_date,
          notes: notes?.substring(0, 500),
          import_hash: generateImportHash(transaction_date, finalAmount, description),
        },
        errors: [],
      });
    } else {
      // Missing amount or other critical errors
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "ERROR",
        parsed: null,
        errors: errors.length > 0 ? errors : ["Não foi possível processar esta linha"],
        reason: errors.length > 0 ? errors[0] : "Dados inválidos",
      });
    }
  }

  return results;
}

/**
 * Import transactions via edge function.
 * Falls back to direct Supabase insert if edge function is unavailable.
 */
export async function importTransactions(
  householdId: string,
  transactions: ParsedRow[],
  skipDuplicates = true
): Promise<ImportResult> {
  const validTransactions = transactions
    .filter(t => t.parsed !== null && t.status === "OK")
    .map(t => t.parsed);

  if (validTransactions.length === 0) {
    return {
      imported: 0,
      duplicates: 0,
      failed: transactions.filter(t => t.status === "ERROR").length,
      errors: [{ row: 0, reason: "Nenhuma transação válida para importar" }],
    };
  }

  // Try edge function first
  try {
    const { data, error } = await supabase.functions.invoke("import-csv", {
      body: { householdId, transactions: validTransactions, skipDuplicates },
    });

    if (error) {
      console.warn("[CSV Import] Edge function indisponível, usando importação direta:", error.message);
      return await directImport(householdId, validTransactions, skipDuplicates);
    }

    if (data?.error) {
      // If it's a PRO check failure, propagate
      if (data.code === "PRO_REQUIRED") {
        throw new Error("Importação CSV é um recurso PRO. Atualize o plano da família.");
      }
      throw new Error(data.error);
    }

    return data as ImportResult;
  } catch (err) {
    // If it's a known error (PRO, auth), propagate
    if (err instanceof Error && (err.message.includes("PRO") || err.message.includes("autenticado"))) {
      throw err;
    }
    console.warn("[CSV Import] Trying direct import fallback:", err);
    return await directImport(householdId, validTransactions, skipDuplicates);
  }
}

/**
 * Direct import fallback when edge function is unavailable.
 * Inserts transactions directly via Supabase client.
 */
async function directImport(
  householdId: string,
  transactions: Array<ParsedRow["parsed"]>,
  skipDuplicates: boolean
): Promise<ImportResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const result: ImportResult = { imported: 0, duplicates: 0, failed: 0, errors: [] };

  // Check for existing duplicates
  let existingHashes = new Set<string>();
  if (skipDuplicates) {
    const { data: existing } = await supabase
      .from("transactions")
      .select("transaction_date, amount, description")
      .eq("household_id", householdId);

    if (existing) {
      for (const tx of existing) {
        existingHashes.add(generateImportHash(tx.transaction_date, tx.amount, tx.description));
      }
    }
  }

  const toInsert: any[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx) continue;

    if (skipDuplicates && tx.import_hash && existingHashes.has(tx.import_hash)) {
      result.duplicates++;
      continue;
    }

    toInsert.push({
      user_id: user.id,
      household_id: householdId,
      description: tx.description.substring(0, 255),
      amount: tx.amount,
      category: tx.category || "other",
      payment_method: tx.payment_method || "pix",
      status: tx.status || "paid",
      transaction_date: tx.transaction_date,
      notes: tx.notes ? tx.notes.substring(0, 500) : null,
      is_recurring: false,
      created_at: now,
      updated_at: now,
    });
  }

  // Insert in batches of 50
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error: insertError } = await supabase.from("transactions").insert(batch);

    if (insertError) {
      console.error("[CSV Import] Direct insert error:", insertError);
      result.failed += batch.length;
      result.errors.push({ row: i + 1, reason: insertError.message });
    } else {
      result.imported += batch.length;
    }
  }

  console.log(`[CSV Import] Direct import done: imported=${result.imported}, duplicates=${result.duplicates}, failed=${result.failed}`);
  return result;
}

/**
 * CSV Template - Standard format for the app
 */
export const CSV_TEMPLATE_HEADER = "data,descricao,tipo,valor,categoria,forma_pagamento,conta";

export const CSV_TEMPLATE_EXAMPLES = [
  "2026-01-15,Salário mensal,INCOME,5000.00,other,pix,Conta Corrente",
  "2026-01-16,Supermercado Pão de Açúcar,EXPENSE,350.50,food,card,Conta Corrente",
  "2026-01-17,Uber - corrida trabalho,EXPENSE,25.90,transport,pix,Conta Corrente",
];

/**
 * Generate the standard CSV template for download
 */
export function generateCSVTemplate(): string {
  const instructions = [
    "# MODELO CSV PADRÃO - CasaClara",
    "# Este é o formato ideal para importação de transações",
    "#",
    "# CAMPOS:",
    "#   data: formato YYYY-MM-DD (ex: 2026-01-15) ou DD/MM/YYYY",
    "#   descricao: texto descritivo da transação",
    "#   tipo: INCOME (receita) ou EXPENSE (despesa)",
    "#   valor: número positivo (ex: 150.50 ou 1500.00)",
    "#   categoria: food, transport, bills, leisure, health, education, shopping, other",
    "#   forma_pagamento: pix, card, boleto, cash",
    "#   conta: nome da conta (opcional)",
    "#",
    "# REMOVA estas linhas de comentário antes de importar",
    "#",
  ];
  
  return [
    ...instructions,
    CSV_TEMPLATE_HEADER,
    ...CSV_TEMPLATE_EXAMPLES,
  ].join("\n");
}

/**
 * Download the CSV template
 */
export function downloadCSVTemplate(): void {
  const content = generateCSVTemplate();
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_importacao_casaclara.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Check if a CSV matches the standard template format
 */
export function isStandardFormat(csvContent: string): boolean {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) return false;
  
  const header = lines[0].toLowerCase().replace(/\s/g, "");
  const expectedHeader = CSV_TEMPLATE_HEADER.toLowerCase().replace(/\s/g, "");
  
  // Check if header matches our standard format
  return header === expectedHeader || 
         header.includes("data,descricao,tipo,valor") ||
         header.includes("data,descrição,tipo,valor");
}

/**
 * Parse a standard format CSV directly (skip AI analysis)
 */
export function parseStandardCSV(csvContent: string): ParsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return [];
  
  const results: ParsedRow[] = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
    
    if (cells.length < 4) {
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "SKIPPED",
        parsed: null,
        errors: [],
        reason: "Linha com poucos campos",
      });
      continue;
    }
    
    const [dateStr, description, typeStr, valorStr, categoryStr, paymentStr] = cells;
    
    // Parse date - NEVER default to today silently
    const transaction_date = parseDate(dateStr);
    if (!transaction_date) {
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "ERROR",
        parsed: null,
        errors: [dateStr ? `Data inválida: "${dateStr}"` : "Data não encontrada"],
        reason: dateStr ? `Data inválida: "${dateStr}"` : "Data não encontrada na linha",
        requiresDateConfirmation: !dateStr,
      });
      continue;
    }
    
    // Parse type
    const transactionType = typeStr?.toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
    
    // Parse amount
    const amount = parseLocalizedNumber(valorStr);
    if (amount === null || amount === 0) {
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "ERROR",
        parsed: null,
        errors: [`Valor inválido: "${valorStr}"`],
        reason: `Valor inválido: "${valorStr}"`,
      });
      continue;
    }
    
    // Category mapping
    const category: CategoryType = categoryMapping[categoryStr?.toLowerCase() || ""] || 
                                   inferCategory(description) || 
                                   "other";
    
    // Payment method
    const payment_method = paymentMapping[paymentStr?.toLowerCase() || ""] || 
                          inferPaymentMethod(description) || 
                          "pix";
    
    const finalAmount = transactionType === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount);
    
    results.push({
      rowIndex: i + 1,
      raw: line,
      status: "OK",
      parsed: {
        description: description.substring(0, 255) || "Transação importada",
        amount: finalAmount,
        type: transactionType,
        category,
        payment_method,
        status: "paid",
        transaction_date,
        import_hash: generateImportHash(transaction_date, finalAmount, description),
      },
      errors: [],
    });
  }
  
  return results;
}

export interface ConvertedTransaction {
  data: string;
  descricao: string;
  tipo: "INCOME" | "EXPENSE";
  valor: number;
  categoria: string;
  forma_pagamento: string;
  conta?: string;
  status: "OK" | "SKIPPED" | "ERROR";
  reason?: string;
  originalRow: string;
}

export interface ConversionResult {
  converted: ConvertedTransaction[];
  summary: {
    total: number;
    ok: number;
    skipped: number;
    errors: number;
    totalIncome: number;
    totalExpense: number;
  };
}

/**
 * Convert a bank statement CSV to the app's standard format using the existing parsing logic
 */
export async function convertBankStatement(csvContent: string): Promise<ConversionResult> {
  // First analyze with AI
  const analysis = await analyzeCSV(csvContent);
  
  // Then parse with detected mappings
  const parsedRows = parseCSVWithMappings(
    csvContent,
    analysis.columnMappings,
    analysis.separator,
    analysis.hasHeader,
    analysis.dateFormat,
    analysis.hasEntradaSaida
  );
  
  // Convert to standard format
  const converted: ConvertedTransaction[] = parsedRows.map(row => {
    if (row.status === "OK" && row.parsed) {
      const parsed = row.parsed;
      return {
        data: parsed.transaction_date,
        descricao: parsed.description,
        tipo: parsed.type,
        valor: Math.abs(parsed.amount),
        categoria: parsed.category,
        forma_pagamento: parsed.payment_method,
        status: "OK" as const,
        originalRow: row.raw,
      };
    } else if (row.status === "SKIPPED") {
      return {
        data: "",
        descricao: "",
        tipo: "EXPENSE" as const,
        valor: 0,
        categoria: "other",
        forma_pagamento: "pix",
        status: "SKIPPED" as const,
        reason: row.reason,
        originalRow: row.raw,
      };
    } else {
      return {
        data: "",
        descricao: "",
        tipo: "EXPENSE" as const,
        valor: 0,
        categoria: "other",
        forma_pagamento: "pix",
        status: "ERROR" as const,
        reason: row.reason || row.errors[0],
        originalRow: row.raw,
      };
    }
  });
  
  const ok = converted.filter(c => c.status === "OK");
  const totalIncome = ok.filter(c => c.tipo === "INCOME").reduce((sum, c) => sum + c.valor, 0);
  const totalExpense = ok.filter(c => c.tipo === "EXPENSE").reduce((sum, c) => sum + c.valor, 0);
  
  return {
    converted,
    summary: {
      total: converted.length,
      ok: ok.length,
      skipped: converted.filter(c => c.status === "SKIPPED").length,
      errors: converted.filter(c => c.status === "ERROR").length,
      totalIncome,
      totalExpense,
    },
  };
}

/**
 * Generate a CSV string in standard format from converted transactions
 */
export function generateStandardCSV(transactions: ConvertedTransaction[]): string {
  const okTransactions = transactions.filter(t => t.status === "OK");
  
  const lines = [
    CSV_TEMPLATE_HEADER,
    ...okTransactions.map(t => 
      `${t.data},${escapeCsvField(t.descricao)},${t.tipo},${t.valor.toFixed(2)},${t.categoria},${t.forma_pagamento},${t.conta || ""}`
    ),
  ];
  
  return lines.join("\n");
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Download converted CSV in standard format
 */
export function downloadConvertedCSV(transactions: ConvertedTransaction[]): void {
  const content = generateStandardCSV(transactions);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "extrato_convertido.csv";
  a.click();
  URL.revokeObjectURL(url);
}
