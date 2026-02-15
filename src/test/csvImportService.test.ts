import { describe, it, expect } from "vitest";
import {
  parseLocalizedNumber,
  parseDate,
  inferCategory,
  inferPaymentMethod,
  generateImportHash,
  parseCSVWithMappings,
  isStandardFormat,
  parseStandardCSV,
  isInvoiceOrCard,
  parseExplicitTransactionType,
  classifyTransaction,
  shouldImportAsExpense,
  type ColumnMapping,
} from "@/services/csvImportService";

// =============================================
// 1) parseLocalizedNumber
// =============================================
describe("parseLocalizedNumber", () => {
  it("parses Brazilian format (1.234,56)", () => {
    expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
  });

  it("parses simple Brazilian comma decimal (123,45)", () => {
    expect(parseLocalizedNumber("123,45")).toBe(123.45);
  });

  it("parses US format (1,234.56)", () => {
    expect(parseLocalizedNumber("1,234.56")).toBe(1234.56);
  });

  it("parses R$ prefix", () => {
    expect(parseLocalizedNumber("R$ 1.234,56")).toBe(1234.56);
  });

  it("parses negative with minus", () => {
    expect(parseLocalizedNumber("-123,45")).toBe(-123.45);
  });

  it("parses negative with parentheses", () => {
    expect(parseLocalizedNumber("(123,45)")).toBe(-123.45);
  });

  it("returns null for empty/null", () => {
    expect(parseLocalizedNumber("")).toBe(null);
    expect(parseLocalizedNumber(null)).toBe(null);
  });

  it("returns null for text values", () => {
    expect(parseLocalizedNumber("Entrada (R$)")).toBe(null);
    expect(parseLocalizedNumber("Descrição")).toBe(null);
  });

  it("handles number input directly", () => {
    expect(parseLocalizedNumber(42.5)).toBe(42.5);
  });
});

// =============================================
// 2) parseDate
// =============================================
describe("parseDate", () => {
  it("parses DD/MM/YYYY", () => {
    expect(parseDate("15/01/2026")).toBe("2026-01-15");
  });

  it("parses DD-MM-YYYY", () => {
    expect(parseDate("15-01-2026")).toBe("2026-01-15");
  });

  it("parses YYYY-MM-DD", () => {
    expect(parseDate("2026-01-15")).toBe("2026-01-15");
  });

  it("parses DD/MM/YY (2-digit year)", () => {
    expect(parseDate("15/01/26")).toBe("2026-01-15");
  });

  it("returns null for empty/invalid", () => {
    expect(parseDate("")).toBe(null);
    expect(parseDate(null)).toBe(null);
    expect(parseDate("abc")).toBe(null);
  });
});

// =============================================
// 3) inferCategory
// =============================================
describe("inferCategory", () => {
  it("detects food from 'supermercado'", () => {
    expect(inferCategory("Supermercado Pão de Açúcar")).toBe("food");
  });

  it("detects transport from 'uber'", () => {
    expect(inferCategory("UBER *TRIP")).toBe("transport");
  });

  it("detects bills from 'internet'", () => {
    expect(inferCategory("Internet Vivo Fibra")).toBe("bills");
  });

  it("returns 'other' for unknown", () => {
    expect(inferCategory("XYZ Corp Payment")).toBe("other");
  });
});

// =============================================
// 4) inferPaymentMethod
// =============================================
describe("inferPaymentMethod", () => {
  it("detects pix", () => {
    expect(inferPaymentMethod("PIX Recebido")).toBe("pix");
  });

  it("detects card from 'cartão'", () => {
    expect(inferPaymentMethod("Cartão de Crédito")).toBe("card");
  });

  it("defaults to pix for unknown", () => {
    expect(inferPaymentMethod("Transferência")).toBe("pix");
  });
});

// =============================================
// 5) generateImportHash (deduplication)
// =============================================
describe("generateImportHash", () => {
  it("produces same hash for same data", () => {
    const a = generateImportHash("2026-01-15", -123.45, "Test");
    const b = generateImportHash("2026-01-15", -123.45, "Test");
    expect(a).toBe(b);
  });

  it("produces different hashes for different data", () => {
    const a = generateImportHash("2026-01-15", -123.45, "Test");
    const b = generateImportHash("2026-01-16", -123.45, "Test");
    expect(a).not.toBe(b);
  });
});

// =============================================
// 6) isStandardFormat
// =============================================
describe("isStandardFormat", () => {
  it("recognizes standard CSV header", () => {
    const csv = "data,descricao,tipo,valor,categoria,forma_pagamento,conta\n2026-01-15,Test,EXPENSE,100,other,pix,";
    expect(isStandardFormat(csv)).toBe(true);
  });

  it("rejects non-standard format", () => {
    const csv = "Date;Description;Amount\n2026-01-15;Test;100";
    expect(isStandardFormat(csv)).toBe(false);
  });
});

// =============================================
// 7) parseStandardCSV
// =============================================
describe("parseStandardCSV", () => {
  it("parses a valid standard CSV (all as expense)", () => {
    const csv = [
      "data,descricao,tipo,valor,categoria,forma_pagamento,conta",
      "2026-01-15,Supermercado,EXPENSE,350.50,food,card,Conta Corrente",
      "2026-01-16,Outro,EXPENSE,100.00,other,pix,Conta Corrente",
    ].join("\n");

    const rows = parseStandardCSV(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("OK");
    expect(rows[0].parsed?.description).toBe("Supermercado");
    expect(rows[0].parsed?.amount).toBe(-350.50);
    expect(rows[0].parsed?.type).toBe("EXPENSE");
    expect(rows[1].parsed?.amount).toBe(-100);
    expect(rows[1].parsed?.type).toBe("EXPENSE");
  });

  it("marks rows with invalid dates as ERROR", () => {
    const csv = [
      "data,descricao,tipo,valor,categoria,forma_pagamento,conta",
      ",Compra sem data,EXPENSE,100,other,pix,",
    ].join("\n");

    const rows = parseStandardCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ERROR");
  });
});

// =============================================
// 8) isInvoiceOrCard + classifyTransaction (fatura/cartão vs sinal)
// =============================================
describe("isInvoiceOrCard", () => {
  it("returns true for context containing fatura", () => {
    expect(isInvoiceOrCard("Compra Supermercado Fatura Nubank")).toBe(true);
    expect(isInvoiceOrCard("FATURA")).toBe(true);
  });

  it("returns true for context containing cartão/credit card/invoice", () => {
    expect(isInvoiceOrCard("Cartão de Crédito")).toBe(true);
    expect(isInvoiceOrCard("Credit Card Statement")).toBe(true);
    expect(isInvoiceOrCard("Invoice 123")).toBe(true);
  });

  it("returns false for normal bank description", () => {
    expect(isInvoiceOrCard("PIX recebido João")).toBe(false);
    expect(isInvoiceOrCard("Transferência Conta Corrente")).toBe(false);
  });
});

describe("classifyTransaction", () => {
  it("always returns EXPENSE with amountNormalized = abs(rawAmount)", () => {
    expect(classifyTransaction({ rowContext: "Fatura", rawAmount: 100 })).toEqual({ kind: "EXPENSE", amountNormalized: 100 });
    expect(classifyTransaction({ rowContext: "Fatura", rawAmount: -100 })).toEqual({ kind: "EXPENSE", amountNormalized: 100 });
    expect(classifyTransaction({ rowContext: "PIX", rawAmount: 50 })).toEqual({ kind: "EXPENSE", amountNormalized: 50 });
    expect(classifyTransaction({ rowContext: "Supermercado", rawAmount: -50 })).toEqual({ kind: "EXPENSE", amountNormalized: 50 });
  });

  it("explicitType EXPENSE is applied", () => {
    const r = classifyTransaction({
      rowContext: "Any",
      rawAmount: 100,
      explicitType: "EXPENSE",
    });
    expect(r.kind).toBe("EXPENSE");
    expect(r.amountNormalized).toBe(100);
  });
});

// =============================================
// 9) parseCSVWithMappings (single amount - só gastos)
// =============================================
describe("parseCSVWithMappings with single amount", () => {
  it("valor positivo => descartado, valor negativo => importado como gasto", () => {
    const csv = [
      "Data;Descrição;Valor;Categoria",
      "10/01/2026;PIX recebido;250,00;Outros",
      "11/01/2026;Supermercado;-50,00;Alimentação",
    ].join("\n");

    const mappings: ColumnMapping[] = [
      { csvColumn: "Data", csvIndex: 0, internalField: "date", confidence: 0.95 },
      { csvColumn: "Descrição", csvIndex: 1, internalField: "description", confidence: 0.95 },
      { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 },
      { csvColumn: "Categoria", csvIndex: 3, internalField: "category", confidence: 0.8 },
    ];

    const rows = parseCSVWithMappings(csv, mappings, ";", true, "dd/MM/yyyy", false);
    expect(rows).toHaveLength(2);

    expect(rows[0].status).toBe("SKIPPED");
    expect(rows[0].reason).toContain("Entrada ignorada");

    expect(rows[1].status).toBe("OK");
    expect(rows[1].parsed?.type).toBe("EXPENSE");
    expect(rows[1].parsed?.amount).toBe(-50);
  });
});

// =============================================
// 10) parseCSVWithMappings (Entrada/Saída)
// =============================================
describe("parseCSVWithMappings with Entrada/Saída", () => {
  it("linha só com entrada => descartada, linha com saída => importada", () => {
    const csv = [
      "Data;Histórico;Entrada (R$);Saída (R$);Saldo",
      "05/01/2026;Salário;5.000,00;;10.000,00",
      "06/01/2026;Supermercado;;350,50;9.649,50",
    ].join("\n");

    const mappings: ColumnMapping[] = [
      { csvColumn: "Data", csvIndex: 0, internalField: "date", confidence: 0.95 },
      { csvColumn: "Histórico", csvIndex: 1, internalField: "description", confidence: 0.95 },
      { csvColumn: "Entrada (R$)", csvIndex: 2, internalField: "entrada", confidence: 0.95 },
      { csvColumn: "Saída (R$)", csvIndex: 3, internalField: "saida", confidence: 0.95 },
    ];

    const rows = parseCSVWithMappings(csv, mappings, ";", true, "dd/MM/yyyy", true);
    expect(rows).toHaveLength(2);

    expect(rows[0].status).toBe("SKIPPED");
    expect(rows[0].reason).toContain("Entrada ignorada");

    expect(rows[1].status).toBe("OK");
    expect(rows[1].parsed?.type).toBe("EXPENSE");
    expect(rows[1].parsed?.amount).toBe(-350.50);
    expect(rows[1].parsed?.description).toBe("Supermercado");
  });
});

// =============================================
// 11) shouldImportAsExpense
// =============================================
describe("shouldImportAsExpense", () => {
  const cells = (arr: string[]) => arr;

  it("crédito=250, débito vazio => descartado (income_credit)", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "PIX", "250,00", ""]),
      {
        credito: { csvColumn: "Crédito", csvIndex: 2, internalField: "credito", confidence: 0.95 },
        debito: { csvColumn: "Débito", csvIndex: 3, internalField: "debito", confidence: 0.95 },
      } as Record<string, ColumnMapping>,
      true
    );
    expect(r.import).toBe(false);
    expect(r.reason).toBe("income_credit");
  });

  it("débito=29,90 => importado amount=29.90", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Loja", "", "29,90"]),
      {
        credito: { csvColumn: "Crédito", csvIndex: 2, internalField: "credito", confidence: 0.95 },
        debito: { csvColumn: "Débito", csvIndex: 3, internalField: "debito", confidence: 0.95 },
      } as Record<string, ColumnMapping>,
      true
    );
    expect(r.import).toBe(true);
    expect(r.amount).toBe(29.9);
  });

  it("débito=-29,90 => importado amount=29.90", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Loja", "", "-29,90"]),
      {
        credito: { csvColumn: "Crédito", csvIndex: 2, internalField: "credito", confidence: 0.95 },
        debito: { csvColumn: "Débito", csvIndex: 3, internalField: "debito", confidence: 0.95 },
      } as Record<string, ColumnMapping>,
      true
    );
    expect(r.import).toBe(true);
    expect(r.amount).toBe(29.9);
  });

  it("valor=1500 => descartado (income_positive_value)", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Salário", "1.500,00"]),
      { amount: { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 } } as Record<string, ColumnMapping>,
      false
    );
    expect(r.import).toBe(false);
    expect(r.reason).toBe("income_positive_value");
  });

  it("valor=-99,90 => importado amount=99.90", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Compra", "-99,90"]),
      { amount: { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 } } as Record<string, ColumnMapping>,
      false
    );
    expect(r.import).toBe(true);
    expect(r.amount).toBe(99.9);
  });

  it("crédito=10 débito=20 => importado (gasto)", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Ajuste", "10", "20"]),
      {
        credito: { csvColumn: "Crédito", csvIndex: 2, internalField: "credito", confidence: 0.95 },
        debito: { csvColumn: "Débito", csvIndex: 3, internalField: "debito", confidence: 0.95 },
      } as Record<string, ColumnMapping>,
      true
    );
    expect(r.import).toBe(true);
    expect(r.amount).toBe(20);
  });

  it("valor=(99,90) => importado amount=99.90", () => {
    const r = shouldImportAsExpense(
      cells(["10/01/2026", "Compra", "(99,90)"]),
      { amount: { csvColumn: "Valor", csvIndex: 2, internalField: "amount", confidence: 0.95 } } as Record<string, ColumnMapping>,
      false
    );
    expect(r.import).toBe(true);
    expect(r.amount).toBe(99.9);
  });
});
