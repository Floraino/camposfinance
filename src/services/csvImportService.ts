import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";
import { sanitizeTransactionForInsert } from "./transactionSanitizer";

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
    amount: number; // sempre negativo (gasto)
    type: "EXPENSE";
    /** Categoria fixa (bills, food, ...) ou custom (custom:<uuid>) */
    category: string;
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
  /** Linhas descartadas por serem entradas (conta corrente: amount > 0 ignorado) */
  ignoredIncome?: number;
  createdCount?: number;
  linkedAccountId?: string | null;
  linkedCardId?: string | null;
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
  "salário": "other", "salario": "other", "renda": "other",
  "pix recebido": "other", "transferência recebida": "other",
};


// Patterns to detect non-transaction lines (bank statements)
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

// Patterns to detect summary/total lines in credit card statements
const CARD_STATEMENT_SUMMARY_PATTERNS = [
  /^total/i,
  /^pagamento/i,
  /^saldo/i,
  /^encargos/i,
  /^juros/i,
  /^anuidade/i,
  /^resumo/i,
  /^parcelamento/i,
  /^iof/i,
  /^multa/i,
  /^desconto/i,
  /^ajuste/i,
  /^estorno/i,
  /^fatura\s+(anterior|atual|fechada)/i,
  /^limite/i,
  /^dispon[ií]vel/i,
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

  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  const entradaIndex = lowerHeaders.findIndex(h => /entrada/i.test(h));
  const saidaIndex = lowerHeaders.findIndex(h => /sa[ií]da/i.test(h));
  const creditoIndex = lowerHeaders.findIndex(h => /cr[eé]dito/i.test(h));
  const debitoIndex = lowerHeaders.findIndex(h => /d[eé]bito/i.test(h));
  const hasEntradaSaida = (entradaIndex >= 0 && saidaIndex >= 0) || (creditoIndex >= 0 && debitoIndex >= 0);

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

    if ((hasEntradaSaida && i === entradaIndex) || (creditoIndex >= 0 && i === creditoIndex)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: creditoIndex >= 0 && i === creditoIndex ? "credito" : "entrada", confidence: 0.95 });
      usedIndices.add(i);
    } else if ((hasEntradaSaida && i === saidaIndex) || (debitoIndex >= 0 && i === debitoIndex)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: debitoIndex >= 0 && i === debitoIndex ? "debito" : "saida", confidence: 0.95 });
      usedIndices.add(i);
    } else if (/^(data|date|dia|dt|movimenta|vencimento|lan[cç]amento|compra|transa)/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "date", confidence: 0.9 });
      usedIndices.add(i);
    } else if (/descri|nome|hist[oó]rico|lan[cç]amento|estabelecimento/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "description", confidence: 0.9 });
      usedIndices.add(i);
    } else if (!hasEntradaSaida && /valor|amount|total|pre[cç]o|custo/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "amount", confidence: 0.9 });
      usedIndices.add(i);
    } else if (/natureza|^type$|debit|credit|d[eé]bito|cr[eé]dito|^tipo$|entrada|sa[ií]da/i.test(h) && !columnMappings.find(m => m.internalField === "transaction_type")) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "transaction_type", confidence: 0.85 });
      usedIndices.add(i);
    } else if (/categ/i.test(h)) {
      columnMappings.push({ csvColumn: headers[i], csvIndex: i, internalField: "category", confidence: 0.8 });
      usedIndices.add(i);
    }
  }

  // Content-based detection for unmapped columns
  for (let i = 0; i < headers.length; i++) {
    if (usedIndices.has(i) || emptyColumns.has(i)) continue;
    const sampleValues = dataRows.slice(0, 5).map(r => r[i] || "");
    
    if (!columnMappings.find(m => m.internalField === "date")) {
      // Enhanced date detection: strings DD/MM/YYYY, YYYY-MM-DD, Excel serial numbers
      const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
      const dateMatches = sampleValues.filter(v => {
        const trimmed = String(v).trim();
        if (!trimmed) return false;
        
        // Check string date patterns (DD/MM/YYYY, YYYY-MM-DD)
        if (datePattern.test(trimmed)) return true;
        
        // Check Excel serial numbers (integers between 1 and 100000)
        // Handle both raw numbers and formatted numbers (e.g., "45234" or "45.234,00")
        let numStr = trimmed.replace(/[^\d.]/g, ""); // Remove all non-digits except dot
        // If it has comma, might be Brazilian format - try to parse
        if (trimmed.includes(",") && !trimmed.includes(".")) {
          // Brazilian format: "45234,00" -> treat as integer
          numStr = trimmed.replace(/[^\d]/g, "");
        }
        const num = parseFloat(numStr);
        if (!isNaN(num) && num > 1 && num < 100000) {
          // Check if integer (Excel dates are usually integers)
          if (num % 1 === 0 || (num % 1 < 0.01)) { // Allow small decimals (time component)
            // Verify it's a valid date serial
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + Math.round(num) * 86400000);
            if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
              return true;
            }
          }
        }
        return false;
      });
      // Require at least 50% of sample values to match date pattern
      const nonEmptyValues = sampleValues.filter(v => String(v).trim());
      if (dateMatches.length >= Math.max(3, Math.floor(nonEmptyValues.length * 0.5))) {
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
 * Also handles Excel-formatted numbers and Date objects (returns null for dates)
 */
export function parseLocalizedNumber(value: string | number | Date | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return null; // Dates should be parsed separately
  if (typeof value === "number") {
    // If it's a very large integer that could be an Excel date serial, return null
    // (let parseDate handle it)
    if (value > 1 && value < 100000 && value % 1 === 0) {
      // Could be Excel date serial - but we'll let the caller decide
      // For now, return as-is (it's a valid number)
    }
    return value;
  }

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
 * Resultado da decisão: importar linha como gasto ou descartar.
 * App controla apenas gastos — entradas são ignoradas.
 */
export interface ShouldImportAsExpenseResult {
  import: boolean;
  /** Valor positivo do gasto (para persistir como -amount) */
  amount?: number;
  /** Motivo quando import=false (income_credit, income_positive_value, no_amount, zero_value) */
  reason?: string;
}

/**
 * Verifica se a linha deve ser importada como gasto.
 * Entradas (crédito ou valor positivo) são descartadas em bank_account.
 * Em credit_card: usa polaridade do arquivo (purchasesArePositive) para decidir:
 *   - purchasesArePositive: amount > 0 => compra (importar como -abs); amount < 0 => ignorar
 *   - purchasesAreNegative: amount < 0 => compra (manter); amount > 0 => ignorar
 */
export function shouldImportAsExpense(
  cells: string[],
  mappingByField: Record<string, ColumnMapping>,
  hasCreditoDebitoColumns: boolean,
  sourceType: "bank_account" | "credit_card" = "bank_account",
  purchasesArePositive?: boolean
): ShouldImportAsExpenseResult {
  const creditoCol = mappingByField["credito"] ?? mappingByField["entrada"];
  const debitoCol = mappingByField["debito"] ?? mappingByField["saida"];

  // A) Colunas Crédito/Débito (comportamento igual para ambos os modos)
  if (hasCreditoDebitoColumns && (creditoCol || debitoCol)) {
    const creditoStr = creditoCol ? cells[creditoCol.csvIndex] ?? "" : "";
    const debitoStr = debitoCol ? cells[debitoCol.csvIndex] ?? "" : "";
    const creditoVal = parseLocalizedNumber(creditoStr);
    const debitoVal = parseLocalizedNumber(debitoStr);
    const hasCredito = creditoVal !== null && creditoVal !== 0;
    const hasDebito = debitoVal !== null && debitoVal !== 0;

    if (hasDebito) {
      return { import: true, amount: Math.abs(debitoVal) };
    }
    if (hasCredito) {
      return { import: false, reason: "income_credit" };
    }
    return { import: false, reason: "no_amount" };
  }

  // B) Coluna Valor única
  const amountCol = mappingByField["amount"];
  if (amountCol) {
    const valorStr = cells[amountCol.csvIndex] ?? "";
    const v = parseLocalizedNumber(valorStr);
    if (v !== null && v !== 0) {
      if (sourceType === "credit_card") {
        // Cartão: polaridade por arquivo (maioria positiva => compras são positivas)
        const positiveIsPurchase = purchasesArePositive === true;
        if (positiveIsPurchase) {
          if (v > 0) return { import: true, amount: -Math.abs(v) };
          return { import: false, reason: "positive_value_cartao" };
        }
        if (v < 0) return { import: true, amount: v };
        return { import: false, reason: "positive_value_cartao" };
      }
      if (v < 0) {
        return { import: true, amount: Math.abs(v) };
      }
      return { import: false, reason: "income_positive_value" };
    }
    return { import: false, reason: "zero_value" };
  }

  return { import: false, reason: "no_amount" };
}

/**
 * Parse date from Excel serial number to ISO format (YYYY-MM-DD)
 * Excel epoch: December 30, 1899 (day 0)
 */
function parseExcelSerialDate(serial: number): string | null {
  if (serial < 1 || serial > 100000) return null;
  // Excel epoch is December 30, 1899 (not January 1, 1900)
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + serial * 86400000);
  if (isNaN(date.getTime())) return null;
  return formatDateISO(date);
}

/**
 * Parse date from various formats to ISO format (YYYY-MM-DD)
 * Supports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YY, DD-MM-YY
 * Also handles: Excel serial numbers, Date objects, strings with time
 * Validates ranges (day 1-31, month 1-12) before creating Date object
 */
export function parseDate(value: string | number | Date | null, dateFormat?: string): string | null {
  if (value === null || value === undefined) return null;
  
  // Handle Date objects
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return formatDateISO(value);
  }
  
  // Handle numbers (Excel serial dates)
  if (typeof value === "number") {
    return parseExcelSerialDate(value);
  }
  
  // Handle strings
  if (typeof value !== "string") return null;
  
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Remove all whitespace and normalize
  const normalized = trimmed.replace(/\s+/g, "");

  // Handle Excel serial dates (as string)
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const serial = parseFloat(normalized);
    const result = parseExcelSerialDate(serial);
    if (result) return result;
  }
  
  // Handle dates with time (extract date part first)
  // Examples: "14/11/2025 00:00:00", "2025-11-14 10:30:00"
  let datePartToParse = normalized;
  const dateTimeMatch = normalized.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  if (dateTimeMatch && normalized.length > dateTimeMatch[1].length) {
    // Has time component, extract just the date part
    datePartToParse = dateTimeMatch[1];
  }

  // Try to parse with detected format first
  // Priority: DD/MM/YYYY (most common in Brazil) -> DD-MM-YYYY -> YYYY-MM-DD -> others
  const formats = [
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ["day", "month", "year"] },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ["day", "month", "year"] },
    { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ["year", "month", "day"] },
    { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ["year", "month", "day"] },
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ["day", "month", "year2"] },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{2})$/, order: ["day", "month", "year2"] },
  ];

  for (const fmt of formats) {
    const match = datePartToParse.match(fmt.regex);
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

      // Validate ranges before creating Date
      const day = parts.day;
      const month = parts.month;
      const year = parts.year;

      if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) {
        continue; // Invalid ranges, try next format
      }

      // Create date and validate it's correct (handles invalid dates like 31/02)
      const date = new Date(year, month - 1, day);
      if (
        !isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      ) {
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

const INVOICE_OR_CARD_KEYWORDS = [
  "fatura", "cartão", "cartao", "credito", "crédito", "credit card", "invoice",
];

/**
 * Normalize string for case-insensitive matching (NFD, lowercase, trim).
 */
function normalizeForMatch(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Returns true if the row context (description + cell values) indicates
 * a credit card / invoice statement line (e.g. fatura, cartão, invoice).
 */
export function isInvoiceOrCard(rowContext: string): boolean {
  const normalized = normalizeForMatch(rowContext);
  return INVOICE_OR_CARD_KEYWORDS.some((kw) => normalized.includes(normalizeForMatch(kw)));
}

const EXPLICIT_EXPENSE_VALUES = [
  "expense", "saída", "saida", "débito", "debito", "debit", "d", "despesa", "gasto", "outgoing",
];

/**
 * Parses a cell value mapped as transaction type/nature.
 * App só controla despesas: retorna EXPENSE ou null.
 */
export function parseExplicitTransactionType(cellValue: string): "EXPENSE" | null {
  const v = normalizeForMatch((cellValue || "").trim());
  if (!v) return null;
  if (EXPLICIT_EXPENSE_VALUES.some((x) => v === x || v.startsWith(x + " ") || v.endsWith(" " + x))) return "EXPENSE";
  return null;
}

export interface ClassifyTransactionParams {
  rowContext: string;
  rawAmount: number;
  explicitType?: "EXPENSE" | null;
}

export interface ClassifyTransactionResult {
  kind: "EXPENSE";
  amountNormalized: number;
}

/**
 * Toda transação importada é despesa. Retorna amount normalizado (positivo) para persistir como negativo.
 */
export function classifyTransaction(params: ClassifyTransactionParams): ClassifyTransactionResult {
  const { rawAmount } = params;
  const amountNormalized = Math.abs(rawAmount);
  return { kind: "EXPENSE", amountNormalized };
}

/**
 * Check if a line is a summary/total line in credit card statements
 */
function isCardStatementSummaryLine(cells: string[], rawLine: string): boolean {
  const joinedCells = cells.join(" ").trim().toLowerCase();
  const joinedLower = rawLine.toLowerCase();
  
  // Check against card-specific summary patterns
  for (const pattern of CARD_STATEMENT_SUMMARY_PATTERNS) {
    if (pattern.test(joinedCells) || pattern.test(joinedLower)) {
      return true;
    }
  }
  
  // Check if all cells are numbers and sum-like (likely a total row)
  const numericCells = cells.filter(c => {
    const cleaned = c.trim().replace(/[R$\s.,]/g, "");
    return /^\d+$/.test(cleaned);
  });
  if (numericCells.length >= 2 && numericCells.length === cells.filter(c => c.trim()).length) {
    // All cells are numbers - likely a total/summary row
    return true;
  }
  
  return false;
}

/**
 * Check if a line is a non-transaction line (header, informational, etc.)
 */
function isNonTransactionLine(cells: string[], rawLine: string, sourceType?: "bank_account" | "credit_card"): { skip: boolean; reason?: string } {
  const joinedCells = cells.join(" ").trim();
  const nonEmptyCells = cells.filter(c => c.trim() !== "");
  
  // Empty line
  if (nonEmptyCells.length === 0) {
    return { skip: true, reason: "Linha vazia" };
  }
  
  // For credit card, check card-specific summary patterns first
  if (sourceType === "credit_card" && isCardStatementSummaryLine(cells, rawLine)) {
    return { skip: true, reason: "Linha de resumo/total (fatura de cartão)" };
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

function isLikelyDate(str: string | number | Date): boolean {
  if (str instanceof Date) return true;
  if (typeof str === "number") {
    // Check if it's an Excel serial date
    if (str > 1 && str < 100000 && str % 1 === 0) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + str * 86400000);
      return !isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100;
    }
    return false;
  }
  const trimmed = String(str).trim();
  return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed) ||
         /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(trimmed);
}

const CREDIT_CARD_POLARITY_SAMPLE_SIZE = 200;

/** Headers that indicate a date column (card statements). */
const CARD_DATE_HEADER_PATTERNS = /^(data|date|dia|dt|mov|movimenta|vencimento|lan[cç]amento|compra|transa)/i;

/**
 * Infer date column for credit card import when mapping has no date.
 * 1) By header (data, date, lançamento, dt, mov, compra, vencimento, transa…)
 * 2) By content: first 50 rows, column whose values parse as date (DD/MM/YYYY, YYYY-MM-DD, Excel serial).
 */
function inferDateColumnForCard(
  lines: string[],
  separator: string,
  startIndex: number,
  headers: string[],
  mappingByField: Record<string, ColumnMapping>
): ColumnMapping | null {
  const usedIndices = new Set(Object.values(mappingByField).map(m => m.csvIndex));
  const numCols = Math.max(...lines.slice(startIndex, startIndex + 5).map(l => l.split(separator).length), headers.length);

  for (let i = 0; i < numCols; i++) {
    if (usedIndices.has(i)) continue;
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (CARD_DATE_HEADER_PATTERNS.test(h)) {
      const csvColumn = headers[i] ?? `Coluna ${i + 1}`;
      if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
        const samples = lines.slice(startIndex, startIndex + 3).map(l => {
          const cells = l.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
          return cells[i] ?? "";
        });
        console.log("[CSV Import Credit Card] Date column inferred by header:", { column: csvColumn, index: i, sampleValues: samples });
      }
      return { csvColumn, csvIndex: i, internalField: "date", confidence: 0.85 };
    }
  }

  const sampleLimit = Math.min(50, lines.length - startIndex);
  for (let col = 0; col < numCols; col++) {
    if (usedIndices.has(col)) continue;
    let matchCount = 0;
    for (let r = startIndex; r < startIndex + sampleLimit && r < lines.length; r++) {
      const cells = lines[r].split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
      const val = cells[col] ?? "";
      if (!val.trim()) continue;
      const parsed = parseDate(val);
      if (parsed) matchCount++;
    }
    if (matchCount >= 3) {
      const csvColumn = headers[col] ?? `Coluna ${col + 1}`;
      if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
        const samples = lines.slice(startIndex, startIndex + 3).map(l => {
          const cells = l.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
          return cells[col] ?? "";
        });
        console.log("[CSV Import Credit Card] Date column inferred by content:", { column: csvColumn, index: col, sampleValues: samples });
      }
      return { csvColumn, csvIndex: col, internalField: "date", confidence: 0.7 };
    }
  }
  return null;
}

/**
 * Parse date for card statement. Supports DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, YYYY-MM-DD, Date object, Excel serial.
 * Returns "YYYY-MM-DD" or null.
 */
function parseCardDate(raw: string | number | Date | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return formatDateISO(raw);
  }
  if (typeof raw === "number") return parseExcelSerialDate(raw);
  const trimmed = String(raw).trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return null;
  return parseDate(trimmed);
}

/**
 * For credit card import: ensure columnMappings includes a date column (inferred if missing).
 * Call after analysis so the mapping step shows the date column.
 */
export function ensureCreditCardDateMapping(
  csvContent: string,
  mappings: ColumnMapping[],
  separator: string,
  hasHeader: boolean
): ColumnMapping[] {
  if (mappings.some(m => m.internalField === "date")) return mappings;
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  const startIndex = hasHeader ? 1 : 0;
  const headerLine = lines[0] ?? "";
  const headers = headerLine.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of mappings) mappingByField[m.internalField] = m;
  const inferred = inferDateColumnForCard(lines, separator, startIndex, headers, mappingByField);
  if (inferred) return [...mappings, inferred];
  return mappings;
}

/**
 * Detect polarity for credit card statement: whether purchases appear as positive or negative.
 * Samples up to 200 rows with non-zero amount and non-empty description; if majority is positive,
 * purchasesArePositive = true (import amount > 0 as expense; ignore amount < 0).
 */
function computeCreditCardPolarity(
  lines: string[],
  separator: string,
  startIndex: number,
  mappingByField: Record<string, ColumnMapping>,
  hasCreditoDebitoColumns: boolean
): { purchasesArePositive: boolean; posCount: number; negCount: number } {
  const amountCol = mappingByField["amount"];
  const descCol = mappingByField["description"];
  const creditoCol = mappingByField["credito"] ?? mappingByField["entrada"];
  const debitoCol = mappingByField["debito"] ?? mappingByField["saida"];

  let posCount = 0;
  let negCount = 0;
  const limit = Math.min(startIndex + CREDIT_CARD_POLARITY_SAMPLE_SIZE, lines.length);

  for (let i = startIndex; i < limit; i++) {
    const line = lines[i];
    const cells = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
    const skipCheck = isNonTransactionLine(cells, line, "credit_card");
    if (skipCheck.skip) continue;

    let rawAmount: number | null = null;
    if (hasCreditoDebitoColumns && (creditoCol || debitoCol)) {
      const debitoStr = debitoCol ? cells[debitoCol.csvIndex] ?? "" : "";
      const creditoStr = creditoCol ? cells[creditoCol.csvIndex] ?? "" : "";
      const d = parseLocalizedNumber(debitoStr);
      const c = parseLocalizedNumber(creditoStr);
      if (d !== null && d !== 0) rawAmount = -Math.abs(d);
      else if (c !== null && c !== 0) rawAmount = Math.abs(c);
    } else if (amountCol) {
      const v = parseLocalizedNumber(cells[amountCol.csvIndex] ?? "");
      if (v !== null && v !== 0) rawAmount = v;
    }
    if (rawAmount === null || rawAmount === 0) continue;

    const description = descCol ? cells[descCol.csvIndex] ?? "" : "";
    if (!description.trim()) continue;

    if (rawAmount > 0) posCount++;
    else negCount++;
  }

  const purchasesArePositive = posCount >= negCount;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    console.log("[CSV Import Credit Card] Polarity:", {
      purchasesArePositive,
      posCount,
      negCount,
    });
  }
  return { purchasesArePositive, posCount, negCount };
}

/**
 * Parse CSV content into rows with the given column mappings
 * Toda linha importada vira despesa (amount negativo).
 * sourceType === "credit_card": negativos são compras (aceitos), positivos são pagamentos/estornos (descartados).
 */
export function parseCSVWithMappings(
  csvContent: string,
  mappings: ColumnMapping[],
  separator: string,
  hasHeader: boolean,
  dateFormat?: string,
  hasEntradaSaida?: boolean,
  sourceType: "bank_account" | "credit_card" = "bank_account",
  /** Quando a coluna categoria está vazia ou não mapeada, usar esta (fixa ou custom:<uuid>). */
  defaultCategory?: string
): ParsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  const startIndex = hasHeader ? 1 : 0;
  const results: ParsedRow[] = [];

  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of mappings) {
    mappingByField[m.internalField] = m;
  }

  if (sourceType === "credit_card" && !mappingByField["date"]) {
    const headerLine = lines[0] ?? "";
    const headers = headerLine.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
    const inferredDate = inferDateColumnForCard(lines, separator, startIndex, headers, mappingByField);
    if (inferredDate) {
      mappingByField["date"] = inferredDate;
      mappings.push(inferredDate);
    }
  }

  const entradaCol = mappingByField["entrada"];
  const saidaCol = mappingByField["saida"];
  const creditoCol = mappingByField["credito"];
  const debitoCol = mappingByField["debito"];
  const hasCreditoDebitoColumns = !!(entradaCol || saidaCol || creditoCol || debitoCol);

  let purchasesArePositive: boolean | undefined;
  if (sourceType === "credit_card") {
    const polarity = computeCreditCardPolarity(
      lines,
      separator,
      startIndex,
      mappingByField,
      hasCreditoDebitoColumns
    );
    purchasesArePositive = polarity.purchasesArePositive;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
    
    // Check if this is a non-transaction line (pass sourceType for card-specific checks)
    const skipCheck = isNonTransactionLine(cells, line, sourceType);
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
    const notesCol = mappingByField["notes"];
    const transactionTypeCol = mappingByField["transaction_type"];

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

    const rowContext = `${description} ${cells.join(" ")}`.trim();

    const expenseCheck = shouldImportAsExpense(
      cells,
      mappingByField,
      hasCreditoDebitoColumns,
      sourceType,
      purchasesArePositive
    );

    if (!expenseCheck.import) {
      const reason =
        expenseCheck.reason === "positive_value_cartao"
          ? "Pagamento ou estorno ignorado"
          : expenseCheck.reason === "income_credit" || expenseCheck.reason === "income_positive_value"
            ? (sourceType === "bank_account" ? "Entrada ignorada (conta corrente)" : "Entrada ignorada — app controla apenas gastos")
            : expenseCheck.reason === "no_amount"
              ? "Valor não encontrado"
              : expenseCheck.reason === "zero_value"
                ? "Valor zero"
                : "Não importável";
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "SKIPPED",
        parsed: null,
        errors: [],
        reason,
      });
      continue;
    }

    const amount = expenseCheck.amount ?? null;
    if (amount === null || amount === 0) {
      errors.push("Valor não encontrado");
    }

    // Parse date - NEVER default to today silently
    // Extract date value (can be string, number, or Date object from XLSX)
    let dateRaw: string | number | Date | null = null;
    if (dateCol) {
      const rawCell = cells[dateCol.csvIndex];
      if (rawCell !== undefined && rawCell !== null && rawCell !== "") {
        dateRaw = rawCell.trim().replace(/^["']|["']$/g, "");
      }
    }
    
    // Debug logging for credit_card mode (first 5 rows)
    if (sourceType === "credit_card" && i < startIndex + 5 && dateCol) {
      console.log(`[CSV Import Credit Card] Row ${i + 1}:`, {
        rowIndex: i + 1,
        dateRaw: dateRaw,
        dateType: typeof dateRaw,
        dateColumnIndex: dateCol.csvIndex,
        dateColumnName: dateCol.csvColumn,
        allCells: cells.slice(0, 5), // First 5 cells for context
      });
    }
    
    // For credit_card mode use parseCardDate (DD/MM/YYYY, with time, Excel serial, Date object)
    let transaction_date: string | null = null;
    if (dateRaw) {
      if (sourceType === "credit_card") {
        transaction_date = parseCardDate(dateRaw);
        if (!transaction_date && typeof dateRaw === "string") {
          const numStr = dateRaw.trim().replace(/[^\d.]/g, "");
          if (dateRaw.includes(",") && !dateRaw.includes(".")) {
            const n = parseFloat(dateRaw.replace(/[^\d]/g, ""));
            if (!isNaN(n)) transaction_date = parseCardDate(n);
          } else if (/^\d+(\.\d+)?$/.test(numStr)) {
            const n = parseFloat(numStr);
            if (n > 1 && n < 100000) transaction_date = parseCardDate(n);
          }
        }
        if (transaction_date && i < startIndex + 5) {
          console.log(`[CSV Import Credit Card] Row ${i + 1}: date parsed -> ${transaction_date}`);
        }
      } else {
        transaction_date = parseDate(dateRaw, dateFormat);
      }
    }
    
    // Track if date is missing or invalid
    let dateWarning: string | null = null;
    let requiresDateConfirmation = false;
    
    if (!transaction_date) {
      if (dateRaw && String(dateRaw).trim()) {
        // Date column exists but value is invalid
        errors.push(`Data inválida: "${dateRaw}"`);
        if (sourceType === "credit_card" && i < startIndex + 5) {
          console.warn(`[CSV Import Credit Card] Row ${i + 1}: Failed to parse date "${dateRaw}"`);
        }
      } else {
        // No date value at all
        dateWarning = "Data não encontrada no extrato";
        requiresDateConfirmation = true;
        if (sourceType === "credit_card" && i < startIndex + 5) {
          console.warn(`[CSV Import Credit Card] Row ${i + 1}: No date column or empty date value`);
        }
      }
    }

    // Parse category: CSV value → mapping; senão defaultCategory (fixa ou custom:<uuid>); senão inferência
    const categoryStr = categoryCol ? cells[categoryCol.csvIndex]?.toLowerCase()?.trim() : "";
    const category: string =
      (categoryStr && categoryMapping[categoryStr]) ||
      defaultCategory ||
      inferCategory(description);


    // Notes
    const notes = notesCol ? cells[notesCol.csvIndex] : undefined;

    // Determine final status - date errors are critical now
    const hasDateError = !transaction_date && (errors.some(e => e.includes("Data inválida")) || requiresDateConfirmation);
    const hasAmountError = amount === null || amount === 0;
    
    if (hasDateError && !hasAmountError) {
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
    } else if (!hasAmountError && transaction_date && amount !== null) {
      // For credit_card: amount from shouldImportAsExpense is already final (negative)
      // For bank_account: normalize to negative (expense)
      const finalAmount =
        sourceType === "credit_card" ? amount : -Math.abs(amount);
      results.push({
        rowIndex: i + 1,
        raw: line,
        status: "OK",
        parsed: {
          description: description.substring(0, 255),
          amount: finalAmount,
          type: "EXPENSE",
          category,
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


export interface ImportTransactionsOptions {
  /** Optional account (bank) to link all imported transactions to. */
  accountId?: string | null;
  /** Optional credit card to link all imported transactions to (when CSV is card statement). */
  creditCardId?: string | null;
  /** Original filename for audit (inferred institution). */
  originalFilename?: string | null;
  /** Source type: determines which fields are required/allowed */
  sourceType?: "bank_account" | "credit_card";
}

/**
 * Import transactions via edge function.
 * Falls back to direct Supabase insert if edge function is unavailable.
 * When options.accountId or options.creditCardId are set, all imported rows are linked to that account/card.
 */
export async function importTransactions(
  householdId: string,
  transactions: ParsedRow[],
  skipDuplicates = true,
  options?: ImportTransactionsOptions
): Promise<ImportResult> {
  const sourceType = options?.sourceType ?? "bank_account";
  // Sanitize parsed transactions to ensure only valid fields are sent
  const validTransactions = transactions
    .filter(t => t.parsed !== null && t.status === "OK")
    .map(t => {
      const parsed = t.parsed!;
      // Cartão: sempre enviar amount negativo (gasto). App trata despesa = amount < 0.
      const amount =
        sourceType === "credit_card"
          ? parsed.amount > 0
            ? -Math.abs(parsed.amount)
            : parsed.amount
          : parsed.amount;
      return {
        description: parsed.description,
        amount,
        category: parsed.category,
        status: parsed.status,
        transaction_date: parsed.transaction_date,
        notes: parsed.notes,
        import_hash: parsed.import_hash,
        // Explicitly exclude: payment_method, type (not in schema)
      };
    });

  if (validTransactions.length === 0) {
    return {
      imported: 0,
      duplicates: 0,
      failed: transactions.filter(t => t.status === "ERROR").length,
      errors: [{ row: 0, reason: "Nenhuma transação válida para importar" }],
    };
  }

  // Try edge function first — always send defaultAccountId/defaultCardId so backend applies to all rows
  try {
    const defaultAccountId = sourceType === "credit_card" ? null : (options?.accountId ?? null);
    const defaultCardId = sourceType === "credit_card" ? (options?.creditCardId ?? null) : null;
    
    const body: Record<string, unknown> = {
      householdId,
      transactions: validTransactions,
      skipDuplicates,
      defaultAccountId,
      defaultCardId,
      originalFilename: options?.originalFilename ?? null,
      sourceType: sourceType,
    };

    const { data, error } = await supabase.functions.invoke("import-csv", {
      body,
    });

    if (error) {
      console.warn("[CSV Import] Edge function indisponível, usando importação direta:", error.message);
      return await directImport(householdId, validTransactions, skipDuplicates, options);
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
    return await directImport(householdId, validTransactions, skipDuplicates, options);
  }
}

/** Shape used when sending to edge function or direct insert (sem type). */
type TransactionForImport = {
  description: string;
  amount: number;
  category: string;
  status: "paid" | "pending";
  transaction_date: string;
  notes?: string;
  import_hash?: string;
};

/**
 * Direct import fallback when edge function is unavailable.
 * Inserts transactions directly via Supabase client.
 */
async function directImport(
  householdId: string,
  transactions: TransactionForImport[],
  skipDuplicates: boolean,
  options?: ImportTransactionsOptions
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
  const sourceType = options?.sourceType ?? "bank_account";
  // Apply sourceType rules: credit_card requires creditCardId and null accountId, bank_account allows accountId and null creditCardId
  const accountId = sourceType === "credit_card" ? null : (options?.accountId ?? null);
  const creditCardId = sourceType === "credit_card" ? (options?.creditCardId ?? null) : null;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx) continue;

    // Cartão: sempre gravar como gasto (amount negativo).
    let normalizedAmount = tx.amount;
    let dedupHash = tx.import_hash ?? null;
    if (sourceType === "credit_card") {
      normalizedAmount = -Math.abs(normalizedAmount);
      if (!dedupHash) {
        dedupHash = generateImportHash(tx.transaction_date, normalizedAmount, tx.description);
      }
    } else {
      // Bank account: normalize to negative
      normalizedAmount = -Math.abs(normalizedAmount);
      if (!dedupHash) {
        dedupHash = generateImportHash(tx.transaction_date, normalizedAmount, tx.description);
      }
    }

    if (skipDuplicates && dedupHash && existingHashes.has(dedupHash)) {
      result.duplicates++;
      continue;
    }

    // Construct insert object with only valid schema fields
    const insertObj = {
      user_id: user.id,
      household_id: householdId,
      description: tx.description.substring(0, 255),
      amount: normalizedAmount,
      category: tx.category || "other",
      status: tx.status || "paid",
      transaction_date: tx.transaction_date,
      notes: tx.notes ? tx.notes.substring(0, 500) : null,
      is_recurring: false,
      account_id: accountId,
      credit_card_id: creditCardId,
      created_at: now,
      updated_at: now,
    };
    
    // Sanitize to ensure no extra fields (e.g., payment_method) are included
    // This is a safety guard against schema cache errors
    const sanitized = sanitizeTransactionForInsert(insertObj);
    toInsert.push(sanitized);
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
 * CSV Template - Standard format for bank account
 */
export const CSV_TEMPLATE_HEADER = "data,descricao,tipo,valor,categoria,conta";

/**
 * CSV Template - Credit card format
 */
export const CSV_TEMPLATE_HEADER_CREDIT_CARD = "data,descricao,tipo,valor,categoria";

export const CSV_TEMPLATE_EXAMPLES = [
  "2026-01-16,Supermercado Pão de Açúcar,EXPENSE,350.50,food,Conta Corrente",
  "2026-01-17,Uber - corrida trabalho,EXPENSE,25.90,transport,Conta Corrente",
];

export const CSV_TEMPLATE_EXAMPLES_CREDIT_CARD = [
  "2026-01-16,Supermercado Pão de Açúcar,EXPENSE,350.50,food",
  "2026-01-17,Uber - corrida trabalho,EXPENSE,25.90,transport",
];

/**
 * Generate the standard CSV template for download
 */
export function generateCSVTemplate(sourceType: "bank_account" | "credit_card" = "bank_account"): string {
  if (sourceType === "credit_card") {
    const instructions = [
      "# MODELO CSV PADRÃO - CasaClara (Cartão de Crédito)",
      "# Este é o formato ideal para importação de faturas de cartão",
      "#",
      "# CAMPOS:",
      "#   data: formato YYYY-MM-DD (ex: 2026-01-15) ou DD/MM/YYYY",
      "#   descricao: texto descritivo da transação",
      "#   tipo: EXPENSE (app controla apenas despesas)",
      "#   valor: valor da despesa (ex: 150.50)",
      "#   categoria: food, transport, bills, leisure, health, education, shopping, other",
      "#",
      "# REMOVA estas linhas de comentário antes de importar",
      "#",
    ];
    
    return [
      ...instructions,
      CSV_TEMPLATE_HEADER_CREDIT_CARD,
      ...CSV_TEMPLATE_EXAMPLES_CREDIT_CARD,
    ].join("\n");
  }
  
  const instructions = [
    "# MODELO CSV PADRÃO - CasaClara (Conta Corrente)",
    "# Este é o formato ideal para importação de transações",
    "#",
    "# CAMPOS:",
    "#   data: formato YYYY-MM-DD (ex: 2026-01-15) ou DD/MM/YYYY",
    "#   descricao: texto descritivo da transação",
    "#   tipo: EXPENSE (app controla apenas despesas)",
    "#   valor: valor da despesa (ex: 150.50)",
    "#   categoria: food, transport, bills, leisure, health, education, shopping, other",
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
export function downloadCSVTemplate(sourceType: "bank_account" | "credit_card" = "bank_account"): void {
  const content = generateCSVTemplate(sourceType);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sourceType === "credit_card" 
    ? "modelo_importacao_cartao_casaclara.csv" 
    : "modelo_importacao_conta_casaclara.csv";
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
 * Parse a standard format CSV directly (skip AI analysis).
 * sourceType === "credit_card": polaridade detectada por arquivo (maioria positiva => compras positivas).
 */
export function parseStandardCSV(csvContent: string, sourceType: "bank_account" | "credit_card" = "bank_account"): ParsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  if (lines.length < 2) return [];
  
  const results: ParsedRow[] = [];

  let purchasesArePositive: boolean | undefined;
  if (sourceType === "credit_card") {
    let posCount = 0;
    let negCount = 0;
    const limit = Math.min(1 + CREDIT_CARD_POLARITY_SAMPLE_SIZE, lines.length);
    for (let i = 1; i < limit; i++) {
      const cells = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
      if (cells.length < 4) continue;
      const [, description, , valorStr] = cells;
      const rawAmount = parseLocalizedNumber(valorStr);
      if (rawAmount === null || rawAmount === 0 || !(description || "").trim()) continue;
      if (rawAmount > 0) posCount++;
      else negCount++;
    }
    purchasesArePositive = posCount >= negCount;
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
      console.log("[CSV Import Credit Card] Polarity (standard CSV):", {
        purchasesArePositive,
        posCount,
        negCount,
      });
    }
  }

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
    
    // CSV format: data,descricao,tipo,valor,categoria,conta (forma_pagamento removido)
    const [dateStrRaw, description, typeStr, valorStr, categoryStr, contaStr] = cells;
    
    // Clean date string (remove quotes, trim whitespace)
    const dateStr = (dateStrRaw || "").trim().replace(/^["']|["']$/g, "");
    
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
    
    const rawAmount = parseLocalizedNumber(valorStr);
    if (rawAmount === null || rawAmount === 0) {
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

    if (sourceType === "credit_card") {
      // Cartão: polaridade por arquivo
      const positiveIsPurchase = purchasesArePositive === true;
      if (positiveIsPurchase && rawAmount < 0) {
        results.push({
          rowIndex: i + 1,
          raw: line,
          status: "SKIPPED",
          parsed: null,
          errors: [],
          reason: "Pagamento ou estorno ignorado",
        });
        continue;
      }
      if (!positiveIsPurchase && rawAmount > 0) {
        results.push({
          rowIndex: i + 1,
          raw: line,
          status: "SKIPPED",
          parsed: null,
          errors: [],
          reason: "Pagamento ou estorno ignorado",
        });
        continue;
      }
      // else: (positiveIsPurchase && rawAmount > 0) or (!positiveIsPurchase && rawAmount < 0) => import
    } else {
      // bank_account: só sinal — amount < 0 => SAÍDA (importar), amount > 0 => ENTRADA (ignorar)
      if (rawAmount > 0) {
        results.push({
          rowIndex: i + 1,
          raw: line,
          status: "SKIPPED",
          parsed: null,
          errors: [],
          reason: "Entrada ignorada (conta corrente)",
        });
        continue;
      }
      // rawAmount < 0 => importar como saída (manter negativo)
    }

    // For credit_card: final amount by polarity (already decided above)
    // For bank_account: saída = manter negativo
    const finalAmount =
      sourceType === "credit_card"
        ? purchasesArePositive
          ? -Math.abs(rawAmount)
          : rawAmount
        : -Math.abs(rawAmount);

    const category: string = categoryMapping[categoryStr?.toLowerCase() || ""] ||
                             inferCategory(description) ||
                             "other";

    results.push({
      rowIndex: i + 1,
      raw: line,
      status: "OK",
      parsed: {
        description: description.substring(0, 255) || "Transação importada",
        amount: finalAmount,
        type: "EXPENSE",
        category,
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
  tipo: "EXPENSE";
  valor: number;
  categoria: string;
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
  
  const converted: ConvertedTransaction[] = parsedRows.map(row => {
    if (row.status === "OK" && row.parsed) {
      const parsed = row.parsed;
      return {
        data: parsed.transaction_date,
        descricao: parsed.description,
        tipo: "EXPENSE",
        valor: Math.abs(parsed.amount),
        categoria: parsed.category,
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
        status: "ERROR" as const,
        reason: row.reason || row.errors[0],
        originalRow: row.raw,
      };
    }
  });
  
  const ok = converted.filter(c => c.status === "OK");
  const totalExpense = ok.reduce((sum, c) => sum + c.valor, 0);
  
  return {
    converted,
    summary: {
      total: converted.length,
      ok: ok.length,
      skipped: converted.filter(c => c.status === "SKIPPED").length,
      errors: converted.filter(c => c.status === "ERROR").length,
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
      `${t.data},${escapeCsvField(t.descricao)},${t.tipo},${t.valor.toFixed(2)},${t.categoria},${t.conta || ""}`
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
