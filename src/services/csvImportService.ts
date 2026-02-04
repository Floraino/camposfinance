import { supabase } from "@/integrations/supabase/client";
import type { CategoryType } from "@/components/ui/CategoryBadge";

export interface ColumnMapping {
  csvColumn: string;
  csvIndex: number;
  internalField: string;
  confidence: number;
}

export interface CSVAnalysis {
  separator: string;
  encoding: string;
  dateFormat: string;
  currencyFormat: string;
  hasHeader: boolean;
  columnMappings: ColumnMapping[];
  sampleRows: Record<string, string>[];
}

export interface ParsedRow {
  rowIndex: number;
  raw: string;
  parsed: {
    description: string;
    amount: number;
    category: CategoryType;
    payment_method: "pix" | "boleto" | "card" | "cash";
    status: "paid" | "pending";
    transaction_date: string;
    notes?: string;
    import_hash?: string;
  } | null;
  errors: string[];
  isDuplicate?: boolean;
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
};

const paymentMapping: Record<string, "pix" | "boleto" | "card" | "cash"> = {
  "pix": "pix", "boleto": "boleto",
  "cartão": "card", "cartao": "card", "card": "card",
  "crédito": "card", "credito": "card",
  "débito": "card", "debito": "card",
  "dinheiro": "cash", "cash": "cash",
  "espécie": "cash", "especie": "cash",
};

/**
 * Analyze CSV content using AI
 */
export async function analyzeCSV(csvContent: string): Promise<CSVAnalysis> {
  const { data, error } = await supabase.functions.invoke("analyze-csv", {
    body: { csvContent, sampleSize: 30 },
  });

  if (error) {
    throw new Error(`Erro ao analisar CSV: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as CSVAnalysis;
}

/**
 * Parse Brazilian number format to float
 * Accepts: "1.234,56", "1234,56", "1234.56", "R$ 1.234,56", "-123,45", "(123,45)"
 */
export function parseLocalizedNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;

  let str = String(value).trim();
  
  // Handle parentheses as negative
  const isNegativeParens = str.startsWith("(") && str.endsWith(")");
  if (isNegativeParens) {
    str = str.slice(1, -1);
  }

  // Remove currency symbols and spaces
  str = str.replace(/[R$€£¥\s]/gi, "");

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
 * Parse CSV content into rows with the given column mappings
 */
export function parseCSVWithMappings(
  csvContent: string,
  mappings: ColumnMapping[],
  separator: string,
  hasHeader: boolean,
  dateFormat?: string
): ParsedRow[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  const startIndex = hasHeader ? 1 : 0;
  const results: ParsedRow[] = [];

  const mappingByField: Record<string, ColumnMapping> = {};
  for (const m of mappings) {
    mappingByField[m.internalField] = m;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ""));
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

    // Parse amount
    const amountStr = amountCol ? cells[amountCol.csvIndex] : "";
    const amount = parseLocalizedNumber(amountStr);
    if (amount === null) {
      errors.push(`Valor inválido: "${amountStr}"`);
    }

    // Parse date
    const dateStr = dateCol ? cells[dateCol.csvIndex] : "";
    let transaction_date = parseDate(dateStr, dateFormat);
    if (!transaction_date) {
      transaction_date = formatDateISO(new Date()); // Default to today
      if (dateStr) {
        errors.push(`Data não reconhecida: "${dateStr}" (usando data atual)`);
      }
    }

    // Parse category
    const categoryStr = categoryCol ? cells[categoryCol.csvIndex]?.toLowerCase() : "";
    let category: CategoryType = categoryMapping[categoryStr] || inferCategory(description);

    // Parse payment method
    const paymentStr = paymentCol ? cells[paymentCol.csvIndex]?.toLowerCase() : "";
    let payment_method = paymentMapping[paymentStr] || inferPaymentMethod(description);

    // Notes
    const notes = notesCol ? cells[notesCol.csvIndex] : undefined;

    if (amount !== null && errors.filter(e => !e.includes("data atual")).length === 0) {
      // Determine if expense or income based on sign
      // Most bank CSVs use negative for expenses
      const finalAmount = amount > 0 ? -Math.abs(amount) : amount;

      results.push({
        rowIndex: i + 1,
        raw: line,
        parsed: {
          description: description.substring(0, 255),
          amount: finalAmount,
          category,
          payment_method,
          status: "paid",
          transaction_date,
          notes: notes?.substring(0, 500),
          import_hash: generateImportHash(transaction_date, finalAmount, description),
        },
        errors: errors.filter(e => e.includes("data atual")).length > 0 ? errors : [],
      });
    } else {
      results.push({
        rowIndex: i + 1,
        raw: line,
        parsed: null,
        errors: errors.length > 0 ? errors : ["Não foi possível processar esta linha"],
      });
    }
  }

  return results;
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
 * Import transactions via edge function
 */
export async function importTransactions(
  householdId: string,
  transactions: ParsedRow[],
  skipDuplicates = true
): Promise<ImportResult> {
  const validTransactions = transactions
    .filter(t => t.parsed !== null)
    .map(t => t.parsed);

  if (validTransactions.length === 0) {
    return {
      imported: 0,
      duplicates: 0,
      failed: transactions.length,
      errors: [{ row: 0, reason: "Nenhuma transação válida para importar" }],
    };
  }

  const { data, error } = await supabase.functions.invoke("import-csv", {
    body: { householdId, transactions: validTransactions, skipDuplicates },
  });

  if (error) {
    throw new Error(`Erro na importação: ${error.message}`);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as ImportResult;
}
